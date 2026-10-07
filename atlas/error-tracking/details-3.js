// Details for the error tracking plate, part 3: grouping, storage, search, releases.
ATLAS.details("error-tracking", {
  "fingerprint-generation": {
    s: "Derives from each event a short key that identifies its underlying problem, so events with the same key become one issue.",
    d: "A fingerprint algorithm selects the parts of an event that define its identity and hashes them: typically the exception type and the normalized in-app frames, falling back to the normalized message or to a template. Everything noisy is excluded: values, timestamps, memory addresses. The same input must give the same key forever, because the key is the issue's identity in storage. The central tension is between too coarse, merging different bugs, and too fine, splitting one bug into thousands of issues.",
    k: ["Stack-based keys vs message-based keys: stacks are stable when messages embed values, but are absent for message-only events, which need a fallback.", "Hierarchical hashes at several granularities vs one flat hash: hierarchy lets one issue be split later without rewriting history, but stores more hashes per event.", "Computing at ingest vs at query time: ingest-time is fast to read and fixed at write, while query-time is flexible but expensive."],
    p: ["Including a request identifier or timestamp in the key makes every event its own issue.", "Changing the algorithm without versioning suddenly reassigns years of events and resets every issue's history."],
    v: "Raise the same bug from one thousand requests with differing values and confirm one issue, then raise two different bugs from the same function and confirm two issues, with keys identical across restarts.",
    dep: ["stacktrace-hashing", "message-normalization", "frame-normalization"]
  },
  "stacktrace-hashing": {
    s: "Hashing of the normalized, in-app frames of an event's stack, usually the strongest signal for identity, with rules for which frames and how many to include.",
    d: "The hash covers each in-app frame's module, function and sometimes context line, in order, and the exception type. Library frames, line numbers and column offsets are excluded since they shift with edits, though a context line can distinguish different failures in one function. Many errors have a chain of causes, and each can contribute. The algorithm must tolerate recursion, where the stack length varies with depth, by collapsing repeats. It is the heart of grouping, and its quality is judged by how many issues a team has to read.",
    k: ["Including line numbers vs function names only: line numbers separate different failures in one function, but change with every edit above the code, splitting issues after each release.", "Hashing the full stack vs the top frames: full stacks distinguish call paths, but split one bug reached from different callers, while top frames merge them."],
    p: ["Recursive failures with varying depth produce a new fingerprint per depth unless repeats are collapsed.", "Including a minified column number makes each build a different issue."],
    v: "Raise the same error from three different call paths and confirm the configured depth decides whether they form one issue or three, and that adding a comment line above the function does not change the key.",
    dep: ["frame-normalization", "in-app-detection"]
  },
  "message-normalization": {
    s: "Replacing the variable parts of an error message, such as numbers, identifiers and paths, with placeholders so equivalent messages produce the same key.",
    d: "When an event has no useful stack, the message is the identity, but messages carry values: user ids, counts, file names, addresses. Normalization replaces numbers, UUIDs, hex strings, quoted strings and long tokens with placeholders before hashing, using ordered patterns. Parameterized messages sent with their template make this exact. It is a heuristic, so it will sometimes merge two messages that differ only in a number that matters, and sometimes fail to merge ones that differ in a word.",
    k: ["Heuristic normalization vs developer-provided templates: heuristics work on unmodified code, but templates are exact and need code changes.", "Replacing all numbers vs only long ones: replacing all merges aggressively, but erases meaningful codes such as a status number."],
    p: ["Messages containing unique identifiers in words rather than digits are never normalized, producing endless issues.", "Replacing every number merges an error for status 404 and one for status 500."],
    v: "Send messages differing in user id, count and file path and confirm they group together, while two messages that differ by a keyword remain separate issues.",
    dep: []
  },
  "custom-fingerprint-rules": {
    s: "Developer-controlled overrides that set or extend the fingerprint by pattern matching on the event, or by an explicit value sent from the SDK.",
    d: "Teams know their code. They can set the fingerprint in the SDK for a specific capture, write server-side rules that match error type, module or message and assign a fixed key, or extend the default key with extra data such as a tenant or a function. Rules are evaluated in order before the default algorithm. They let teams fix over-split or over-merged issues quickly without waiting for service changes. The risk is rule sprawl that nobody remembers, and rules that conflict.",
    k: ["Server-side rules vs SDK-supplied fingerprints: server-side rules change without a deploy and apply to all clients, but SDK values are close to the code and versioned with it.", "Replacing the default key vs extending it: replacing gives full control, but extending keeps automatic splitting of distinct stacks."],
    p: ["A broad rule written to merge noise also swallows an unrelated new error that matches it.", "Rules left behind after the code was removed accumulate and slow evaluation."],
    v: "Add a rule grouping all errors from one module into one issue, send varied errors from it and from another module, and confirm the first set merges into one issue and the second is unaffected.",
    dep: ["fingerprint-generation"]
  },
  "grouping-config-versions": {
    s: "Named, frozen versions of the grouping algorithm, pinned per project so an improvement does not suddenly regroup existing issues.",
    d: "Every improvement to grouping changes some fingerprints, which would split or merge existing issues and reset counts, assignments and alert state. So each version of the algorithm is kept exactly, a project is pinned to one and upgrades by choice, often with a transition period during which both versions are computed and old events keep their old keys. It is operationally costly to keep old versions running forever, and the tooling for previewing an upgrade is as hard as the algorithm itself.",
    k: ["Pinned versions with opt-in upgrade vs automatic upgrade: pinning protects history, but leaves projects on worse grouping and forces the service to maintain old code.", "Dual computation during transition vs a hard switch: dual computation keeps issue identity, but doubles the work and storage for a period."],
    p: ["Upgrading a project with no preview unexpectedly resets assignments and alert history on hundreds of issues.", "Pinned old versions that nobody upgrades become permanent maintenance burdens."],
    v: "Upgrade a test project from one version to the next with a transition, and confirm old events keep their issues, new events use the new keys, and a preview report lists which issues would merge or split.",
    dep: ["fingerprint-generation"]
  },
  "similarity-grouping": {
    s: "Grouping by learned or computed similarity of events instead of exact hashes, merging near-duplicates whose stacks differ slightly.",
    d: "Exact hashes cannot see that two stacks differ by one frame because an intermediate wrapper changed. A similarity approach computes embeddings or token sets for the stack and compares new events against recent issues in a nearest-neighbor index, merging above a threshold. It reduces issue counts for noisy stacks. It is also less predictable: results depend on model version and threshold, merges are hard to explain, and it needs an index that is queried per event, which is costly.",
    k: ["Similarity matching vs exact hashing: similarity reduces fragmentation of near-identical stacks, but is slower, probabilistic and harder to explain than a deterministic hash.", "High threshold vs low: a high threshold avoids wrong merges but leaves fragments, while a low one reduces fragments and risks hiding distinct bugs."],
    p: ["A wrong merge hides a new bug inside an old, ignored issue, so nobody is alerted.", "A model update changes results for the same event, making grouping non-reproducible."],
    v: "Send stack pairs that differ by one wrapper frame and pairs of unrelated bugs, and confirm the near pairs merge, the unrelated pairs never do, and each merge can show the score and nearest event that caused it.",
    dep: ["stacktrace-hashing", "issue-store"]
  },
  "merge-unmerge": {
    s: "Operations that combine issues into one or split events from an issue, correcting grouping mistakes while preserving history and future behavior.",
    d: "A person merges two issues they know are the same, or unmerges events that were wrongly joined. Merging records a mapping from the fingerprint hashes of the merged issue to the target, so future events follow, and moves metadata. Unmerging needs to create a new issue and reassign the stored events and their hashes, which touches the event store, the search index and the aggregates. It is expensive and can take time, so it runs as a background task with progress.",
    k: ["Mapping hashes to a target vs rewriting events: a mapping makes merge instant, but queries must resolve it, while rewriting simplifies reads and is slow.", "Allowing unmerge vs merge only: unmerge repairs mistakes, but requires keeping per-event hashes and heavy reassignments."],
    p: ["Unmerging a large issue while events keep arriving leaves some events in the wrong place unless done carefully.", "Merging issues with different owners and states loses one of them silently."],
    v: "Merge two issues, send an event matching the old key and confirm it lands in the target; then unmerge selected events and confirm counts, search results and aggregates update on both issues.",
    dep: ["issue-store", "event-store", "group-assignment"]
  },
  "group-assignment": {
    s: "The step that looks up each event's fingerprint and attaches the event to an existing issue or creates a new one, atomically and at high concurrency.",
    d: "The pipeline looks up the fingerprint in a mapping table. If found, it increments the issue's counters, updates last-seen and may reopen it. If not, it creates an issue and a mapping. Creation must be atomic, since thousands of identical events may arrive in the same millisecond, and only one issue and one new-issue notification may result. Counters on hot issues become a contention point, so they are batched. Races between merging and new events must also resolve consistently.",
    k: ["Insert-if-absent with unique constraint vs distributed lock: a unique constraint is simple and correct under races, while locks add latency and failure modes.", "Updating counters per event vs batching: per-event is accurate in real time, but hot issues create contention, while batching trades small delay for throughput."],
    p: ["Two workers creating the same issue concurrently produce duplicate issues and double notifications.", "Counter updates on one viral issue serialize the pipeline for the whole partition."],
    v: "Send one thousand identical new events in parallel across workers and confirm exactly one issue and one new-issue notification result, with an event count of one thousand.",
    dep: ["fingerprint-generation", "issue-store", "rollup-counters"]
  },
  "event-store": {
    s: "Durable storage of each processed event in full, indexed by identifier, issue and time, optimized for heavy writes and rare reads.",
    d: "Events are written once and read rarely, mostly by identifier when someone opens an issue, or by issue to list occurrences. A wide-row or document store partitioned by project and time absorbs the write rate. Payloads are compressed, and large parts such as attachments are moved to blob storage with a reference. The store holds the source of truth from which indexes and aggregates can be rebuilt. The challenge is write amplification, retention deletion and keeping reads of old data affordable.",
    k: ["Wide-row store vs relational: wide-row scales writes and expiry with time, while relational allows richer queries and transactions but is harder to scale for this volume.", "Storing the full payload inline vs references to blobs: inline keeps one read per event, but large payloads slow scans and inflate costs."],
    p: ["Writing synchronously into several systems per event lets the slowest one limit throughput.", "Hot partitions for a spiking project overload a few nodes."],
    v: "Write a million events, then fetch ten random ones by identifier and the latest fifty for an issue, and confirm each read returns the exact stored payload within the latency budget, and expired rows disappear on schedule.",
    dep: ["time-partitioning", "blob-store"]
  },
  "issue-store": {
    s: "A transactional database of issues, fingerprint mappings, projects, releases and state, small in volume but read and written constantly.",
    d: "Unlike events, issue records are mutable and relational: status, assignee, first and last seen, counters, links to releases, merges and hash mappings. A relational database with strong consistency fits. It is the system of record for what people see and do. Writes come from the pipeline at event rate for some fields, so hot fields are often moved to counters elsewhere. It must support the lookups ingest and processing do on every event, usually served from caches.",
    k: ["Relational transactional store vs a distributed key-value store: relational gives constraints and joins, but scaling writes needs sharding by organization and care.", "Hot counters in the database vs a separate counter store: separate counters avoid row contention, but results can briefly disagree with the issue row."],
    p: ["Updating last-seen on every event makes one row a bottleneck.", "Cache entries for fingerprint mappings that go stale after a merge send events to the wrong issue."],
    v: "Perform concurrent updates of status, assignee and counters from the interface and the pipeline on one issue, and confirm the final record reflects all changes with no lost update, and lookups stay within a small latency budget.",
    dep: []
  },
  "blob-store": {
    s: "Cheap object storage for large, immutable payloads: attachments, crash dumps, raw event bodies and symbol files, addressed by key.",
    d: "Anything large or rarely read goes to an object store rather than a database. Objects are written once under a content or identifier key, with lifecycle rules moving them to colder tiers and deleting them at expiry. References from event or issue records point to them. It is cheap and durable, but has high latency per object and per-request costs, so many tiny objects are inefficient. Access is through signed, time-limited URLs rather than public paths.",
    k: ["One object per item vs packed batches: one per item is simple to delete and fetch, but many small objects cost more per request than packing.", "Lifecycle rules in the store vs application deletion: lifecycle rules are cheap and automatic, but cannot apply a deletion request for one user."],
    p: ["Objects left behind after their events were deleted keep cost and personal data indefinitely.", "Signed URLs with long lifetimes shared in tickets keep granting access after the issue was closed."],
    v: "Store an attachment, fetch it through a signed URL before and after expiry, and confirm the second request is refused, then delete the owning event and confirm the object is gone within the cleanup window.",
    dep: []
  },
  "columnar-analytics": {
    s: "A column-oriented store holding event fields and tags for fast aggregation, grouping and filtering across millions of events.",
    d: "Questions such as errors per release per hour, or top tags for an issue, scan many events but few columns. A columnar store organizes data by column with compression and sorts by project and time, so these queries touch little data. Events are written in batches from the pipeline. It is a derived store, rebuilt from the event store if needed, and eventually consistent with it. Updates are costly, so changes such as merges are handled with versioned rows or tombstones.",
    k: ["Separate columnar store vs queries on the primary: columnar is much faster for aggregates, but is another system to run and keep in sync.", "Batch writes vs per-event inserts: batches are efficient for columnar layout, but add seconds of delay before events are visible."],
    p: ["Merges and deletions that must rewrite rows are slow and leave the store out of step with the issue store.", "Tiny frequent inserts create thousands of small parts that slow every query."],
    v: "Insert one hundred million events over a week and run an errors-per-release-per-hour query for the last day, confirming it returns within seconds and counts match the event store.",
    dep: ["time-partitioning", "tag-extraction"]
  },
  "rollup-counters": {
    s: "Pre-aggregated counts of events and users per issue, project, release and time bucket, serving charts and sort orders without scanning events.",
    d: "Counting events on every page view would be far too slow, so the pipeline increments counters in a fast store, bucketed by hour or day, per dimension. They drive issue lists sorted by frequency, sparklines, quota checks and release charts. Distinct-user counts use approximate sketches, since exact counts need every identifier. Counters are rebuildable from events, but drift happens, and merges must combine buckets from two issues.",
    k: ["Approximate distinct counts vs exact: sketches use small fixed memory and merge easily, but give estimates with small error, which must be disclosed.", "Counters written in the pipeline vs derived from the analytics store: pipeline writes are immediate, but derived counts are always consistent with the data."],
    p: ["Counters not decremented after deletion or unmerge show events that no longer exist.", "A restart that replays queue messages double counts unless increments are idempotent."],
    v: "Send a known number of events and distinct users to an issue, then merge it into another and confirm both counters combine, a replayed batch does not change them, and the distinct count is within its stated error.",
    dep: ["event-deduplication"]
  },
  "time-partitioning": {
    s: "Organizing stored data into time-based partitions so that writes go to the newest, queries prune the rest, and expiry drops whole partitions cheaply.",
    d: "Events and aggregates are placed in partitions by day or week of event time, usually combined with project. New data goes to the latest, recent ones are hot and old ones cold. A query for the last day touches one partition. Retention deletes a partition as a unit, with no row-by-row work. The cost is that late events must be routed to old partitions, and deletions of individual users still touch all of them.",
    k: ["Small partitions vs large: small ones make expiry and queries precise, but create many files and metadata, while large partitions are efficient but coarse.", "Partition by event time vs ingest time: event time suits queries, but late events land in old partitions, while ingest time keeps writes append-only."],
    p: ["Events with timestamps far in the future or past create stray partitions that never expire correctly.", "Partitioning by time only makes a hot period overload a few nodes."],
    v: "Query the last hour and the last month and confirm the plan touches only the relevant partitions, then expire the oldest day and confirm its storage is released without row-level deletion.",
    dep: []
  },
  "tiered-retention": {
    s: "Moving data from fast, costly storage to cheaper tiers as it ages, and finally deleting it, with shorter lives for bulky and low-value data.",
    d: "Value falls with age: last week's errors are read constantly, last year's almost never. Policy keeps recent events on fast storage with indexes, moves older ones to compressed, unindexed object storage, and deletes at a configured limit. Different data has different lives: raw events, attachments and dumps, aggregates, and symbol files. Cold data takes longer to query, so the interface must say so. Policies tie to plans and to legal limits.",
    k: ["Moving to cold tiers vs deleting early: cold tiers preserve history cheaply, but queries on it are slow and may need an explicit restore.", "One retention for all data vs per type: one is simple to explain, but keeps bulky low-value data as long as small valuable data."],
    p: ["A cold tier that cannot be queried makes old issues unviewable though the data exists.", "Aggregates kept longer than the events that produced them show counts that cannot be inspected."],
    v: "Age a test project's data across each tier boundary and confirm the same event is readable at each step with higher latency when cold, and is gone from every store at the retention limit.",
    dep: ["time-partitioning", "blob-store"]
  },
  "search-index": {
    s: "An inverted index over event text and tags that answers filter and full-text queries across projects quickly and returns matching issues or events.",
    d: "Message text, exception values, tags and selected fields are indexed in a search engine so an engineer can find all events mentioning a user, a URL or a message fragment. Writes are batched and visible after a short refresh interval. The index is derived from stored events and can be rebuilt. It is the most expensive component per event stored, so only some fields are indexed and only for a limited period. Cardinality, shard sizing and the cost of deletions are the typical problems.",
    k: ["Indexing all text vs selected fields: all text finds anything, but index size and cost grow with every event, while selected fields stay cheap and miss unusual searches.", "Separate search engine vs the analytics store: a search engine gives text relevance and flexible matching, while the columnar store is cheaper for exact filters and aggregates."],
    p: ["An index that falls behind after a spike shows missing results for the most recent events.", "Deleted data can remain searchable until segments are merged."],
    v: "Ingest an event with a unique phrase, and confirm it is searchable within the stated refresh delay, then delete it and confirm it no longer returns in any query.",
    dep: ["event-store", "tag-extraction"]
  },
  "query-language": {
    s: "A compact syntax for filtering issues and events by tag, field, time and text, parsed into queries for the underlying stores.",
    d: "Users type expressions like release equals a version and user count above a number, combined with boolean operators, wildcards and relative time. The parser produces a tree, validates fields and types, and a planner chooses which store answers it: the issue store, the index or the analytics store. It must be simple enough for a search box and expressive enough for dashboards, and it must bound cost, since an expensive query run by a dashboard on every page load can harm the whole service.",
    k: ["A purpose-built small language vs SQL exposure: a small language is safe and easy to learn, but limits ad hoc analysis, while SQL is powerful and hard to bound in cost.", "Eager validation vs best effort: validation gives clear errors, but old saved queries break when fields are renamed."],
    p: ["Queries with leading wildcards on text scan the whole index and time out.", "Different semantics for the same operator on issues and events surprise users."],
    v: "Run queries combining a tag, a time range, a negation and a wildcard, and confirm results match a brute-force filter over the same data, and that an overly expensive query is refused with a message.",
    dep: ["search-index", "columnar-analytics", "issue-store"]
  },
  "tag-facets": {
    s: "Counts of the most frequent values of each tag within an issue or search result, showing at a glance what the failing events have in common.",
    d: "On an issue page, a panel lists for browser, release, device, environment and custom tags the share of events with each value. This is often the quickest route to a cause: all failures on one version. The service computes them on demand from the analytics store, or from stored per-issue aggregates, and sampling keeps cost bounded. High-cardinality tags are limited to the top values. Accuracy is traded for speed on large issues.",
    k: ["Computing on demand vs maintaining aggregates: on demand is flexible for any filter, but slow on huge issues, while aggregates are fast and fixed to known tags.", "Sampled facets vs exact: sampling keeps latency flat, but small values can be missing or off."],
    p: ["Facets on a tag with millions of values time out or return meaningless percentages.", "Facets that ignore the current filter show shares of all events and mislead."],
    v: "On an issue with a known distribution of ninety percent on one browser version, confirm the facet shows about ninety percent for it within a latency budget and responds to an added filter.",
    dep: ["columnar-analytics", "tag-extraction"]
  },
  "public-api": {
    s: "A documented programmatic interface to read and change issues, events, releases and settings, used by scripts, dashboards and integrations.",
    d: "Everything the interface does is available through authenticated requests: list and update issues, fetch events, create releases, upload symbols, manage alert rules. Tokens carry scopes tied to organizations, and rate limits protect the service. Pagination uses cursors, since offsets over fast-growing data are slow and unstable. It is the contract that external automation depends on, so changes follow compatibility rules, and expensive queries need bounds.",
    k: ["Cursor pagination vs offset: cursors stay fast and stable while data changes, but cannot jump to an arbitrary page.", "Scoped tokens per integration vs user tokens: scoped tokens limit damage when leaked, but need management, while user tokens act with the person's full access."],
    p: ["Offset pagination over a growing issue list repeats or skips items between pages.", "A token with broad scope stored in a build log gives read access to every project."],
    v: "Page through ten thousand issues while new ones are created and confirm no item is repeated or missing, and that a token scoped to one project cannot read another.",
    dep: ["query-language", "permissions", "issue-store"]
  },
  "dashboards": {
    s: "User-defined collections of charts and tables over error data, such as errors by release over time or top issues by affected users, refreshed on a schedule.",
    d: "A dashboard widget is a saved query with a chart type, run against the analytics store and counters. Many viewers open the same dashboard, so results are cached briefly and the queries are bounded in range and cost. Widgets scale their time bucket to the range chosen. The danger is that dashboards run automatically and forever: a heavy query on a wall display becomes constant load, so limits and caching matter more than features.",
    k: ["Caching results for a short window vs live queries: caching protects the stores from many viewers, but data looks a few minutes old.", "Free-form queries vs a fixed set of widgets: free-form is flexible, but needs cost controls on every widget."],
    p: ["A widget with an unbounded range on a high-volume project runs a full scan every refresh.", "Time bucket choice that changes with range makes charts shift when zooming, confusing users."],
    v: "Open a dashboard from fifty sessions at once and confirm the number of backend queries stays near one per widget per cache window and all viewers see matching values.",
    dep: ["columnar-analytics", "rollup-counters", "query-language"]
  },
  "usage-stats": {
    s: "Reports of events accepted, filtered, dropped and billed per project and period, letting teams see what they use and why events were not stored.",
    d: "Built from the outcome records kept by quota accounting, these reports break down volume by category and by reason: accepted, rate-limited, filtered by rule, sampled out, over quota. They answer why an error is missing, and let teams adjust filters and rates. They must agree with billing and with what the charts show. Their value depends on accuracy and a small delay, since a team reading them during an incident wants to know now whether events are being dropped.",
    k: ["Near real-time breakdown vs daily batch: near real-time helps during an incident, but costs more to compute and is less exact than a reconciled daily total.", "Per-reason detail vs totals: reasons help tuning, but add dimensions to every counter."],
    p: ["Reports that omit a drop reason leave users unable to explain missing events.", "Usage figures that disagree with the invoice damage trust."],
    v: "Generate events that are accepted, filtered, limited and sampled in known quantities, and confirm the report shows each category with its count within a minute, summing to the sent total.",
    dep: ["quota-accounting", "rollup-counters"]
  },
  "release-registration": {
    s: "Creating a record of each deployed version, with its identifier, date and projects, so events can be tied to the version that produced them.",
    d: "The build or deployment pipeline tells the service about a new release by name, often a version or a commit identifier, and the SDK stamps events with the same string. The release record links events, symbol files, commits and deploys, and marks first and last seen. It can be created explicitly by the pipeline or implicitly when the first event arrives. Naming consistency is critical: an SDK and a pipeline that use different strings create two unrelated releases.",
    k: ["Explicit creation in the pipeline vs implicit from events: explicit allows attaching commits and symbols before traffic, while implicit needs no setup but arrives with the first errors.", "Release names as commit identifiers vs version numbers: commit identifiers are exact and unique, but version numbers are readable and may be reused by mistake."],
    p: ["Reusing a release name for different builds blends two versions' errors and symbols.", "Mismatched naming between the SDK and the upload step leaves symbols attached to the wrong release."],
    v: "Create a release in the pipeline, deploy, and confirm events from the new build show that release, a release page lists them, and the symbol files uploaded under the name are used.",
    dep: ["issue-store"]
  },
  "commit-association": {
    s: "Linking a release to the list of source control commits it contains, so each issue can be related to specific changes and authors.",
    d: "At release time the pipeline, or the code host integration, records the range of commits since the previous release, with authors and the files each commit changed. The service stores this on the release. Later features use it: suspect commits, resolve-in-next-release, and showing who changed a file in a stack trace. It depends on the integration having read access to the repository and on the previous release being known, otherwise the range cannot be computed.",
    k: ["Computing commit ranges server-side from the host vs sent by the pipeline: server-side needs repository access and permissions, while pipeline-sent data works with any host but depends on correct scripts.", "Per-file change data vs commit messages only: file lists enable culprit matching, but cost more to fetch and store."],
    p: ["A release whose previous release is unknown receives the whole repository history as its commit list.", "Rebased or squashed history breaks the link between recorded identifiers and the repository."],
    v: "Create two consecutive releases with three commits between them and confirm the second release lists exactly those three with authors and changed files.",
    dep: ["release-registration", "code-host-integration"]
  },
  "suspect-commits": {
    s: "Identifying the most likely commit that caused an issue by matching the files and lines in its stack trace to recent changes in the release.",
    d: "For each issue, the service takes in-app frames, finds commits in the introducing release that touched those files, and ranks them by how recently and how directly they changed the frame's function or line, optionally using blame data from the code host. The top candidates are shown with their authors, who can be suggested as owners. It is a heuristic: it is helpful when the cause is a recent change in the failing file, and misleading when the cause is elsewhere.",
    k: ["Ranking by file touch vs line-level blame: file touch is cheap and broad, but blame is more precise and needs repository access.", "Suggesting an author as assignee vs showing the commit only: suggestion speeds triage, but blames the wrong person when the heuristic misses."],
    p: ["A shared utility file touched by many commits makes every issue point at the latest unrelated change.", "Suspect lists shown with high confidence on weak evidence damage trust in the feature."],
    v: "Introduce a bug in a known commit that edits the failing function, deploy it, and confirm the issue's top suspect is that commit; then raise an error caused by configuration and confirm no confident suspect is shown.",
    dep: ["commit-association", "in-app-detection"]
  },
  "regression-detection": {
    s: "Noticing that an issue marked resolved has returned in a release after the fix, and reopening it, while not reopening it for stale events from old releases.",
    d: "When a person resolves an issue, possibly in a named release, the service records it. A new event matching that issue then decides: if it comes from the fixed release or a later one, it is a regression and the issue is reopened and alerted. Events from older releases still running are expected and ignored. It needs ordered releases, usually by creation time or by version semantics. It is hard because release order is not always clear, with multiple branches and rollbacks.",
    k: ["Version-aware regression vs any new event reopens: version-aware avoids noise from lingering old clients, but depends on correct release ordering.", "Auto-reopen vs mark and notify only: reopening keeps the list true, but reopens flap on partial rollouts."],
    p: ["Rolling back to an old release makes its errors look like regressions of everything fixed since.", "Without release data, every straggling old client reopens a resolved issue."],
    v: "Resolve an issue in release two, send the error from release one and confirm it stays resolved, then send it from release three and confirm it reopens, is marked as a regression and triggers its alert.",
    dep: ["release-registration", "issue-states", "new-issue-triggers"]
  },
  "release-health": {
    s: "Metrics per release built from session data: crash-free session and user rates, adoption share and error counts, used to judge a rollout.",
    d: "Sessions report their outcome, and the service aggregates per release and interval into crash-free rates, the number of users and the share of traffic on each version. During a staged rollout these show whether the new version is healthier than the old before it reaches everyone. The metrics are only as good as session capture: missing or sampled sessions skew them. Small rollouts produce noisy rates, so the interface shows volumes alongside the percentages.",
    k: ["Session-based rates vs event-based counts: sessions normalize for traffic and show true crash rates, but require SDK session tracking.", "Showing percentages alone vs with volume: percentages compare releases, but mislead when the sample is a few sessions."],
    p: ["A new release with one hundred sessions and one crash shows a one percent crash rate that means little.", "Sessions from old SDKs that do not report make a release look healthier than it is."],
    v: "Send known session counts and crashes for two releases and confirm the crash-free rates and adoption shares match the computed values, and that the small release is flagged as low volume.",
    dep: ["session-tracking", "rollup-counters", "release-registration"]
  },
  "deploy-tracking": {
    s: "Recording when a release reached an environment, so issue pages show first occurrence relative to deploys and teams can correlate error spikes with rollouts.",
    d: "The pipeline posts a deploy record: release, environment, start and finish time. Charts overlay these as markers, issue pages show the first deploy in which the issue appeared, and alerts can be scoped to a specific environment. It also supports resolve-in-next-deploy workflows. The data is simple, but its value is correlation: the first question in an incident is what changed, and the deploy marker is the quickest answer.",
    k: ["Pipeline-pushed deploy records vs inferred from first sighting: pushed records are exact, while inference needs no setup but shows the time of first error rather than the deploy.", "One record per environment vs per host: per environment is simple, while per host shows partial rollouts and costs many more records."],
    p: ["Deploys not recorded for a hotfix make a spike appear to come from nowhere.", "Environment names that differ between SDK and deploy record split data into separate views."],
    v: "Record a deploy to production, trigger errors afterwards, and confirm the issue's first-seen is marked relative to that deploy and the chart shows the marker at the recorded time.",
    dep: ["release-registration"]
  }
});
