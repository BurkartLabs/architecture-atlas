// Details for the error tracking plate, part 2: rate limiting, privacy, processing, symbolication.
ATLAS.details("error-tracking", {
  "rate-limiting": {
    s: "Per-key, per-project and per-organization ceilings on events per time window, enforced at ingest and communicated back to clients so they stop sending.",
    d: "Counters in a fast shared store track events per window for each scope, checked on every request. When a limit is exceeded the endpoint rejects with a retry-after hint, and the SDK pauses that data category. Limits exist at several levels: a key can be capped without affecting its project, and a project without affecting its organization. Different categories such as errors, attachments and sessions have separate limits. It is hard because counters must be cheap and approximately right across many nodes.",
    k: ["Approximate distributed counters vs exact ones: approximate counters are fast and local, but allow some overshoot, while exact counts need coordination on every request.", "Rejecting at ingest vs accepting then dropping: rejecting saves downstream work and tells the client to back off, but needs a cheap check on every request.", "Fixed window vs sliding window: fixed windows are simple, but allow a burst at each boundary."],
    p: ["Limit state held per node lets a project exceed its limit by the number of nodes.", "Rejecting without a retry hint makes SDKs retry immediately and sustain the flood."],
    v: "Send at three times a project's limit and confirm accepted events plateau near the limit, responses carry a retry-after value, and the SDK stops sending until it elapses.",
    dep: ["quota-accounting"]
  },
  "quota-accounting": {
    s: "Metering of accepted, filtered, sampled and dropped events per project and category, the numbers behind billing, limits and the usage reports.",
    d: "Each decision, accept, filter, rate-limit or drop, emits an outcome record with a reason code, which a consumer aggregates into per-interval counters. These counters drive quota decisions, usage charts and invoices. The central difficulty is agreement: the number the edge used to limit, the number billing charged and the number a user sees in a chart must reconcile, though they are computed at different points and times.",
    k: ["Counting outcomes at every drop point vs counting only stored events: outcome records explain where volume went, but add a write per event on every stage.", "Real-time counters for limiting vs delayed accurate counters for billing: real-time is approximate and fast, billing needs exactness and tolerates delay."],
    p: ["Events dropped by a stage that forgets to emit an outcome vanish from reports and billing.", "Charging for events later dropped in processing leads to disputes."],
    v: "Send one thousand events of which one hundred are filtered and two hundred rate-limited, and confirm the usage report shows seven hundred accepted, one hundred filtered, two hundred limited, equal to the billing figure.",
    dep: ["rollup-counters"]
  },
  "spike-protection": {
    s: "Automatic detection of a sudden multiple of normal volume for a project, with temporary throttling of the excess until the surge subsides.",
    d: "The service keeps a baseline of recent event volume per project and compares each interval. When volume exceeds a multiple of the baseline, it enters a protected state in which most events are dropped or sampled, while events for new issues continue to pass. The state lifts after volume returns to normal. This guards the project's quota and shared capacity from a bad deploy or a loop. The challenge is telling a spike from legitimate growth, such as a launch, and not blocking real new failures.",
    k: ["Baseline-relative thresholds vs fixed ceilings: relative thresholds adapt to each project's size, but a slowly growing flood becomes the new baseline.", "Letting new issues through during a spike vs blocking all: letting them through keeps visibility into a cause, at the cost of some extra volume."],
    p: ["A new product launch with real traffic growth is treated as an attack and its errors are dropped.", "Protection that never clears after the spike leaves the project partly blind."],
    v: "Raise one project's error rate fifty-fold for five minutes and confirm the excess is dropped with counts, one genuinely new error still creates an issue, and normal ingestion resumes within a few minutes of the rate returning.",
    dep: ["rate-limiting", "rollup-counters"]
  },
  "inbound-filters": {
    s: "Project-level rules that discard known uninteresting events at ingest: legacy browsers, bot traffic, local development hosts, extension noise and listed error messages.",
    d: "Some errors are never actionable: failures caused by browser extensions, crawlers, ancient clients or localhost development. Filters match on fields in the event, such as the user agent, origin, release or message pattern, and drop matches before they consume storage or quota, recording an outcome. A filter list is configured per project, with maintained defaults for common noise. The risk is over-filtering, where a pattern that is too broad hides a real regression.",
    k: ["Dropping vs storing but hiding: dropping saves cost and quota, but cannot be undone, while hiding costs storage and lets a team revisit the decision.", "Server-side filters vs SDK-side ignore lists: server-side rules change without a deploy and cover old clients, while SDK-side filters save bandwidth."],
    p: ["A message pattern like a generic word matches a real error after a code change, and nobody notices because it is dropped.", "Filtering by user agent hides a real problem that affects exactly the oldest browsers."],
    v: "Enable the crawler and localhost filters and send events from each, plus a normal one, and confirm only the normal event is stored, the others show as filtered with a reason in usage numbers.",
    dep: ["quota-accounting"]
  },
  "server-side-sampling": {
    s: "Keeping only a fraction of events by a configured rate, chosen deterministically so that decisions are stable for an event and consistent across related items.",
    d: "When volume is high and repeats add little, the server keeps a percentage. The decision is a hash of the event or trace identifier compared to the rate, so the same identifier always gets the same answer and related items stay together. The kept events carry their sample rate so counts can be scaled back up for charts. It is hard because error events are generally rare enough that sampling hurts, so it is applied mostly to repeats and to higher-volume data such as performance events.",
    k: ["Deterministic hash sampling vs random: hash sampling keeps related items together and is reproducible, while random is simpler but breaks consistency.", "Storing the rate with each event vs a global rate: per-event rates allow correct scaling when rates change, but must be carried everywhere."],
    p: ["Reporting sampled counts without scaling makes charts fall when the rate is lowered.", "Sampling errors by the same key as traces keeps errors only for traces that were kept."],
    v: "Set a rate of ten percent, send one hundred thousand events, and confirm about ten thousand are stored, each carrying its rate, and that scaled counts in charts match the sent total within a small tolerance.",
    dep: ["quota-accounting", "event-model"]
  },
  "dynamic-sampling": {
    s: "Adaptive sampling that keeps a fixed volume by lowering the rate for common events and keeping rare ones, adjusting continuously from observed traffic.",
    d: "Instead of one rate, the service measures the volume of each kind of event, per release, per environment and per transaction, and sets rates so that busy kinds are heavily sampled and rare kinds are kept almost entirely. New releases get full retention for a time to surface early problems. A feedback loop recomputes rates from recent counts. It keeps representativeness with a bounded cost, but is complex to explain and verify.",
    k: ["Adaptive rates vs fixed rates: adaptive keeps rare events and fixed volume, but results depend on a moving model that is hard to reason about.", "Boosting new releases vs uniform treatment: boosting finds regressions fast, but the cost spikes at each deploy."],
    p: ["Rates computed from stale counts over-sample after a traffic drop and under-sample after a surge.", "Users cannot reconcile their own counts with stored ones when the rate keeps changing."],
    v: "Send a stream where one event type is a thousand times more frequent than another, and confirm the stored ratio is far closer to even, the rare type is almost fully kept, and scaled counts match the originals.",
    dep: ["server-side-sampling", "rollup-counters"]
  },
  "backpressure": {
    s: "Controls that slow producers or shed lower-priority work when downstream stages fall behind, so overload degrades gracefully instead of failing everywhere.",
    d: "When processing lags, queues grow, and the system must choose what to drop. Signals such as queue depth and consumer lag flow back to ingest, which starts rejecting low-value categories first: repeats, attachments, then high-volume sessions, while keeping first occurrences. Clients receive retry hints to spread the load. Each stage also bounds its own memory. It is hard because the signal arrives late, and because a shed policy that is fair on paper may starve a small project.",
    k: ["Shedding by category priority vs uniformly: priority keeps the most valuable data, but needs agreement on the order and a way to explain gaps.", "Reacting to queue depth vs to latency: depth is simple and direct, but latency reflects what users experience when messages differ in cost."],
    p: ["Shedding that begins only when disks are full is too late and causes a hard outage.", "Retry hints that are too short synchronize clients into repeated waves."],
    v: "Throttle processing to a tenth of normal speed under steady load, and confirm queue growth stops at a bound, low-priority categories are dropped first with counts, and first-occurrence events still reach storage.",
    dep: ["ingest-queue", "rate-limiting"]
  },
  "scrubbing-rules": {
    s: "Configurable rules that remove or mask matching fields and values from events on the server before storage, applied by key name, path or pattern.",
    d: "An administrator configures rules: remove any field called password, mask anything shaped like a long digit sequence in the message, hash a user identifier. Rules apply to specific parts of the event, such as exception values, breadcrumbs, request headers and extra data, and run in the pipeline before the event is written anywhere. A default set covers common secrets. It is hard because secrets hide in free text and URLs, and because scrubbing too much removes the data needed to debug.",
    k: ["Remove vs mask vs hash: removal is safest, masking keeps the field's presence, and hashing keeps the ability to correlate without revealing the value.", "Default-on aggressive rules vs opt-in: default-on protects teams who never configure, but may hide fields they depend on."],
    p: ["Rules applied only to known fields miss the same secret sitting in a breadcrumb or in a URL.", "Scrubbing after the queue write leaves raw data in queue storage."],
    v: "Send an event with a password field, a token in a URL and a card number in the message, and confirm all three are masked in the stored event, the search index and any attachments' metadata.",
    dep: ["pattern-detection", "event-normalization"]
  },
  "pattern-detection": {
    s: "Matching of values by their shape, such as card numbers, keys and addresses, with checksums or format checks to limit false positives.",
    d: "Free text cannot be scrubbed by field name, so detectors look at the values: sequences of digits that pass a checksum, strings with the form of a cloud key or a token, email addresses, and long random-looking strings. Each detector has a pattern, a validation step and an action. Running many patterns on every event is costly, so they are compiled and applied only to string fields up to a size. It is a tradeoff: strict patterns miss variants, and loose patterns mask harmless identifiers.",
    k: ["Pattern with validation vs pattern alone: checks such as a checksum cut false matches, but add code per data type.", "Detecting everywhere vs in selected fields: everywhere catches leaks in odd places, but costs more CPU and risks masking useful identifiers."],
    p: ["A pattern for long digit strings masks order numbers and timestamps, making events useless.", "A pattern with catastrophic backtracking stalls processing on a crafted message."],
    v: "Run a corpus with real-format test card numbers, keys and email addresses, plus lookalike harmless numbers, and confirm detection catches all sensitive ones and masks at most a few harmless ones, within a CPU budget per event.",
    dep: []
  },
  "ip-anonymization": {
    s: "Handling of the sender's network address and other identifiers: store, truncate or discard it, and decide whether it may be used to derive location or a distinct-user key.",
    d: "The address of the client is visible to ingest by default and is personal data in many jurisdictions. Projects can discard it, truncate its final part, or use it only to derive coarse location before dropping it. The derived location and the user count then rely on a coarser key. The system must apply the setting before the address is written to any log or store, including access logs and queue messages, which is where it most often leaks.",
    k: ["Discard after geolocation vs keep truncated: discarding is safest, while truncation retains some value for abuse analysis.", "Per-project setting vs global policy: per-project meets different legal needs, but is easy to leave misconfigured."],
    p: ["Access logs at the edge keep full addresses even after the event itself was cleaned.", "Distinct-user counts based on address collapse many users behind one shared address into one."],
    v: "Enable address discarding, send an event, and search the event store, the queue messages and the edge access logs for the sender's address, confirming it is not present in any of them.",
    dep: ["device-enrichment"]
  },
  "retention-deletion": {
    s: "Rules that expire events after a set time, and the machinery that deletes all copies of data on request, across stores, indexes, aggregates and attachments.",
    d: "Each class of data has a retention period: events, attachments, aggregates. A scheduled job drops expired partitions or rows. Deletion on request, for one user or one project, must find every copy: the event store, the search index, caches, blob storage and replicas, and record that it did. Time partitioning makes expiry cheap, but per-user deletion has to touch rows scattered across partitions. Backups hold data until they age out, so the policy must say how long.",
    k: ["Drop whole partitions vs delete rows: dropping is nearly free and instant, but cannot remove one user's data, which needs targeted deletes.", "Deleting by identifier through every store vs retention only: identifier deletion satisfies requests, but requires a map of where each identifier appears."],
    p: ["A deletion that skips the search index leaves the data discoverable after it was reported deleted.", "Retention shortened later does not apply to old data unless a backfill job runs."],
    v: "Ingest events for a test user, issue a deletion request, then query every store, index and blob listing for that user and confirm no results, and confirm expired partitions disappear on schedule.",
    dep: ["time-partitioning", "event-store", "blob-store", "search-index"]
  },
  "data-residency": {
    s: "Keeping an organization's data in a chosen region, with separate regional deployments and routing so events never cross borders.",
    d: "Some customers must keep data within a country or bloc. The service runs independent regional stacks, each with its own ingest, queues, processing and stores, and the project's key encodes or resolves to its region. Interface requests are routed to the correct region, and cross-region features such as global search are either absent or federated without copying events. It multiplies operational work, and makes anything global, such as user accounts, a design question.",
    k: ["Fully separate regional stacks vs one stack with regional storage: separate stacks give clean guarantees, while one stack is cheaper but processing may still happen elsewhere.", "Region fixed at project creation vs movable: fixed is simple, and moving data later requires export and deletion with downtime."],
    p: ["Processing in another region, such as symbolication by a shared service, breaks the guarantee while storage looks compliant.", "Telemetry and error logs from the service itself leak event contents across regions."],
    v: "Create a project in one region, send events and trace the network flows and stored objects, confirming that every hop and storage location, including caches and the symbolication path, is within the region.",
    dep: ["ingest-endpoint", "event-store"]
  },
  "processing-pipeline": {
    s: "The ordered set of stages that consume raw events from the queue and enrich, normalize and group them before storage, each stage independently retryable.",
    d: "Workers read from the ingest queue and run stages: scrubbing, symbolication, enrichment, grouping, then storage and notification. Stages that need external lookups, such as symbol fetches, run asynchronously with their own queue so slow work does not block the rest. Failed stages are retried with limits, then the event is saved unprocessed or discarded with a reason. It is hard because stage order matters, and because every stage must be idempotent for retries and replays.",
    k: ["One long chain vs separate queues per stage: a chain is simple, while separate queues isolate slow stages and let each scale, but add handoffs and lag.", "Storing unprocessed after failure vs dropping: storing keeps the error visible with raw frames, but pollutes grouping with differing fingerprints."],
    p: ["A slow symbol fetch inside the main chain blocks all events behind it.", "A poison event that crashes a worker is retried forever and stalls its partition."],
    v: "Inject a poison event and a slow symbol server, and confirm the poison event ends in a dead-letter record with its error, ordinary events continue within normal latency, and the slow one resumes when the server returns.",
    dep: ["ingest-queue", "scrubbing-rules", "native-symbolication", "device-enrichment", "group-assignment", "event-store"]
  },
  "device-enrichment": {
    s: "Adds derived facts the client did not send: browser and operating system families parsed from user agent text, device class, and coarse location from the address.",
    d: "Raw strings are turned into structured tags: a user agent string becomes browser family and version, and an address becomes country and region via a geographic lookup table that is updated regularly. These values feed search facets and charts such as errors by browser. Parsing must be fast and handle thousands of obscure agents. It is hard because patterns change constantly, so the parsing data must be updated, and because geolocation by address is approximate.",
    k: ["Server-side parsing vs client-sent values: server-side works for old clients and one parser, but client-sent values are exact when available.", "Coarse location vs city-level: coarse is more private and more accurate, while finer detail adds little for debugging but more privacy risk."],
    p: ["An outdated parsing table labels new browser versions as unknown, which breaks version-based alerts.", "Bots and proxies report misleading locations that skew charts."],
    v: "Send events from a set of known user agents and addresses and confirm each yields the expected browser, version, operating system and country tags, and unknown agents map to a defined fallback.",
    dep: ["event-normalization"]
  },
  "tag-extraction": {
    s: "Pulling searchable key-value tags from an event, such as release, environment, browser and handled flag, and indexing them for filtering and facets.",
    d: "Tags are the dimensions engineers filter on. Some come from the client, others are derived by the server from context blocks. The pipeline normalizes keys, caps key and value lengths and the number of distinct tags, and writes them into the index and the analytics store. Cardinality is the central problem: a tag whose value is unique per event, such as a request identifier, creates millions of distinct values and makes facets and indexes enormous.",
    k: ["Indexing all tags vs a curated set: all tags give flexible search, but unbounded cardinality hurts index size, while a curated set keeps costs flat.", "Server-derived tags vs only client-set: derived tags give consistent coverage across SDKs, but must be maintained as formats change."],
    p: ["A high-cardinality tag such as a session identifier can blow up index size and slow every search.", "Inconsistent keys such as differing case split one dimension into two."],
    v: "Send events with a unique-per-event tag and a normal tag, and confirm the normal tag appears in facets with counts while the unique one is limited or excluded from facets without hurting query speed.",
    dep: ["device-enrichment", "search-index"]
  },
  "event-deduplication": {
    s: "Detection and discarding of the same event arriving more than once, caused by client retries, queue redelivery or duplicated reporting paths.",
    d: "An event identifier is generated by the client and kept through retries. The pipeline records recently seen identifiers in a fast store with an expiry and drops repeats, and storage writes are made idempotent by keying on the identifier. This is separate from grouping, which collapses distinct events into one issue. It must be approximate in memory but exact in storage. The edge case is two different events sharing an identifier through a client bug, which loses one silently.",
    k: ["Short-window cache check vs permanent unique key: a cache is fast and bounded, but misses late duplicates, while a unique key is exact at the cost of an index over all events.", "Dedup by client identifier vs content hash: identifier is cheap and precise for retries, while content hash also removes double reporting but can merge real separate occurrences."],
    p: ["A client that reuses one identifier for every event stores only the first one.", "Duplicates counted before dedup inflate quota usage and user counts."],
    v: "Send the same event identifier five times, with two restarts of a worker in between, and confirm exactly one stored event, one count in the issue, and one notification.",
    dep: ["event-store"]
  },
  "late-events": {
    s: "Handling of events that arrive hours or days after they happened, or in a different order than they occurred, such as those from offline devices.",
    d: "A device that was offline sends a day's errors on reconnect, and a queue may deliver events out of order. The pipeline trusts the client timestamp only within limits, sorted against the server receipt time, and routes the event to the partition of its event time. Issue first-seen and last-seen values must be updated correctly with an earlier timestamp, and alerts must decide whether an old event counts as new. The difficulty is that every time-based feature assumes recency.",
    k: ["Event time vs receive time for ordering: event time gives accurate history, but a wrong client clock corrupts it, while receive time is trustworthy but misplaces offline events.", "Evaluating alerts on late events vs ignoring them: evaluating keeps the record true, but sends stale pages."],
    p: ["A device with a clock set years ahead creates events in the future that sit in no useful partition.", "Late events mark an issue as a regression when it was merely reported late."],
    v: "Send an event with a timestamp two days old and one with a timestamp one year ahead, and confirm the first is stored with its original time without alerting, and the second is clamped to receipt time.",
    dep: ["time-partitioning", "event-normalization"]
  },
  "reprocessing": {
    s: "Rerunning stored events through the processing pipeline after a fix or new data, such as symbol files uploaded late, to correct their frames and grouping.",
    d: "Events often arrive before their debug symbols exist, leaving frames unresolved. After the files are uploaded, a reprocessing job replays the raw payloads through symbolication and grouping, creating or merging issues and keeping the history. It requires keeping the original event, not just the processed one. It is hard because it changes issue identity: events move to different issues, counts shift, and notes and assignments attached to the old issue must follow or be preserved.",
    k: ["Keeping raw payloads vs processed only: raw payloads allow later correction, but double storage and extend privacy obligations.", "Reprocessing in place vs creating new issues: in place preserves links but can surprise users when counts change, while new issues are clean but lose history."],
    p: ["Reprocessing a million events at once saturates the pipeline and delays live events.", "Assignments and comments on an issue vanish when its events are regrouped."],
    v: "Send crashes before uploading debug files, upload them, run reprocessing, and confirm the events now show source lines, are grouped under correct fingerprints, and live traffic latency stays within its normal range.",
    dep: ["blob-store", "native-symbolication", "group-assignment"]
  },
  "symbol-upload": {
    s: "The build-time step that sends debug files, source maps and mapping files to the service, each identified by a unique build identifier so events can find the right one.",
    d: "A build tool or CI step uploads the artifacts produced by the compiler or bundler, after validating them and computing identifiers: a hash or debug identifier embedded in the binary, or a release name plus file path for source maps. Uploads can be many gigabytes for native builds, so they are chunked, deduplicated by checksum and resumable. The recurring failure is mismatch: the uploaded file does not belong to the shipped build, or is uploaded after the first crashes have arrived.",
    k: ["Identifier embedded in the binary vs matched by release name: embedded identifiers match exactly and survive renames, but need toolchain support, while release names are easy and mistakes go unnoticed.", "Upload in CI vs in the app's release process: CI is automatic but may run before final signing changes the binary, which alters its identifier."],
    p: ["Source maps uploaded for a rebuild with different content produce plausible but wrong line numbers.", "Uploads that fail quietly in CI leave production without symbols until a crash exposes it."],
    v: "Build twice with a small code change, upload only the first build's files, trigger an error in the second, and confirm the service reports it as unsymbolicated rather than resolving it to wrong lines.",
    dep: ["debug-file-store"]
  },
  "debug-file-store": {
    s: "Durable storage and index of uploaded symbol files, keyed by build identifier, with access control and retention separate from event data.",
    d: "Uploaded artifacts are written to object storage and indexed in a table by identifier, type, size and project. Native debug files are very large and rarely changed, so storage is deduplicated. Lookup must be fast at symbolication time, so recently used files are cached near the workers. Files are sensitive: they reveal source structure and sometimes embedded paths and names. Retention must be long, since a release may be supported for years, and expiry removes the ability to ever decode its crashes.",
    k: ["Retention by age vs by last use: age is simple, but removes files for old but still-installed releases, while last-use retention keeps what is still needed.", "Per-project storage vs shared deduplicated storage: shared saves space for common platform symbols, but needs careful access checks."],
    p: ["Expiring files after ninety days makes crashes from long-lived installs undecodable.", "Download access that lacks project checks exposes source structure of another customer."],
    v: "Upload a file, look it up by identifier from a worker in another zone, and confirm it is found within a latency budget, cached on the second lookup, and not returned to a request from another project.",
    dep: ["blob-store", "issue-store"]
  },
  "source-map-resolution": {
    s: "Mapping positions in minified or bundled scripts back to original files, lines and names using uploaded source maps, matched to the script that ran.",
    d: "The frame carries a script address and a position. The resolver finds the script's source map through an uploaded artifact associated with the release, or through a reference comment in the script, parses its mappings, and looks up the original file, line, column and name. It can also provide context lines from embedded sources. It is hard because matching depends on exact URLs and release names, bundles may chain several maps, and large maps are slow to parse, so they are cached in a compact form.",
    k: ["Uploaded maps vs fetching from the public site: uploaded maps stay private and match the release, while fetching needs no upload but exposes maps publicly and can fetch the wrong version.", "Matching by debug identifier vs by URL and release: identifiers are exact, but URL matching works with older tooling and breaks when paths differ."],
    p: ["A path prefix mismatch between the runtime URL and the uploaded name leaves every frame unresolved.", "Serving source maps publicly leaks the original source code to everyone."],
    v: "Throw an error from a minified bundle with an uploaded map and confirm frames show original file names, lines and function names, and a frame in a script without a map is left unchanged and marked unresolved.",
    dep: ["debug-file-store", "symbol-upload", "symbolication-cache"]
  },
  "native-symbolication": {
    s: "Converting instruction addresses in native crash reports into function names, files and lines, using debug files matched by build identifier and the loaded module layout.",
    d: "A crash report lists each thread's addresses plus the base address and build identifier of every loaded module. The symbolicator subtracts the load address to get an offset, finds the debug file, and looks up the function and line, including inlined calls. It runs as a separate service because files are large and lookups are specialized. It must handle stripped release builds, different layouts per operating system version, and system libraries it does not hold files for.",
    k: ["Dedicated symbolication service vs in-process: a service shares caches and isolates crashes from parsing untrusted files, but adds a network hop and a dependency.", "Prefetching files per project vs on demand: prefetching speeds the first crash after a release, at the cost of storage transfers that may never be used."],
    p: ["A wrong load address calculation produces confident but wrong function names.", "Parsing malformed uploaded files crashes the symbolicator unless sandboxed."],
    v: "Crash a release build with a known function at a known line, and confirm the processed event names that function and line, including an inlined caller, and that a module with no uploaded file is shown as an address only.",
    dep: ["debug-file-store", "frame-normalization", "symbolication-cache", "external-symbol-servers"]
  },
  "obfuscation-mapping": {
    s: "Reversing the renaming applied by shrinkers and obfuscators, using the mapping file produced at build time to restore class, method and field names.",
    d: "Build tools for some mobile and managed runtimes rename identifiers to short meaningless names and remove unused code, so stack traces show names like a, b and c. The tool writes a mapping from original to renamed names. The service stores it by build identifier and applies it to frames, including line number tables and inlined or merged methods, which require stateful lookups. The difficulty is that the mapping is large, specific to one build, and one frame can correspond to several original methods.",
    k: ["Applying the mapping on the server vs shipping unobfuscated builds: server-side mapping protects the code in the field, while shipping readable builds is simpler but exposes more.", "Resolving to one best frame vs listing all candidates: one frame reads cleanly, while candidates are accurate where inlining merged several methods."],
    p: ["A mapping uploaded from a different build renames frames to plausible but wrong methods.", "A mapping file regenerated on each build without stable output makes identifiers differ between builds."],
    v: "Build with obfuscation enabled, crash in a known method, and confirm the stored stack shows the original class and method names and line numbers rather than the shortened names.",
    dep: ["debug-file-store", "frame-normalization"]
  },
  "external-symbol-servers": {
    s: "Fetching debug files for platform libraries from public or private symbol servers when the project did not upload them.",
    d: "Frames inside operating system and common libraries need symbols the application team does not own. The symbolicator is configured with a list of servers, requests a file by identifier, and caches the result, including negative results so a missing file is not requested repeatedly. Servers differ in protocol and speed, and fetches happen during event processing, so they run with timeouts and in a separate queue. Private servers need credentials, which the service must store and protect.",
    k: ["Fetch on demand vs mirror ahead: on demand stores only what is needed, but the first crash is slow, while mirroring is fast but large.", "Negative caching vs always retrying: negative caching saves load and delay, but a file published later stays unavailable until the entry expires."],
    p: ["A slow external server stalls processing for every event that needs it, unless timeouts and queues isolate it.", "Credentials for private symbol servers stored in plain configuration leak to anyone with read access."],
    v: "Crash with a frame in a system library not uploaded by the project, and confirm the frame resolves after a fetch, a second crash resolves from cache, and an unreachable server causes a timeout and a marked unresolved frame, not a stall.",
    dep: ["symbolication-cache"]
  },
  "frame-normalization": {
    s: "Making frames from many runtimes comparable by cleaning paths, function names and module identifiers into a stable canonical form.",
    d: "The same function can appear with different absolute paths on each build machine, with generic parameters, lambda numbering or address suffixes in its name, and with query strings on script URLs. Normalization strips machine-specific prefixes, collapses variable parts, and splits a function into module and name. Its output is what grouping hashes, so it must be stable across builds of the same code and distinct for genuinely different code. This makes it the hardest to get right and the easiest place to break grouping.",
    k: ["Aggressive normalization vs minimal: aggressive collapses build noise so one bug stays one issue, but risks merging different functions with similar names.", "Normalizing before storing vs at grouping time: before storing saves work later, but the original text is lost, so keeping both costs space."],
    p: ["Absolute build-machine paths left in frames make the same bug a different issue per build agent.", "Stripping numbers from names merges lambda number one with lambda number two, though they are different code."],
    v: "Build the same code on two machines with different paths and raise the same error, and confirm both events produce identical normalized frames and the same fingerprint, while an error in a different function produces another.",
    dep: []
  },
  "in-app-detection": {
    s: "Classifying each frame as the application's own code or as library or system code, so grouping and the displayed trace focus on the code the team can change.",
    d: "Rules decide by path, module name, package prefix or origin whether a frame is in-app. They come from SDK defaults, build configuration and project settings. Grouping uses in-app frames in preference to library ones, since library frames change between upgrades. The interface collapses library frames by default. If nothing is marked in-app, grouping falls back to all frames. It is simple in concept, but wrong settings can hide the culprit frame or make grouping depend on volatile library code.",
    k: ["Marking in-app by allowlist of own packages vs denylist of libraries: an allowlist is exact once configured, while a denylist works with no configuration but misclassifies new dependencies.", "Using only in-app frames for grouping vs all frames: in-app only is stable across dependency upgrades, but can merge distinct errors that differ only in library frames."],
    p: ["Marking everything in-app makes grouping change whenever a dependency is upgraded.", "Marking nothing in-app hides the application frame inside a collapsed block."],
    v: "Upgrade a dependency so only library frames change, raise the same application error, and confirm it stays in the same issue, with the application frame highlighted and library frames collapsed.",
    dep: ["frame-normalization"]
  },
  "symbolication-cache": {
    s: "A cache of parsed symbol data and of per-frame results that avoids re-reading and re-parsing large files for every event.",
    d: "Parsing a large debug file or source map costs far more than the lookup, and a crash storm sends thousands of frames from the same few files. The symbolicator keeps parsed files in a memory and disk cache, keyed by identifier, and may cache results per address. Sizing and eviction determine latency during bursts. It must also cache failure, so missing or corrupt files are not fetched again constantly, while still noticing when a file is finally uploaded.",
    k: ["Caching parsed form vs raw files: parsed form is fast to query but larger and tied to a parser version, while raw files are compact and slow to use.", "Short vs long negative cache lifetime: short notices a new upload sooner, but repeats failed work."],
    p: ["A cache that is cold after deployment makes every worker parse the same big file at once, stalling the pipeline.", "A cached negative result hides a file uploaded a minute ago."],
    v: "Send ten thousand events with frames in the same module right after a worker restart and confirm the file is parsed once per worker, latency settles quickly, and upload of a missing file takes effect within the negative-cache time.",
    dep: ["debug-file-store"]
  }
});
