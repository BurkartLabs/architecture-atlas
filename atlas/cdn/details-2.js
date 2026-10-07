// Details for the CDN plate, part 2: edge compute, content transformation and media, connection and protocol termination.
ATLAS.details("cdn", {
  "function-isolate-runtime": {
    s: "Runs customer code inside lightweight sandboxes that share one process, starting in well under a millisecond, so thousands of tenants' functions can execute on a single cache server.",
    d: "Instead of one process or virtual machine per function, the runtime hosts many isolated language contexts in a shared process, each with its own heap and no access to the filesystem or raw network. Code is a script or compiled module loaded on first request and kept warm. Calls into the host, such as fetch and cache access, go through a narrow, audited interface. It is hard because isolation inside a shared process depends on the runtime having no escapes, and noisy neighbors can still exhaust shared CPU and memory.",
    k: ["Shared-process isolates vs. per-function containers or virtual machines: isolates start in microseconds and pack densely, but rely on language-level isolation instead of hardware boundaries.", "Keeping code warm vs. loading per request: warm code answers fast, but memory is consumed by functions with no traffic, so eviction and cold starts return."],
    p: ["A side channel such as timing lets one tenant infer another tenant's data in the same process, so clocks are coarsened and sensitive tenants may need separation.", "A function that leaks memory across requests gets its isolate recycled mid-flight and surfaces as intermittent errors."],
    v: "Deploy a function that allocates beyond its limit and another that loops forever, and confirm each is terminated with a logged error, neighboring tenants' latency on the same server stays unchanged, and no host files or addresses are reachable.",
    dep: ["function-resource-limits","cache-server-process"]
  },
  "function-deployment-pipeline": {
    s: "Takes customer function code from upload through validation and compilation to global activation, with versions, bindings to storage and secrets, and a path to roll back.",
    d: "A deploy uploads source or a compiled module, which is checked for size and syntax, compiled, bound to the customer's settings such as secrets and storage namespaces, and distributed as a versioned artifact. Routes decide which requests invoke it. Gradual deployment sends a fraction of traffic to the new version. Rollback re-points routes to the prior artifact. It is hard because code is global state that executes in front of all traffic, secrets must reach servers without leaking into logs, and customers expect sub-minute global updates.",
    k: ["Immediate global activation vs. staged percentages: immediate matches developer expectations, while staging catches bad code but delays the fix when the change is urgent.", "Bundling dependencies at deploy vs. loading at runtime: bundling is predictable and fast, but large bundles slow cold starts and counts against size limits."],
    p: ["A secret passed as plain configuration shows up in logs or error messages visible to support staff.", "Two versions running side by side briefly write incompatible data to the same storage namespace."],
    v: "Deploy version 2 at ten percent, confirm roughly one in ten requests reports the new version header, then roll back and confirm all requests report version 1 within the stated propagation time.",
    dep: ["global-config-distribution","function-isolate-runtime"]
  },
  "function-resource-limits": {
    s: "Hard caps on CPU time, memory, subrequests, wall-clock time and bundle size per invocation, enforced by the runtime so one tenant cannot degrade the server for others.",
    d: "Each invocation gets a CPU budget measured in time on the processor, not elapsed time, a memory ceiling, a cap on outbound calls and a total duration. The runtime meters usage with timers and allocation hooks and aborts invocations that exceed a limit, returning an error to the client. Plans define different ceilings. It is hard because meters must be cheap enough to run always, limits must be generous enough for real code, and fairness during overload needs shedding rules.",
    k: ["Limiting CPU time vs. wall-clock time: CPU limits let functions wait on slow upstreams without penalty, but allow many idle invocations to hold memory.", "Hard abort vs. soft warnings: aborts guarantee protection, but customers learn about a limit only through production errors unless tooling previews usage."],
    p: ["A limit set from average usage kills legitimate rare requests, which exceed it by a small margin.", "Metering by sampling lets short bursts of heavy CPU escape the limit and starve neighbors."],
    v: "Run a function that burns CPU in a loop beyond its limit and confirm termination at the configured budget plus a small tolerance, with an error code and a usage line in the logs.",
    dep: ["cache-server-process"]
  },
  "function-outbound-requests": {
    s: "The controlled way customer code calls other services: subrequests to origins, the cache and the open internet, subject to caching, timeouts, loop protection and abuse limits.",
    d: "Functions fetch through a host interface that applies the customer's configuration: cache lookups, origin selection, and the same security checks as external requests. Calls to other hostnames on the network re-enter the pipeline with depth tracking to stop recursion. Limits cap concurrent and total subrequests, and destinations are filtered to block internal addresses. It is hard because outbound calls can be turned into an attack proxy, create loops through the network itself, and hide latency that the customer attributes to the platform.",
    k: ["Allowing arbitrary internet destinations vs. an allowlist: open access supports most use cases, but turns the edge into a reflector for abuse and server-side request forgery.", "Routing subrequests through the full pipeline vs. direct connections: the pipeline gives caching and protection, while direct calls are faster and skip protections."],
    p: ["A function calls its own hostname and creates a request loop that multiplies load until limits stop it.", "Internal addresses reachable from user-supplied URLs let a tenant probe the platform's private network."],
    v: "From a test function, fetch a cached URL, an origin URL, a private address and the function's own route, and confirm the first two succeed with correct cache status while the last two are refused with a loop or blocked-destination error.",
    dep: ["function-isolate-runtime","origin-connection-pooling","cache-key-construction"]
  },
  "edge-key-value-store": {
    s: "A globally readable store of small values that functions and rules can look up quickly at any site, optimized for many reads, infrequent writes and values that change slowly.",
    d: "Writes go to a central or regional authority and are replicated to every site, where reads are served from local memory or disk with a small cache in front. Values are small, such as feature flags, redirects or tokens, and keys are namespaced per customer. Reads typically complete in a millisecond or less after the first fetch. It is hard because propagation takes seconds to minutes, values may be stale, and customers use it for patterns it was not built for, such as counters.",
    k: ["Eventually consistent global reads vs. strongly consistent reads: eventual reads are fast everywhere, but a write is not visible immediately and concurrent writers can overwrite each other.", "Replicating all data to every site vs. fetching on demand and caching: full replication gives predictable local latency, while on-demand reduces storage but makes the first read slow."],
    p: ["Code that writes and immediately reads in another region sees the old value and misbehaves intermittently.", "Hot keys read by every request create cache stampedes against the authority after an update."],
    v: "Write a value, read it from three distant sites every second, and record when each returns the new value. Confirm all converge within the documented time and none ever returns a version older than one it already returned.",
    dep: ["kv-replication-and-consistency","function-isolate-runtime"]
  },
  "kv-replication-and-consistency": {
    s: "The machinery that copies key-value writes to every site and defines what readers may see in the meantime, including versioning, conflict rules and recovery of sites that missed updates.",
    d: "A write is assigned a version at the authority, appended to a replicated log or change feed, and streamed to regional relays and then to sites. Each site applies changes in order and tracks the highest version it has. Sites that were offline resume from their last version or take a snapshot. Optional coordination for single-writer needs routes updates for one key to one location. It is hard because ordering, backfill and deletion tombstones must all be right, and recovery after long partitions is rarely exercised.",
    k: ["Last-writer-wins vs. rejecting concurrent writes: last-writer-wins is simple and always accepts, but silently discards one update when two arrive together.", "Log-based replication vs. periodic full syncs: logs converge quickly and cheaply, but need compaction and careful catch-up, while full syncs are simple but slow and bandwidth heavy."],
    p: ["Deleted keys reappear when a stale site replays an old snapshot, because tombstones were purged too early.", "A single large write fan-out saturates a small site's link and delays everyone else's updates."],
    v: "Isolate one site for an hour while writing and deleting keys, reconnect it, and confirm it converges to the same contents as every other site, with deleted keys absent and the version counters equal.",
    dep: ["global-config-distribution"]
  },
  "image-and-asset-optimization": {
    s: "Resizes, recompresses and converts images, and minifies text assets, at the edge, producing the smallest acceptable variant for each client and caching the result.",
    d: "On a request with parameters or a policy, the edge fetches the original, decodes it, scales to the requested or detected dimensions, encodes to the best format the client supports and quality target, and caches that variant under its own key. Text assets can be minified or have unused parts removed. Dedicated processing pools keep this expensive work off cache servers. It is hard because CPU cost is high, variants multiply storage, and quality choices are subjective and must not damage images such as text or product photos.",
    k: ["On-demand transforms vs. pre-generated variants: on-demand needs no build step and adapts to new devices, but a first request is slow and an abusive range of parameters can exhaust CPU.", "Automatic quality selection vs. fixed settings: automatic saves bytes with no work, while fixed settings are predictable and avoid visible artifacts customers did not ask for."],
    p: ["Arbitrary width and height parameters let attackers generate endless variants that fill the cache and burn CPU.", "Stripping metadata also removes color profiles or orientation, so images show up faint or rotated."],
    v: "Request one large original as three widths and two formats, and confirm each response has the right dimensions, format and smaller byte size, a second request hits cache, and the key count equals the variants requested.",
    dep: ["content-negotiation","cache-key-construction"]
  },
  "content-negotiation": {
    s: "Chooses the representation of a resource to send, such as image format, language or compression, from request headers and client hints, while keeping cached variants correct.",
    d: "The edge reads signals such as the accept header, preferred language, device hints and connection quality, then selects a variant and normalizes the signals so they do not each create separate cache entries. The response declares which request headers affected the choice. For formats the origin does not produce, the edge can convert. It is hard because raw header values vary enormously between clients, naive varying destroys hit ratio, and incorrect assumptions serve unsupported formats to older clients.",
    k: ["Varying on the raw header vs. a normalized class: raw values are always correct but fragment the cache into thousands of copies, while classes keep hits at the risk of rare mismatches.", "Detecting from device databases vs. explicit hints: databases work for clients that send nothing, but age quickly, while hints are accurate when present and often absent."],
    p: ["Varying on the full user-agent string reduces the hit ratio to near zero for a popular page.", "A cached variant for a modern format is served to a client that cannot decode it because the vary signal was dropped."],
    v: "Send requests with ten different accept headers that map to two supported formats, and confirm only two cache entries exist, each client gets a format it declared and responses include the correct vary header.",
    dep: ["vary-handling","key-normalization"]
  },
  "response-compression": {
    s: "Compresses text-like responses on the fly or stores precompressed copies, choosing an encoding the client supports and balancing CPU against bytes saved.",
    d: "The edge picks an encoding from the client's accepted list, compresses compressible content types above a minimum size, and either caches each encoding separately or stores one form and converts. Higher compression levels save more bytes and cost more CPU, so levels are chosen by content and cacheability: slow, strong compression for objects served many times, fast for one-off responses. Already compressed formats are skipped. It is hard because of the cache-variant effect and because compressing secrets alongside attacker-controlled data can leak them.",
    k: ["Compress at the edge vs. store precompressed copies from the origin: edge compression works with any origin, while precompressed copies save edge CPU but need origin cooperation.", "Strong compression for cached objects vs. fast for dynamic: strong settings pay back across many requests, but waste CPU on responses used once."],
    p: ["Compressing a response that reflects user input next to a secret allows compression-ratio attacks to guess the secret.", "Double compression or a wrong content-encoding header makes clients show garbage."],
    v: "Fetch a large text object with and without the encoding header, and confirm the compressed response is smaller by the expected ratio, decodes to identical bytes and carries the correct encoding and vary headers.",
    dep: ["content-negotiation","cache-key-construction"]
  },
  "adaptive-streaming-segments": {
    s: "Delivers video as many small segment files at several quality levels, which cache like any other object and let the player switch quality as bandwidth changes.",
    d: "A video is encoded at multiple bitrates and cut into segments a few seconds long, with a playlist listing them. Players fetch segments in sequence and adapt. For the network, this means vast numbers of small, highly cacheable files with a long tail of rarely watched titles and a few extremely popular ones. Segment names and sizes are predictable, which lets caches prefetch. It is hard because storage hit ratio for the long tail is poor, bandwidth costs dominate, and one popular live event concentrates huge load on few objects.",
    k: ["Short segments vs. long segments: short segments lower latency and speed up quality switches, but multiply request counts and per-request overhead.", "Caching the whole library at the edge vs. keeping the long tail at upper tiers: edge caching of everything is costly, while tiering serves the head fast and the tail from fewer locations."],
    p: ["Segments requested with player-specific query parameters get separate cache keys and are never reused.", "A popular premiere makes every site request the same new segments from the origin simultaneously."],
    v: "Play a test stream through a site, and confirm the second player's segment requests are cache hits, the playlist and segments carry correct freshness headers and the player stays at the top quality without stalls.",
    dep: ["large-file-chunking","range-request-handling","cache-key-construction"]
  },
  "manifest-manipulation": {
    s: "Rewrites streaming playlists at the edge to filter quality levels, insert ads or personalize segments, serving small dynamic files that point to shared cached segments.",
    d: "The playlist is small and changes often, while the segments it names are large and immutable. The edge can generate or modify the playlist per viewer, for example removing renditions a device cannot play, adding alternate audio or splicing in ad segments, and still serve the media from cache. Playlists need short lifetimes during live streams and correct update timing. It is hard because personalization must not alter segment keys, token-protected URLs must be rewritten consistently, and mistakes break playback rather than showing an error.",
    k: ["Per-viewer manifests at the edge vs. at the origin: edge generation scales and stays close to the viewer, but needs the data and logic to be distributed.", "Rewriting segment URLs to embed tokens vs. using cookies or headers: URL tokens work with any player, but defeat caching unless the token is excluded from the key."],
    p: ["A rewritten playlist drops a required tag and players fail on one platform only.", "Personalized playlists cached under one shared key serve one viewer's ads to everyone."],
    v: "Request the same playlist as two device profiles and confirm each lists only compatible renditions, segment URLs are shared and cache-hit across both, and the player on each device plays without error.",
    dep: ["adaptive-streaming-segments","cache-key-construction","rule-engine"]
  },
  "low-latency-live-delivery": {
    s: "Delivers live video with a delay of a few seconds by serving partial segments as they are produced and holding playlist requests until new data exists.",
    d: "The packager publishes parts of a segment, as small as a fraction of a second, while it is still being produced. Players request a playlist with a blocking parameter and the server holds the response until the next part exists. The cache network must support requests for objects that are still growing, collapse the many identical blocking requests into one origin fetch, and propagate each part through the tiers within milliseconds. It is hard because every extra hop adds delay and cache collapsing windows must be tiny.",
    k: ["Chunked transfer of in-progress segments vs. waiting for complete files: chunked delivery cuts delay to seconds, but caches must handle partial objects and clients that arrive mid-file.", "Holding blocking requests at the edge vs. polling: holding avoids wasted requests and delay, but ties up connections and memory per viewer."],
    p: ["An edge caches an incomplete part as if complete and serves truncated video to later viewers.", "A hung blocking request is never released after an encoder restart and players freeze."],
    v: "Measure glass-to-glass delay with a timestamp burned into a test stream played through the network, confirming it stays under the target, and check origin sees one request per part regardless of viewer count.",
    dep: ["request-collapsing","tiered-caching-hierarchy","adaptive-streaming-segments"]
  },
  "signed-url-authorization": {
    s: "Restricts access to protected content using URLs or cookies that carry an expiry and a signature, validated at the edge without contacting the customer's servers.",
    d: "The customer's system generates a token containing path, expiry and optionally client address, signed with a shared secret or private key. The edge verifies the signature and expiry before touching the cache, and rejects invalid requests. The token must be excluded from the cache key, or every user would get a separate copy. Key rotation uses overlapping keys. It is hard because clock skew affects expiry, tokens leak through sharing and logs, and a mistake in key handling either blocks everyone or exposes everything.",
    k: ["Shared-secret signatures vs. public-key signatures: shared secrets are fast and simple, but the secret exists at every site, while public keys put only a verifier at the edge.", "Binding tokens to client address vs. leaving them portable: binding limits sharing, but breaks users who move between networks or sit behind rotating proxies."],
    p: ["The token is left in the cache key and the hit ratio for protected video collapses.", "A cached response is served to a request with an expired token because verification ran after the cache lookup."],
    v: "Request a protected object with a valid, expired, altered and missing token, and confirm only the valid one succeeds, all four share one cache entry, and rejections carry the expected status without reaching the origin.",
    dep: ["cache-key-construction","rule-engine"]
  },
  "prefetch-next-segments": {
    s: "Fetches upcoming video segments into the cache before any player has asked for them, predicting the sequence from the playlist or from the first request.",
    d: "When a player requests a segment, the edge infers the following segments from the naming pattern or playlist and starts fetching them from upper tiers or the origin, so the request arrives to a hit. For live streams, the cache can pull new parts as they are announced. Prefetch is bounded by per-stream budgets and canceled if the viewer leaves. It is hard because wrong predictions waste origin bandwidth, prefetch itself can create load spikes, and prefetched content can evict useful objects.",
    k: ["Prefetching only on demonstrated interest vs. prefetching aggressively: waiting for a viewer limits waste, while aggressive prefetch hides latency for the first viewers but costs for streams nobody watches.", "Prefetch from the shield tier vs. directly from the origin: using the shield reuses cached copies, while going to origin is fresher for live, but multiplies origin load."],
    p: ["Prefetching a rendition no player will ever select doubles origin traffic for no benefit.", "A prefetch burst at the start of a popular event looks like an attack to the customer's own protection."],
    v: "Start a new test stream and confirm segment N+1 is already in cache when the player requests it, origin request counts rise by exactly one per segment per site, and stopping playback stops prefetch within one segment.",
    dep: ["adaptive-streaming-segments","tiered-caching-hierarchy","admission-policy"]
  },
  "tls-handshake-termination": {
    s: "Negotiates the encrypted session with each client at the edge, choosing protocol version, cipher and certificate, and decrypting requests so the cache pipeline can read them.",
    d: "On the first message, the server reads the requested hostname, selects the certificate and key for it, picks a protocol version and ciphers from the customer's allowed set, and completes the handshake, using resumption to skip work for returning clients. Per-handshake public-key work dominates CPU on busy sites, so it is offloaded to dedicated hardware or batched. It is hard because customers disagree about the minimum protocol version, old clients must still connect, and the handshake is a favored target for floods.",
    k: ["Wide client compatibility vs. strict minimum versions: supporting old protocols keeps legacy clients connected, but exposes known weaknesses and is flagged by customer audits.", "Terminating at the edge vs. passing encrypted traffic through: termination enables caching and security, but the provider then holds the customer's keys and sees all content."],
    p: ["A cipher or version change breaks a customer's old payment terminals or embedded devices that nobody tested.", "Handshake CPU cost spikes during a connection flood and starves request processing on the same cores."],
    v: "Scan a hostname with clients of each supported protocol version and cipher, and confirm the negotiated parameters match the customer's policy, disallowed ones fail, and resumed connections skip the full key exchange.",
    dep: ["certificate-store-and-sni","private-key-isolation","session-ticket-key-rotation"]
  },
  "certificate-issuance": {
    s: "Obtains and renews publicly trusted certificates for customer hostnames automatically, proving control of each name to the issuing authority without customer action in most cases.",
    d: "When a hostname is onboarded, the platform requests a certificate through an automated protocol, proves control by publishing a token at a well-known path or in DNS, and receives a signed certificate. Renewal runs well before expiry. Customers can also upload their own certificates and keys. The platform tracks expiry, retries failures and alerts on stuck names. It is hard because validation can fail for reasons outside the platform's control, such as conflicting records or redirects, and issuers impose rate limits on volume.",
    k: ["Shared certificates listing many customers vs. one per customer: shared certificates are cheap and fast to issue, but expose the names of unrelated customers and tie them to one renewal.", "Platform-managed vs. customer-uploaded certificates: managed certificates renew without effort, while uploaded ones satisfy extended-validation or pinning needs but expire when nobody remembers."],
    p: ["A customer's DNS record blocks validation, and the hostname serves an expired certificate after the old one lapses.", "Issuer rate limits are hit during a mass migration and thousands of names wait days for certificates."],
    v: "Onboard a test hostname and confirm a trusted certificate is served within minutes. Force renewal and confirm the new certificate is served from every site before the old one expires, with no connection errors during the swap.",
    dep: ["domain-onboarding","dns-authoritative-servers"]
  },
  "certificate-store-and-sni": {
    s: "The distributed store that holds certificates for millions of hostnames and the lookup that picks the right one from the name the client announces in the handshake.",
    d: "Certificates are replicated to sites or fetched on demand and cached in memory, indexed by exact and wildcard hostname. During the handshake the server reads the server name indication, looks up the certificate chain, and responds. For clients that send no name, a default certificate or dedicated address is used. Chains must be complete and ordered correctly. It is hard because the namespace is enormous, lookups sit on the handshake critical path, and updates must reach every server without a restart.",
    k: ["Replicating all certificates everywhere vs. loading on demand: full replication gives constant, local lookup, while on-demand saves memory but adds a slow first handshake for rare names.", "Exact match first vs. wildcard first: exact first lets customers override wildcards with specific certificates, but needs two lookups for common names."],
    p: ["A chain missing an intermediate works in browsers that cache it and fails in API clients.", "A new certificate reaches most servers but not all, so some users see warnings until propagation finishes."],
    v: "Connect to a hostname with the correct name, a wildcard match, an unknown name and no name, and confirm each gets the intended certificate chain, validated by a strict client with no cached intermediates.",
    dep: ["certificate-issuance","global-config-distribution"]
  },
  "private-key-isolation": {
    s: "Keeps customers' private keys out of reach of the code that parses requests, by holding them in a separate process, protected hardware or a remote signing service.",
    d: "A key leak lets an attacker impersonate a customer, so keys are not loaded into the process that handles untrusted input. The handshake process sends the data to be signed to a key service that holds the key, often in secure hardware, and receives a signature. Some customers keep keys at their own site and sign remotely. Keys are encrypted at rest and distributed only to the sites that need them. It is hard because signing sits on the critical path of every handshake and must scale while staying isolated.",
    k: ["Keys in the serving process vs. a separate signing service: in-process is fastest, but a memory-disclosure bug can expose every key, while a separate service adds a hop and a new dependency.", "Provider-held keys vs. customer-held remote signing: customer-held keys satisfy strict compliance, but add latency and an availability dependency on the customer."],
    p: ["A signing service outage makes new handshakes fail everywhere even though the caches are healthy.", "Keys copied to every site for convenience widen the exposure far beyond the sites that serve that customer."],
    v: "Dump the memory of a serving process and confirm no private key material is present, while handshakes still complete, and confirm signing latency stays under its budget at peak handshake rates.",
    dep: []
  },
  "session-ticket-key-rotation": {
    s: "Rotates the secret keys that encrypt resumption tickets, on a short schedule shared by all servers that could receive a client's returning connection, so resumption works without long-lived secrets.",
    d: "A ticket carries session state encrypted under a ticket key. Any server holding the key can resume the session, so keys are generated centrally or derived from a shared seed and distributed to every server in a region. Keys rotate frequently, with the current key encrypting, and a few previous keys accepted for decryption. Compromise of an old key exposes sessions that used it, so the rotation interval bounds forward secrecy loss. It is hard because distribution must be reliable and secret across thousands of servers.",
    k: ["Short rotation interval vs. long: short intervals limit the harm from a stolen key, but reduce resumption rates for clients that return after the interval.", "Shared keys across a region vs. per-server keys: shared keys let any server resume the client, while per-server keys are safer but resumption fails when the load balancer sends the client elsewhere."],
    p: ["A key distribution failure leaves some servers on stale keys and resumption rates quietly drop, raising handshake CPU.", "Keys that never rotate defeat forward secrecy, which nobody notices until an audit."],
    v: "Resume a session across two servers in the same site before and after a rotation, and confirm resumption succeeds within the accepted window and fails after the old key is retired, with ticket key ages visible in metrics.",
    dep: ["tls-handshake-termination","private-key-isolation"]
  },
  "ocsp-stapling": {
    s: "Attaches a recent, signed statement of certificate validity to the handshake, so clients need not contact the certificate authority and revoked certificates are noticed.",
    d: "The server periodically fetches a validity response from the issuing authority for each certificate and sends it during the handshake. Responses are cached for days and refreshed ahead of expiry, with fallbacks when the authority is unreachable. Because millions of certificates need refreshing, fetches are spread out and shared across servers. It is hard because the authority's responders occasionally fail, stale or missing staples cause clients with strict policies to refuse the connection, and the volume of refreshes is large.",
    k: ["Fetching staples centrally and distributing vs. each server fetching: central fetching reduces load on the authority and is consistent, while per-server fetching is simpler but multiplies requests.", "Refreshing early vs. at expiry: early refresh survives responder outages, but wastes requests and renders responses more often."],
    p: ["An authority outage lets staples expire and strict clients refuse connections to otherwise healthy sites.", "A new certificate is served before its first staple is fetched, so early handshakes carry none."],
    v: "Inspect handshakes from several servers for a hostname and confirm each includes a stapled response whose validity period is current and whose remaining life never drops below the refresh margin.",
    dep: ["certificate-store-and-sni","tls-handshake-termination"]
  },
  "http2-multiplexing": {
    s: "Serves many concurrent requests over one client connection, with header compression and prioritization, while limiting the resources a single connection can consume.",
    d: "HTTP/2 splits a connection into streams that interleave frames, so a page's resources share one connection. The edge enforces limits on concurrent streams, header size, frame rates and window sizes, since a single connection can otherwise generate enormous work. Flow control is applied per stream and per connection, and prioritization hints guide which responses get bandwidth first. It is hard because abuse patterns that exploit stream resets and rapid frame sequences have repeatedly produced record-sized attacks from small numbers of connections.",
    k: ["High stream concurrency limits vs. low: high limits let pages load quickly, while low limits cap the damage from rapid-reset style abuse.", "Honoring client priorities vs. server-chosen order: honoring hints matches the browser's intentions, but trusting them lets one stream starve others, and hints are often inaccurate."],
    p: ["Resetting streams rapidly forces the server to start work it must cancel, multiplying cost without counting against concurrency limits.", "Head-of-line blocking at the transport layer stalls all streams when one packet is lost on a poor link."],
    v: "Open one connection and issue two hundred concurrent requests of mixed sizes, and confirm limits cap concurrency at the configured value, small responses finish ahead of large ones and a rapid-reset test is cut off by the abuse limit.",
    dep: ["tls-handshake-termination","request-parsing-and-normalization"]
  },
  "http3-and-quic": {
    s: "Serves HTTP over a transport built on datagrams, with per-stream loss recovery, faster handshakes and connections that survive a client changing networks.",
    d: "The edge listens for datagrams, runs the transport and encryption handshake together, and maps each request to an independent stream so one lost packet does not stall others. Clients learn the server supports it through an advertisement in earlier responses or a DNS record, then try it with a fallback to the older protocols. Connection identifiers let a session survive address changes. It is hard because routing datagrams to the right server needs identifier-aware load balancing, middleboxes drop datagram traffic, and the stack runs in user space and costs more CPU.",
    k: ["Enabling it by default vs. letting customers opt in: default enabling improves performance for most users, but exposes customers to a new stack and a new set of defenses to maintain.", "User-space transport vs. kernel offload: user space allows fast iteration and custom congestion control, while kernel offload saves CPU but changes slowly."],
    p: ["The load balancer hashes on the address tuple, so a client changing networks lands on a different server and the connection resets.", "Networks that block datagrams cause a delayed fallback that makes some users slower than before."],
    v: "Fetch a page by HTTP/3 from a test client, switch the client between two networks mid-download and confirm the transfer completes on the same connection, and confirm a client behind a datagram block falls back within the target delay.",
    dep: ["tls-handshake-termination","ecmp-and-l4-load-balancer","connection-flood-defense"]
  },
  "request-parsing-and-normalization": {
    s: "Reads each request strictly and converts it to a canonical form, rejecting malformed input that could be interpreted differently by the edge and the origin.",
    d: "The parser enforces limits on line, header and body sizes, rejects ambiguous framing such as conflicting length indicators, normalizes header names and case, resolves duplicate headers deterministically and decodes the URL path to a single form. Output feeds security rules, caching and routing, which must all see the same request. It is hard because disagreement between the edge and the origin about where a request ends is the root of smuggling attacks, and strictness breaks odd but real clients.",
    k: ["Rejecting ambiguous requests vs. repairing them: rejection is safe, while repair keeps odd clients working but risks the origin interpreting the repaired request differently.", "Normalizing before security rules vs. after: normalizing first lets rules see one form and stops evasion, while rules on raw input can detect obfuscation attempts."],
    p: ["Conflicting length headers pass through and the origin splits the stream differently, letting an attacker poison another user's response.", "Over-strict header limits reject legitimate large cookies and break one customer's login."],
    v: "Send a corpus of malformed and ambiguous requests including conflicting lengths, bad encodings and oversized headers, and confirm each is rejected or normalized per policy and none reaches a test origin in an altered form.",
    dep: []
  },
});
