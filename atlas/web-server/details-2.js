// Details for the web server plate, part 2: access control, static content, caching and response shaping.
ATLAS.details("web-server", {
  "ip-access-rules": {
    s: "Allows or denies requests by client network address using an ordered list of addresses and ranges, evaluated before content is produced.",
    d: "Rules are evaluated in order, with the first match deciding, and a default at the end. Address data is compiled into a prefix tree or sorted ranges so lookup cost does not grow with list size. The address checked is the connection's peer unless the real client address has been restored from a trusted proxy header or the proxy protocol. It is hard because the address is only as trustworthy as its source: a forwarded header from an untrusted client is forgeable, and a shared gateway address makes one rule cover many people.",
    k: ["Ordered first-match rules versus most-specific wins: first-match is simple to reason about, but order mistakes grant or deny more than intended.", "Trust forwarded headers only from listed proxies versus always: restricted trust prevents spoofing, but a new proxy tier requires configuration before it works."],
    p: ["The rule checks the forwarded header from any client, so an attacker supplies an allowed address and gets in.", "An allow list ends without a final deny, so unmatched clients are admitted."],
    v: "Send requests from an allowed address, a denied address and an address with a forged forwarded header, and confirm only the first succeeds, the others receive the forbidden status, and each decision is logged.",
    dep: ["proxy-protocol", "phase-pipeline"]
  },
  "basic-auth": {
    s: "Challenges for a username and password and checks them against a local credential file of salted password hashes, suitable for small private areas.",
    d: "The handler returns an authentication challenge when credentials are absent, then decodes the supplied pair and compares a hash of the password against the stored entry. Hash schemes are deliberately slow or salted, so verification is CPU work on the request path and is cached or rate limited. The file is read at load or on change. It is hard because credentials travel in every request in a reversible encoding and are only safe over encrypted connections, and because slow hashes let an attacker spend server CPU through repeated attempts.",
    k: ["Slow salted hashes versus fast hashes: slow hashes resist offline cracking of a stolen file, but each attempt costs CPU the server must protect.", "A file read at start versus checked per request: start-up reads are cheap, but a changed or revoked entry waits for a reload."],
    p: ["Credentials are accepted over a plain connection and captured on the network.", "Unlimited login attempts both allow guessing and let the hash computation consume all worker CPU."],
    v: "Request the protected path with no credentials, wrong credentials and valid ones, and confirm the statuses are challenge, challenge and success, then repeat wrong attempts rapidly and confirm they are throttled.",
    dep: ["rate-limiter", "tls-handshake", "phase-pipeline"]
  },
  "auth-subrequest": {
    s: "Delegates the allow or deny decision to an internal request to an authentication service, passing selected headers and using its status to admit or reject the original request.",
    d: "Before content is produced the server sends a bodyless subrequest to an auth endpoint carrying the original method, path and credentials such as a cookie or authorization header. A success status admits the request and can copy headers, such as the user identity, into it; a denial status is returned to the client. Results can be cached briefly. It is hard because the subrequest sits on the critical path of every request, so the auth service is a hard dependency and its latency is added to all traffic, and because identity headers returned must overwrite any the client supplied.",
    k: ["A call per request versus caching decisions: a call gives instant revocation, but adds latency and load; caching is fast but delays revocation.", "Fail closed when the auth service is unreachable versus fail open: closed is safe but makes an auth outage a site outage."],
    p: ["A client supplies its own identity header and the server forwards it alongside the auth service's, so the application reads the forged one.", "The auth service slows down and every request on the site waits for it."],
    v: "Stop the auth service and confirm requests receive the configured failure status; with it running, send a forged identity header and confirm the application sees only the value set by the auth response.",
    dep: ["proxy-handler", "header-manipulation", "upstream-timeouts"]
  },
  "token-validation": {
    s: "Verifies signed bearer tokens locally by checking signature, issuer, audience and expiry against configured keys, without calling the issuer on each request.",
    d: "The handler extracts a token from a header or cookie, parses its structure, selects a verification key by identifier from a configured or periodically fetched key set, checks the signature and compares claims against expected values and the current time with a small allowed skew. Valid claims can be exposed as variables for routing and logging. It is hard because key rotation must be followed without restarts, algorithm choice must be pinned so a token cannot select a weaker one, and local validation cannot see revocation before the token expires.",
    k: ["Local signature checks versus introspection calls: local checks are fast and need no dependency, but revoked tokens stay valid until they expire.", "Keys from configuration versus fetched from the issuer: fetched keys follow rotation automatically, but add a network dependency and a trust decision on the fetch."],
    p: ["The validator accepts the algorithm named in the token header, allowing an unsigned or downgraded token.", "Clock differences between hosts reject fresh tokens or accept expired ones."],
    v: "Present a valid token, an expired one, one with a wrong audience and one signed with another key, and confirm only the first is admitted; then rotate the signing key and confirm new tokens verify without a restart.",
    dep: ["phase-pipeline", "header-manipulation", "config-includes"]
  },
  "client-cert-auth": {
    s: "Admits requests based on the certificate a client presented during the handshake, using the verification result and fields of the certificate as the identity.",
    d: "After the handshake verifies the chain, the result and the subject, issuer, serial and fingerprint are made available as variables. Rules compare them to allow lists or pass them to the application in headers. Verification can be required, optional or off per site, and revocation is checked through lists or online status. It is hard because the identity must be passed to the application in a way clients cannot forge, and because requiring a certificate for one rule on a site that negotiated without one needs a renegotiation or a separate site.",
    k: ["Required at the handshake versus requested later on a path: handshake enforcement is simple and strong, but cannot vary by path without renegotiation.", "Pass the certificate in headers versus verify again in the application: headers are easy for the application, but any gap lets a client set its own."],
    p: ["Certificate identity headers are passed upstream without stripping client-supplied copies, so any client can claim any identity.", "Revocation is not checked, so a revoked certificate keeps working until it expires."],
    v: "Connect with a valid certificate, an expired one, one from another authority and none, and confirm only the valid one is admitted and the application sees the correct subject; then try a forged subject header.",
    dep: ["client-cert-verify", "header-manipulation", "phase-pipeline"]
  },
  "rate-limiter": {
    s: "Limits the request rate per key, such as client address or credential, using a counting scheme that allows bursts up to a bound and rejects or delays the excess.",
    d: "Each request computes a key and consults a shared table holding a counter or token state per key and the time of the last update. A leaky or token bucket admits requests at a sustained rate with a burst allowance, and excess requests are rejected with a retry status or delayed. The table is in shared memory so all workers see the same counts, with eviction of old keys. It is hard because the key space can be huge, shared counters are a contention point, and the right identity is not the connecting address when users sit behind a shared gateway.",
    k: ["Reject excess versus delay it: rejecting protects latency and tells clients to back off, but delaying smooths bursts for well-behaved clients at the cost of held connections.", "Shared zone across workers versus per-worker counters: a shared zone enforces the true rate, but adds locking, while per-worker limits are loose by the worker count."],
    p: ["A table sized too small evicts active keys, resetting their counts so abusers go unlimited.", "The key is the proxy's address, so one client's burst blocks everyone."],
    v: "Send requests at twice the configured rate from one key and confirm about half are rejected with the retry status after the burst, while a second key sending at the limit is unaffected.",
    dep: ["shared-memory-zones", "phase-pipeline", "ip-access-rules"]
  },
  "connection-limiter": {
    s: "Caps the number of simultaneous connections or in-flight requests per key, protecting workers and backends from clients that open many at once.",
    d: "A shared table counts active connections per key, incremented when a request or connection starts and decremented on close, and refuses new ones above the cap. A cap can also apply per site or per upstream to bound load. The difficulty is correct release: any path that fails to decrement, such as a worker crash, leaks a count, so the table is rebuilt or reconciled on worker restart, and HTTP/2 and HTTP/3 multiplex many streams over one connection so a connection count alone no longer bounds work.",
    k: ["Limit connections versus limit concurrent requests: connections are cheap to count, but multiplexed protocols need a request or stream limit as well.", "Hard refusal at the cap versus queuing: refusal is predictable and cheap, but a short spike gets errors that a bounded queue would have hidden."],
    p: ["A crashed worker never decrements its counts, so a key slowly becomes permanently blocked.", "The limit counts connections only, and one HTTP/2 connection carries hundreds of concurrent requests past it."],
    v: "Open more connections than the cap from one key and confirm the extras are refused with the configured status, then close them and confirm a new one is accepted and the table's count returns to zero.",
    dep: ["shared-memory-zones", "connection-state-machine", "h2-streams"]
  },
  "body-size-limits": {
    s: "Rejects requests whose declared or actual body exceeds a configured size, before the data is buffered or sent upstream.",
    d: "If a declared length is above the limit, the server answers with a too-large status without reading the body. For chunked or unlabeled bodies the count is kept as data arrives and the request is aborted when it crosses the limit. Limits are set per site or rule, since upload routes need larger ones than the rest. It is hard because enforcement must be on received bytes, not only the declared length, and because answering before the client has stopped sending can make the client see a reset rather than the status unless the connection is drained or closed cleanly.",
    k: ["Small default with large per-route exceptions versus a large global limit: a small default limits damage from abuse, but every upload route needs a deliberate setting.", "Reject on declared length versus reading to count: rejecting early saves bandwidth, but chunked bodies still have to be counted as they arrive."],
    p: ["Only the declared length is checked, so a chunked upload exceeds the limit and fills the buffer on disk.", "The server replies and closes while the client is still sending, and the client reports a connection reset instead of the status."],
    v: "Upload a body above the limit with a declared length and again as chunked, and confirm both are rejected with the too-large status without the upstream receiving the full body, and that a limit-sized body succeeds.",
    dep: ["http1-parser", "chunked-codec", "phase-pipeline"]
  },
  "static-handler": {
    s: "The content handler that maps a request to a file under a document root and returns it with the right headers, or a not-found, forbidden or redirect response.",
    d: "It resolves the path, checks that it names a regular file, picks a media type, evaluates conditional and range headers, sets validators and caching headers, and sends the body by the cheapest available route. Directories map to an index or a listing. Methods are restricted to read operations. It is hard because the handler touches the file system on every request, so metadata lookups, permission checks and symbolic link policy decide both its speed and its safety, and because file changes during transfer must not produce a corrupt response.",
    k: ["Serve straight from disk each time versus keeping files in server memory: disk with the operating system cache needs no invalidation, while memory copies are faster but go stale.", "Follow symbolic links versus refuse them: following allows flexible layouts, but a link can point outside the root."],
    p: ["A file replaced during a transfer yields a body that mixes old and new content, with a length that no longer matches.", "Hidden files such as version-control directories are served because nothing excludes them."],
    v: "Request files of several types and sizes and confirm the bytes match checksums of the originals, headers include validators and the right media type, and a request for a hidden or nonexistent file returns forbidden or not found.",
    dep: ["path-resolution", "mime-types", "sendfile-zero-copy", "range-requests", "conditional-requests"]
  },
  "index-listing": {
    s: "Chooses a default file for a directory request, and optionally generates a listing of its entries when no default exists.",
    d: "A request for a path ending in a slash is tried against an ordered list of index names; the first existing file is served through an internal redirect so rules for its type apply. Without a match the handler can produce a listing, sorted and escaped, or refuse. Listings read the directory on each request or from a cache. It is hard mainly because of exposure: a listing reveals file names that were never linked, including backups and drafts, and entry names must be escaped for the output format to avoid injection into the page.",
    k: ["Listings disabled by default versus enabled: disabled avoids accidental disclosure, but download areas must opt in per directory.", "Redirect to add a trailing slash versus serving directly: the redirect keeps relative links correct, but costs a round trip."],
    p: ["Enabling a listing on a broad path exposes backup files and archives that happen to sit in the tree.", "File names containing markup are written into the listing page without escaping."],
    v: "Request a directory with an index file, one without, and one with listings off, and confirm the index is served, the listing appears only where enabled and with escaped names, and the third returns forbidden.",
    dep: ["static-handler", "internal-redirects", "path-resolution"]
  },
  "path-resolution": {
    s: "Turns a request path into a file system path under the document root, decoding and normalizing it and rejecting any path that would escape the root or contain unsafe bytes.",
    d: "The path is percent-decoded once, dot segments and repeated separators are collapsed, and null bytes and unsupported separators are rejected before concatenating with the root. Symbolic link and case rules are applied according to policy. The resolved path is rechecked as being inside the root. It is hard because several layers decode and interpret paths differently: decoding twice, treating backslashes as separators on some platforms, or case-insensitive file systems make two different strings name one file, and checks done on one form are bypassed with another.",
    k: ["Normalize once at the start and reuse the result versus checking raw input at each use: a single canonical form removes disagreement between rules and handler, but every consumer must use it.", "Refuse symbolic links outside the root versus follow all: refusal prevents escapes, at the cost of legitimate layouts that link to shared storage."],
    p: ["A path decoded twice turns an encoded sequence into a dot segment after the check has passed.", "On a case-insensitive file system a rule written for a lowercase path is bypassed with different case."],
    v: "Request paths with encoded and doubled dot segments, null bytes, backslashes and mixed case against a root next to a secret file, and confirm none returns the secret and all are rejected or normalized as specified.",
    dep: ["location-matching"]
  },
  "sendfile-zero-copy": {
    s: "Hands a file descriptor and range to the kernel so file data goes from the page cache to the network without being copied through user space.",
    d: "Instead of reading into a buffer and writing it to the socket, the server asks the kernel to transfer a range of the file directly, handling short writes by retrying on writability events. With encrypted connections the data must be encrypted, so zero copy applies only where the kernel handles encryption, otherwise a read-encrypt-write path is used. Limits cap each call to keep one fast connection from monopolizing a loop. It is hard because large files on slow disks still block on read-ahead, and network file systems may not support it.",
    k: ["Kernel file transfer versus read and write in user space: kernel transfer saves copies and CPU, but is unavailable or less useful with user-space encryption.", "Cap bytes per call versus unlimited: a cap keeps the loop fair across connections, but adds iterations for large files."],
    p: ["A cold file on a slow disk blocks a loop thread on page faults, stalling unrelated connections.", "The file is truncated during transfer and the connection ends early without a visible error."],
    v: "Download a large cached file and confirm throughput near line rate with low server CPU, the same bytes by checksum, and with encryption enabled that the fallback path is used and still correct.",
    dep: ["event-notification", "write-backpressure", "thread-pool-offload"]
  },
  "range-requests": {
    s: "Serves one or more byte ranges of a file when the client asks, enabling resumed downloads and seeking in media, with correct status, length and boundary handling.",
    d: "The handler parses the range header, validates it against the current file size and any validator condition, then returns a partial-content status with the range and total length. Multiple ranges produce a multipart body with boundaries; unsatisfiable ranges return a range-not-satisfiable status. Ranges are only honored if the validator still matches the file. It is hard because of the edge cases: overlapping or tiny ranges can be abused to amplify work, suffix and open-ended forms must be computed carefully, and a file that changes between requests must not return mixed content.",
    k: ["Support multiple ranges versus only single: multiple ranges satisfy rare clients, but allow requests that are costly to build and abusive.", "Honor ranges only with a matching validator versus always: validator checks protect against changed files, but add a header the client must send correctly."],
    p: ["Thousands of tiny overlapping ranges in one request make the server build an enormous multipart response.", "A resume after the file changed returns bytes from a new version appended to the old, corrupting the download."],
    v: "Request the first, last, middle and suffix ranges and confirm each matches the corresponding bytes of the file, the length and range headers are correct, and an overlapping many-range request is refused or coalesced.",
    dep: ["static-handler", "conditional-requests", "http1-parser"]
  },
  "conditional-requests": {
    s: "Compares client-supplied validators with the file's current validators and answers not-modified or precondition-failed instead of sending the body.",
    d: "Responses carry an entity tag and a last-modified time derived from file metadata. Later requests send them back in conditional headers, and the server evaluates them in a defined order, returning a bodyless not-modified for reads or a precondition status for writes. Weak and strong comparison rules apply. It is hard because the validators must be stable and truthful: a tag built only from size and modification time can repeat across changes within a second, and tags differ across servers in a pool unless computed from content or metadata that is the same on all.",
    k: ["Tags from size and modification time versus content hash: metadata is free to compute, but a content hash is more precise and stable across servers at the cost of reading the file.", "Rely on modification time alone versus tags: modification time is simple, but one-second resolution misses quick changes."],
    p: ["Servers behind a balancer compute different tags for the same file, so every request that lands on a different server misses revalidation.", "Compression changes the body but not the tag, so clients treat different encodings as the same entity."],
    v: "Fetch a file, repeat with its validators and confirm a bodyless not-modified, touch the file and confirm a full response with new validators, and confirm two servers return identical tags for the same file.",
    dep: ["static-handler", "header-manipulation"]
  },
  "mime-types": {
    s: "Maps file extensions to media types and character sets, sets the content-type header, and controls whether browsers may guess differently.",
    d: "A table of extensions to media types loads at start, with a default for unknown ones, and text types receive a character set. The content-type header decides how a browser treats a response, and a protective header can disable guessing from the body. Compression and caching rules often key on the type. It is hard because the type is a security boundary: serving user-uploaded files with a type that executes in the browser on the site's own origin enables script injection, so user content needs either a safe type, a download disposition or a separate origin.",
    k: ["Type by extension versus by content sniffing in the server: extensions are cheap and predictable, but a misnamed file gets the wrong type.", "Disable browser sniffing versus allow it: disabling prevents execution of mislabeled content, but exposes the server's own labeling mistakes."],
    p: ["Uploaded files are served inline with their claimed type from the main origin, allowing stored script injection.", "Newer file extensions are missing from the table, so they are served as generic binary and browsers download instead of displaying them."],
    v: "Request files with common, new and unknown extensions and confirm the content-type and character set headers match expectations and that the no-sniffing header is present on every response.",
    dep: ["static-handler", "header-manipulation"]
  },
  "open-file-cache": {
    s: "Keeps descriptors and metadata for recently used files in memory with a short validity period, so repeated requests skip open, stat and directory lookups.",
    d: "Each worker holds a table keyed by path of open descriptors, sizes, modification times and lookup results, including not-found results, evicting least-recently used entries and rechecking after a validity interval. Hits avoid system calls on the hot path. It is hard because staleness is visible: a file replaced by rename is served in its old form until the entry expires, an unlinked file keeps its descriptor and disk space alive, and the cache multiplies descriptors by worker count against limits.",
    k: ["Cache not-found results versus not: negative entries save lookups for scanners and fallbacks, but a newly created file is invisible until expiry.", "Long validity versus short: long validity maximizes hits for stable assets, while short validity picks up deployments quickly."],
    p: ["A deployment replaces files by rename and old content is served for the validity period with no error to show why.", "Held descriptors of deleted files keep gigabytes of disk space allocated until they are evicted."],
    v: "Replace a file and confirm the old content is served until the configured validity passes and the new afterward; measure system calls per request and confirm they drop on repeated hits.",
    dep: ["static-handler", "fd-limits", "worker-supervision"]
  },
  "compression": {
    s: "Compresses eligible responses on the fly with a negotiated content coding, trading CPU for fewer bytes, with rules on type, size and level.",
    d: "The server inspects the client's accepted codings, the response type and size, then wraps the body in a compressor applied as chunks stream through the filter chain, setting the content-encoding header, adding a variance marker and removing the length. Compression level, minimum size, and allowed types are configured. It is hard because of cost and security: compressing every response burns CPU on already compressed data, and compression of secrets together with attacker-controlled content in one response can leak the secrets through size changes.",
    k: ["Higher compression level versus lower: higher levels save more bytes, but cost much more CPU per request for small additional gains.", "Compress at the proxy versus at the application: the proxy centralizes it and frees the application, but cannot see which parts of a body are sensitive."],
    p: ["Compressing already compressed images and archives wastes CPU and sometimes enlarges the body.", "A response that reflects user input next to a secret token is compressed, and the size reveals the token over many requests."],
    v: "Request a large text resource with and without accepting compression and confirm a smaller encoded body with the variance header on one and the plain body on the other, and that images are left unchanged.",
    dep: ["filter-chain", "header-manipulation", "precompressed-assets"]
  },
  "precompressed-assets": {
    s: "Serves a prebuilt compressed sibling of a static file when the client accepts that coding, avoiding any runtime compression cost.",
    d: "At build time each static asset is compressed at the highest level into a neighboring file. When a client accepts the coding and the sibling exists, the handler serves it with the encoding header and the original's media type, using the same validators scheme and range handling. This gives better ratios than runtime compression at no per-request CPU. It is hard because the sibling must stay in step with the original, and the extra variants need correct variance handling so shared caches do not store one encoding for all clients.",
    k: ["Precompressed files versus runtime compression: precompressed gives the best ratio at no CPU, but needs a build step and extra files that can go stale.", "Serve the sibling only if it is newer than the original versus always: the check prevents serving stale content, but costs a metadata lookup."],
    p: ["The original is updated but the compressed sibling is not, so clients with compression get old content.", "The variance header is missing, so a shared cache serves compressed bytes to a client that cannot decode them."],
    v: "Request an asset with each accepted coding and confirm the compressed sibling is returned with the right headers and decodes to the original bytes; then change the original and confirm the stale sibling is not served.",
    dep: ["static-handler", "conditional-requests", "compression"]
  },
  "cache-key": {
    s: "Defines what makes two requests the same cached object: normalized method, host, path and query, plus the request headers the response varies on.",
    d: "The key is built from a configured template over variables and from the headers named in the response's variance list, hashed into a fixed-size identifier. Normalization removes irrelevant differences such as parameter order or tracking parameters where configured. A key that is too narrow serves one user's response to another; one too wide fragments the cache. It is hard because variance must be honored exactly: ignoring it shares content that depends on a header, and honoring an unbounded header such as the user agent destroys the hit rate.",
    k: ["Include the full query string versus a normalized subset: full queries are always correct, but tracking parameters fragment the cache; normalizing needs care to not merge distinct content.", "Honor the variance header literally versus collapse values into classes: literal is safe, while classes raise hit rate but require knowing which values matter."],
    p: ["Personalized content is cached under a key without the cookie or authorization header, and one user receives another's page.", "A key containing a high-cardinality header yields almost no hits and fills the cache with copies."],
    v: "Request the same resource with two values of a varying header and confirm two cache entries, with parameter reordering confirmed to hit one entry, and an authenticated request confirmed not to be served from a shared entry.",
    dep: ["config-includes", "header-manipulation"]
  },
  "cache-store": {
    s: "Holds cached responses on disk with an index in shared memory, enforcing a size limit by evicting least recently used entries and supporting explicit purge.",
    d: "An index maps key hashes to metadata in a shared zone, and bodies live in files laid out in hashed directories. A manager process removes expired and excess entries, and a loader rebuilds the index at start. Writes go to temporary files and are renamed into place, so readers never see partial content. Purge removes entries by key or pattern. It is hard because the index and the files must agree, large bodies churn the disk, and eviction by one process must not remove a file another worker is sending.",
    k: ["Disk-backed with a memory index versus memory only: disk holds far more and survives restarts, but adds I/O and file handle use.", "Write to temporary files and rename versus write in place: rename gives readers atomic complete files, but needs both locations on one file system."],
    p: ["The temporary directory and cache directory are on different file systems, so atomic rename becomes a slow copy.", "A crash leaves index entries without files, so hits fail until the entries expire."],
    v: "Fill the cache beyond its limit and confirm it stays under the size cap with oldest entries removed, then restart and confirm remaining entries are hits, and purge a key and confirm the next request goes upstream.",
    dep: ["shared-memory-zones", "cache-key", "thread-pool-offload"]
  },
  "cache-revalidation": {
    s: "Decides how long a stored response is fresh, revalidates expired entries with conditional upstream requests, and may serve stale content while refreshing or when the upstream fails.",
    d: "Freshness comes from the response's cache directives or a configured default. When an entry expires, the server sends a conditional request with the stored validators and either refreshes the entry on a not-modified answer or replaces it. Stale entries can be served while the refresh runs in the background, or during upstream errors. It is hard because the rules about what may be cached are intricate: responses marked private or with credentials must not be shared, and serving stale during failure trades correctness for availability.",
    k: ["Serve stale while refreshing versus wait for fresh: stale-while-refresh keeps latency flat, but some users see old data for one interval.", "Serve stale on upstream error versus pass the error: stale keeps the site up in an outage, but may show outdated or wrong content with no indication."],
    p: ["A response intended for one user lacks a private marking and is stored and served to others.", "Stale content is served for hours during an outage that nobody notices because the error rate looks normal."],
    v: "Cache an object with a short lifetime, let it expire and confirm a conditional upstream request and a refreshed entry; then stop the upstream and confirm stale is served only where configured and marked in the cache status.",
    dep: ["cache-store", "upstream-request-build", "conditional-requests", "request-coalescing"]
  },
  "request-coalescing": {
    s: "Lets one request fetch a missing or expired object while concurrent requests for the same key wait for its result, preventing a stampede on the upstream.",
    d: "On a miss the first request takes a lock on the key and goes upstream; others either wait for it, up to a timeout, or are sent upstream without caching. When the response is stored, waiters are served from it. A background refresh uses the same lock. It is hard because waiting has costs and failure modes: a slow first fetch holds many clients, a failed or uncacheable response must release them to fetch individually, and the lock must be released if the worker holding it crashes.",
    k: ["Make others wait for the first fetch versus let all go upstream: waiting protects the backend from a stampede, but adds latency for every waiter on a slow fetch.", "Wait with a timeout and then proceed uncached versus wait indefinitely: a timeout bounds latency, but lets bursts through to the backend."],
    p: ["The first response is uncacheable, so waiting clients are released one at a time instead of together, serializing them.", "A worker holding the lock dies and waiters stall until the lock timeout."],
    v: "Expire a popular object and fire a hundred concurrent requests, and confirm the upstream receives one request, all clients get the same response, and a failed first fetch releases every waiter.",
    dep: ["cache-store", "shared-memory-zones", "upstream-timeouts"]
  },
  "header-manipulation": {
    s: "Adds, removes, replaces and conditionally sets request and response headers using fixed values and variables, including security headers and hop-by-hop cleanup.",
    d: "Directives apply at defined points: before the upstream request, on the response, and on every error. Operations are add, set, delete and append, with conditions on status or value. Hop-by-hop headers such as connection and transfer coding are removed when forwarding, and headers naming them are stripped too. It is hard because inheritance and status interact: a header set in an outer block may be lost in an inner one, may skip error responses unless declared to always apply, and duplicates have different meaning for list and single-value fields.",
    k: ["Set at the proxy versus in the application: the proxy gives uniform policy across applications, but may conflict with or duplicate what applications set.", "Apply on all statuses versus only success: all statuses protect error pages, but can alter responses meant to pass through unmodified."],
    p: ["A security header is set at the outer level and silently dropped on a rule that sets any other header of its own.", "Client-supplied hop-by-hop or identity headers are forwarded because nothing removes them."],
    v: "Request a success, a redirect and an error response and confirm the expected headers are present on all three with no duplicates, and that a client-sent identity header does not reach the upstream.",
    dep: ["phase-pipeline", "config-includes", "filter-chain"]
  },
  "response-filters": {
    s: "Transforms response bodies as they stream out, for example by substituting strings, adding or removing fragments, or chunk-encoding, with each filter passing buffers to the next.",
    d: "A filter receives a chain of buffers, may modify, split, hold or drop them, and passes the result on, with the last filter writing to the connection. Typical filters are range slicing, chunked encoding, compression, string substitution and trailers. Each must handle partial input: a pattern spanning two buffers must still match, and a filter that holds data back needs a flush on end. It is hard because filters change lengths, so validators, ranges and caches must be adjusted, and ordering determines correctness.",
    k: ["Streaming transformation versus buffer the whole body: streaming bounds memory and latency, but pattern matching across buffer boundaries needs state.", "Modify bodies at the edge versus leave unchanged: edge edits fix content without application changes, but break signatures, validators and ranges."],
    p: ["A substitution misses matches that straddle two buffers, so replacement works in testing and fails in production.", "A filter that changes the length leaves the original length header or validator, causing truncated or mismatched responses."],
    v: "Stream a body with the target string placed across a buffer boundary and confirm it is replaced, the length and validators are correct, and a range request on the filtered response is either correct or refused.",
    dep: ["filter-chain", "buffer-chains", "compression"]
  }
});
