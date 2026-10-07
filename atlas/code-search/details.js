// Details for the code search plate, part 1: search interface, query language, query execution.
ATLAS.details("code-search", {
  "query-box-and-autocomplete": {
    s: "The input field where people type queries, with suggestions for filters, repositories, paths and symbols as they type, and with errors shown before the query is run.",
    d: "The client sends partial input to a suggestion endpoint that completes filter names, repository and path prefixes, and recently used queries. It also parses locally so that an unbalanced quote or invalid pattern is flagged immediately. Suggestions come from small dedicated indexes of repository names and paths, not the main shards, so they return in tens of milliseconds. The difficulty is latency and cost: each keystroke is a request, so input is debounced, responses are cancelled when stale, and suggestions must respect permissions.",
    k: ["Suggest from dedicated small indexes vs the main index: suggestions stay fast and cheap, but names can lag the real index and need separate upkeep.", "Search as you type vs search on submit: instant feedback helps exploration, but multiplies load and shows half-typed patterns that match everything."],
    p: ["Suggestions that reveal repository names a user cannot open leak the existence of private projects.", "Firing a full search per keystroke with a broad pattern floods the shards with queries nobody wanted."],
    v: "Type a repository prefix and confirm suggestions arrive within 100 ms and include only repositories the test user can read. Type an unclosed quote and confirm an error appears without any search request.",
    dep: ["query-parser", "repository-visibility"]
  },
  "results-page": {
    s: "The page that lists matching files with highlighted snippets, grouped by repository, with counts, filters and pagination, and which keeps updating as slower shards respond.",
    d: "Results arrive as a stream from the coordinator, so the first hits show within a fraction of a second while the rest fill in. Each result carries repository, path, matched lines with context, and a truncation flag when limits cut the list. Sidebars offer refinements by language and repository using aggregate counts. It is hard because the result count is rarely exact: the engine stops early for latency, so counts, pagination and totals must be honest about being partial.",
    k: ["Streaming results vs one response: users see hits sooner and slow shards do not block, but ordering changes as data arrives and pagination is awkward.", "Exact totals vs 'more than N': exact counts cost a full scan of every candidate, while capped counts keep latency flat but frustrate people who want to measure."],
    p: ["Showing a total that silently excludes shards that timed out makes missing results look like no results.", "Reordering rows while the user is about to click causes mistaken clicks on the wrong result."],
    v: "Run a query matching tens of thousands of files and confirm the first results render in under a second, the page marks the result list as truncated, and a deliberately slowed shard produces a visible partial-results notice.",
    dep: ["query-coordinator", "snippet-extraction", "match-highlighting"]
  },
  "code-viewer-with-navigation": {
    s: "A file view with syntax coloring where names are clickable to jump to definitions and references, with a sidebar for directory structure and symbol outline.",
    d: "The viewer fetches file content from the content store at a specific revision, colors it with a lexer, and overlays navigation data: hover cards, go-to-definition and find-references. Clicking a name issues a navigation query to the code graph, using precise data if uploaded and heuristic matching otherwise. Large files are rendered in windows. The hard parts are consistency, since the revision shown must match the revision navigated, and responsiveness on files of hundreds of thousands of lines.",
    k: ["Render only visible lines vs the whole file: opens huge files instantly, but find-in-page and anchors need custom handling.", "Navigation computed on click vs precomputed per file: precomputing makes hovers instant but multiplies storage; on-click keeps the index small and adds latency."],
    p: ["Navigating from a stale revision lands on a line that has since moved, so the definition shown is wrong.", "Syntax coloring that disagrees with the real parser mislabels names and misleads the click targets."],
    v: "Open a file at a pinned revision, click a call to a function defined in another repository, and confirm the landing file and line match what the compiler resolves. Open a 500,000-line file and confirm first paint is under a second.",
    dep: ["content-store", "definition-index", "reference-index", "history-links"]
  },
  "url-encoded-queries": {
    s: "The convention that a query, its filters and the chosen result sort order live entirely in the page address, so searches can be bookmarked, shared in chat and replayed exactly.",
    d: "The client serializes query text, pattern type and flags into URL parameters and restores them on load. Because a link is a request, the server treats it like any other query, applying the opener's permissions rather than the sharer's. Stable parameters let code review tools, wikis and ticket systems embed searches. The challenge is compatibility: once people paste links into documents, changing the syntax, defaults or filter names breaks old links, so versions of the grammar must be supported long after they stop being recommended.",
    k: ["Everything in the URL vs server-stored saved queries: links stay portable and need no state, but long structural queries produce unwieldy addresses.", "Defaults omitted from the URL vs always explicit: shorter links, but a changed default silently changes what an old link returns."],
    p: ["Queries containing a secret pasted into a link persist in browser history, proxies and logs.", "Changing the default match mode makes every existing bookmark return different results with no warning."],
    v: "Copy the address of a filtered search, open it in a clean session as a different user, and confirm the query and filters are identical while the results reflect that user's permissions.",
    dep: ["query-parser"]
  },
  "saved-searches-and-alerts": {
    s: "Stored queries that run on a schedule or on each new commit and notify people when new matches appear, used to watch for deprecated calls, risky patterns or leaked credentials.",
    d: "A saved search stores query text, owner and notification target. The scheduler runs it against the current index, compares matches with the previous set, and sends only the difference. Running on commit rather than on a timer needs the indexer to publish change events. It is hard because alert queries accumulate and each costs index time; a notification on a broad pattern is noise; and permissions apply to the recipient, not the author, so the same alert may show different matches to different people.",
    k: ["Scheduled re-runs vs evaluating changes at index time: re-runs are simple and need no indexer changes, while change-time evaluation scales with commits rather than with the number of saved queries.", "Notify on any new match vs a digest: immediacy catches secrets quickly, but unfiltered notifications train people to ignore them."],
    p: ["An alert that fires on the first run for every historical match buries the one new result.", "Notifications sent with snippets can disclose code to people who no longer have access to the repository."],
    v: "Save a query for a unique string, commit a file containing it, and confirm one notification arrives after the next index update. Commit again unchanged and confirm no second notification.",
    dep: ["query-coordinator", "permission-filtering", "freshness-tracking"]
  },
  "editor-plugins": {
    s: "Extensions that bring search and navigation into editors and code review tools, sending queries to the same backend and opening results at the matching line.",
    d: "A plugin authenticates against the service, sends the current selection or typed query, and maps results back to local files when the working copy matches. It can also request definitions and references for the symbol under the cursor, which the server resolves at a given revision. Versioning is the main burden: many editor versions run in the field at once, so the server API must stay compatible, and results for a local working copy with uncommitted edits can disagree with the indexed revision.",
    k: ["Plugin calls the public API vs a private channel: one contract to maintain and test, but plugin needs are limited to what the public API exposes.", "Open results in the editor vs the web view: stays in flow and uses local files, but cannot show permission-filtered files the user has not cloned."],
    p: ["Results link to line numbers from the indexed revision, which are off in a locally modified file.", "A plugin that stores a long-lived token in plain text makes a stolen laptop a source code breach."],
    v: "Select a function name in a local checkout, run the plugin search, and confirm results include a definition in another repository and that opening it lands on the correct line at the indexed revision.",
    dep: ["web-api-and-cli", "definition-index"]
  },
  "web-api-and-cli": {
    s: "A stable programmatic interface for queries, streaming results and navigation lookups, with a command-line client used by scripts, bots and refactoring tools.",
    d: "The API accepts query text plus options such as limits, timeouts and result fields, and returns results as a stream or paged list. Authentication uses tokens tied to a user so permission filtering is unchanged. A command-line wrapper pipes results into other tools for large-scale refactors, such as listing every file that calls a function being removed. It is hard because automated callers behave differently from people: they paginate everything, retry aggressively and issue thousands of queries, so quotas and cost accounting become essential.",
    k: ["Expose full result streams vs capped pages: streams suit bulk refactoring, but a runaway client can hold shards for long periods.", "Version the API explicitly vs evolve compatibly: explicit versions protect scripts, at the cost of supporting several for years."],
    p: ["A script that retries timeouts without backoff multiplies load exactly when the service is already slow.", "Shared bot tokens with broad access let one leaked credential read all indexed code."],
    v: "Run the same query through the CLI and the web page and confirm the same ordered results. Exceed the documented rate limit with a script and confirm a clear throttling response rather than timeouts.",
    dep: ["query-coordinator", "rate-limiting", "permission-filtering"]
  },
  "query-parser": {
    s: "Turns the typed query into a structured tree of terms, filters and operators, reporting errors with a position, and fixing the ambiguity between literal text and patterns.",
    d: "A tokenizer splits input on spaces, quotes and operators; a parser builds a tree of terms combined with and, or and not, with filters attached as typed fields. A mode flag decides whether bare terms are literals, regular expressions or structural patterns. It then validates, for example that a pattern compiles and that a filter value is legal. The hard part is forgiveness: developers paste code with quotes, parentheses and backslashes, so rules must guess intent without turning common text into syntax errors.",
    k: ["Strict grammar vs permissive fallbacks: strict errors are predictable and testable, but permissive handling of pasted code saves people from escaping every symbol.", "Literal by default vs pattern by default: literal avoids surprising metacharacter behavior, while pattern by default favors experts at the cost of broken pasted strings."],
    p: ["A paren in a pasted code snippet is read as grouping, and the query returns nothing without a useful error.", "Changes to precedence of and and or silently alter old saved searches."],
    v: "Feed a corpus of several thousand real queries through the parser and confirm every one yields either a tree or an error with a character position, and that tree output for a fixed set matches a stored snapshot.",
    dep: []
  },
  "literal-and-regex-terms": {
    s: "The two basic ways to say what text to find: an exact string, or a regular expression, each with options for case sensitivity and word boundaries.",
    d: "A literal term is matched byte for byte after case folding rules; a regular expression is compiled to an automaton and also analyzed to extract the literal substrings that any match must contain, which become the index lookups. Options include case sensitivity, whole word and multiline. It is hard because regular expression engines differ in features, and a feature such as backreferences cannot run in guaranteed linear time, so the engine must either limit the dialect or accept pathological queries.",
    k: ["Linear-time regex dialect vs full backtracking features: bounded worst case protects the shared service, but users lose backreferences and lookaround.", "Smart case (insensitive unless uppercase typed) vs explicit flag: fewer keystrokes, but behavior is less obvious and harder to reproduce in scripts."],
    p: ["A pattern such as a lone wildcard has no required substring, so it cannot use the index and scans everything.", "Unicode case folding differences make a match in the index fail verification, or the reverse."],
    v: "Search a literal and a regex that contain the same text and confirm identical hits, then run a pattern with no literal fragment and confirm the engine rejects it or bounds it with a stated limit.",
    dep: ["query-parser", "case-folding"]
  },
  "boolean-and-negation": {
    s: "Operators to combine terms (and, or, not) and to exclude files containing a pattern, with defined precedence and grouping.",
    d: "Terms are combined as set operations over candidate files: and intersects, or unions, and negation subtracts. Negation is the awkward one, because an index lists where text is present, not absent, so a not term cannot be answered from the index alone; it must be applied after a positive term narrows candidates. The planner rejects queries made only of negations. Whether terms must match on the same line or merely in the same file is a decision visible to users.",
    k: ["File-level boolean semantics vs line-level: file-level is cheap and matches intuition for finding files, while line-level matches the grep model but costs verification of each line.", "Allow pure negation vs require a positive term: allowing it feels complete, but it asks for an inverse over the entire corpus."],
    p: ["Users read 'a and b' as same line when the engine means same file, then think results are wrong.", "A query that is only negations either scans everything or returns nothing, with no explanation."],
    v: "Query for term A and not term B and confirm no result contains B. Query for only not B and confirm a clear message appears instead of a scan or empty page.",
    dep: ["query-parser", "candidate-intersection"]
  },
  "path-filter": {
    s: "Restricts results to files whose path matches a pattern, or excludes matching paths, used to include a directory or skip tests and vendored code.",
    d: "A path filter is a regular expression or glob applied to the full file path. The filename index narrows candidate files by path quickly, and the planner often applies the path condition first because it is highly selective. Negated paths remove test and generated directories. It is hard because paths are matched against the path at the revision being searched, files move, and a monorepo has directory structures where a single pattern can match millions of files.",
    k: ["Evaluate path before content vs after: path first shrinks the candidate set cheaply, but poorly selective patterns waste a lookup.", "Glob syntax vs regular expressions: globs are familiar and safe, regular expressions are more expressive but harder to read."],
    p: ["Paths with unusual characters or case differences match on one operating system convention and not another.", "An unanchored pattern such as 'test' matches directories the user did not intend."],
    v: "Search a term with a path filter limited to one directory and confirm every result path begins with it. Add a negated test directory filter and confirm no result path contains it.",
    dep: ["filename-index", "query-planner"]
  },
  "language-filter": {
    s: "Restricts results to files of a given programming language, identified by detection at index time rather than by file extension alone.",
    d: "At index time each file receives a language label from detection, stored as metadata in the shard. A filter on language becomes a cheap check or a pre-filter that drops candidate files before verification. Aggregate language counts also power result facets. The difficulty is accuracy: extensions are ambiguous, files may have none, and generated or embedded languages (a template with inline scripts) have more than one valid label.",
    k: ["Label at index time vs detect at query time: index-time labels make filtering free per query, but a detector improvement requires reindexing.", "One label per file vs several: a single label is simple to filter and display, but fails for mixed-language files."],
    p: ["A misdetected header file excludes real matches from a filtered search without any sign.", "Case variants of a language name, or aliases, return different results."],
    v: "Search a term in a repository with mixed languages using the language filter, and compare to a manual listing by extension. Confirm results include extensionless scripts that the detector labels correctly.",
    dep: ["language-detection", "query-planner"]
  },
  "repository-filter": {
    s: "Restricts results to chosen repositories, by name pattern or by a named set, and can also select repositories by metadata such as topics, owners or forks.",
    d: "A repository filter is resolved before shard fan-out: names or patterns are matched against the repository catalog to produce a set of repository ids, which determine which shards to query at all. This is the most effective way to cut cost, since a filter that selects ten repositories out of a hundred thousand touches few shards. Named sets let teams define their scope once. It is hard because the catalog changes constantly, and a set defined by metadata may be stale.",
    k: ["Resolve repository set before fan-out vs filter inside each shard: pre-resolution avoids contacting irrelevant servers, but needs a catalog consistent with the shard map.", "Repository sets by pattern vs explicit lists: patterns keep up with new repositories, while lists are reproducible."],
    p: ["A catalog out of sync with the index sends the query to shards that no longer hold the repository.", "Forks and archived copies appear as duplicates unless excluded by default."],
    v: "Run a query with a repository pattern that matches five repositories and confirm through tracing that only the shards holding them were contacted.",
    dep: ["shard-map", "repository-discovery"]
  },
  "revision-filter": {
    s: "Selects which branch, tag or commit to search, defaulting to the default branch, so that results reflect one coherent state of the code.",
    d: "Indexes usually contain only the default branch plus a short list of configured branches or recent releases. A file present on several indexed branches is stored once with a bitmask of the branches that contain it. Searching an unindexed revision either fails or falls back to slower on-demand scanning of a mirror. The hard part is cost: each additional indexed branch multiplies index size in the worst case, and deciding which to keep is a trade between coverage and storage.",
    k: ["Index only default branches vs many branches: small and fast, but people searching release branches see nothing.", "Deduplicate file content across branches vs separate copies: dedup keeps size near one copy, but adds branch masks to every lookup and complicates deletion."],
    p: ["A query silently ignores a branch that was never indexed, so people conclude code does not exist.", "Index size grows without limit as long-lived feature branches are added."],
    v: "Search a string present only on a release branch, with and without the branch filter, and confirm results appear only with it and carry the branch label.",
    dep: ["branch-selection", "content-store"]
  },
  "symbol-filter": {
    s: "Restricts matches to symbol names, such as definitions of functions and types, so a search for a name does not return every comment and string that mentions it.",
    d: "A symbol filter consults the symbol index built from parsed definitions, optionally restricted by kind (function, class, constant). The planner may answer a symbol-only query entirely from the symbol index without touching file contents. Combined with text terms it narrows candidates to files that define the symbol. It is hard because symbol extraction varies in quality by language: a language without a good parser gives sparse results, and the filter then appears to say a symbol does not exist.",
    k: ["Symbol filter backed by a separate index vs a pattern on definitions: a dedicated index is fast and exact, but only exists for languages with parsers.", "Match on name only vs qualified names: simple and tolerant, but returns many unrelated definitions in large codebases."],
    p: ["A symbol defined through macro or code generation is not in the index, so a search for it finds nothing.", "Inconsistent kind names between languages make 'kind: function' miss methods."],
    v: "Search a symbol filter for a function name and confirm results are definitions only. Compare the result list to the language compiler's own symbol table for one repository.",
    dep: ["symbol-index", "symbol-extraction"]
  },
  "query-planner": {
    s: "Chooses the order and method for evaluating a parsed query: which filters narrow first, which index answers each term, and what must be left for verification.",
    d: "The planner takes the query tree and estimates selectivity of each condition from index statistics: how many files a repository, language or path covers, how rare a substring is. It reorders so that cheap, selective conditions run first, converts regular expressions into index lookups, and marks conditions that can only be verified by reading file content. It outputs a plan the coordinator ships to shards. The hard part is estimation at scale: statistics are per shard and approximate, and a bad estimate can turn a fast query into a scan.",
    k: ["Static heuristics vs statistics-driven planning: heuristics are predictable and simple, but statistics adapt to skewed corpora at the cost of stale numbers.", "Plan once centrally vs per shard: one plan is consistent, while per-shard plans can adapt to each shard's contents but make debugging harder."],
    p: ["A plan that picks a very common trigram first reads gigabytes of postings for a query that could have used a rare one.", "Planner and executor disagreeing on query semantics produce results that differ from the documented language."],
    v: "Run an explain on a query combining a rare and a common term and confirm the plan reads the rare term's postings first. Time it against the reverse order forced manually and confirm a large speedup.",
    dep: ["query-parser", "regex-to-index-plan", "posting-lists"]
  },
  "query-coordinator": {
    s: "The service that receives a query, plans it, sends it to the relevant shards, enforces limits, merges answers and streams the final results back to the caller.",
    d: "A coordinator is stateless and horizontally scaled. For each query it authenticates the user, resolves permissions and repository scope, asks the shard map which servers hold the relevant shards, dispatches the plan, then combines results while watching the time budget. It decides when enough results have arrived to stop. The hard part is tail latency: the answer is only as fast as the slowest necessary shard, so it must hedge, cancel and degrade gracefully.",
    k: ["Stateless coordinators vs sticky sessions: any node can serve any query and failures are invisible, but nothing is cached per user across requests.", "Wait for all shards vs respond with partial results at a deadline: completeness is higher when waiting, but a single slow shard makes every query slow."],
    p: ["One overloaded shard causes every coordinator to hold open connections, so a localized slowdown becomes a global outage.", "A coordinator that forgets to forward the deadline lets cancelled queries keep running on shards."],
    v: "Make one shard respond slowly and confirm the query returns within its deadline with a partial-results marker, and that the shard's work for the cancelled query stops, as shown by its active request count.",
    dep: ["shard-fanout", "result-merging", "shard-map", "permission-filtering"]
  },
  "shard-fanout": {
    s: "Sends the query plan to every shard that could contain matches, in parallel, and gathers the responses within a deadline.",
    d: "Given the set of shards left after repository scoping, the fan-out opens parallel requests to one replica of each, balancing load across replicas. It sets a per-request deadline, issues a duplicate request to a different replica if one is slow (hedging), and cancels outstanding work once it has enough results. Connection pooling and multiplexing keep thousands of simultaneous requests cheap. It is hard because the fan-out width equals the shard count: adding shards makes each query touch more servers and amplifies tail latency.",
    k: ["Query every shard vs route by metadata: querying all is simple and complete, but cost grows with corpus size, while routing needs reliable metadata and fails silently when it is wrong.", "Hedged requests vs single request: hedging cuts the tail, at the price of extra load that can itself cause overload."],
    p: ["Hedging without a cap doubles load during a slowdown, which deepens the slowdown.", "A replica that is unhealthy but still accepting connections receives its share of traffic and stalls queries."],
    v: "Run one broad query and confirm via tracing that requests went to all expected shards in parallel, and that adding a 500 ms delay to one replica leads to a hedge request, with overall latency near the fast replica's.",
    dep: ["shard-map", "index-servers", "replica-sets"]
  },
  "regex-to-index-plan": {
    s: "Analyzes a regular expression to extract the substrings every match must contain, then turns them into an index query that returns a small superset of the true matches.",
    d: "The pattern is parsed into its syntax tree and each node produces a set of required strings: a literal gives itself, a concatenation combines, an alternation unions, and a repeat of zero or more times gives nothing. The result is a boolean combination of trigrams that any matching file must satisfy. The index returns candidate files for that expression, which the verifier then checks. It is hard because the analysis must never exclude a real match, while still being selective: a query such as a character class repeated yields no useful constraint.",
    k: ["Exact required-substring extraction vs relaxed over-approximation: exact is tighter but code is complex, while an over-approximation is safe but returns more candidates.", "Cap the information kept per node vs full expansion: a cap avoids explosion of alternatives for large character classes, but loses selectivity."],
    p: ["A bug that drops a possible match path makes real results disappear with no error, because the index is trusted.", "A pattern with a large alternation expands to thousands of trigram combinations and slows planning more than it saves."],
    v: "Generate random regular expressions and files, run each through the index plan and a full scan, and confirm the index path never misses a file the scan finds, over at least a million cases.",
    dep: ["literal-and-regex-terms", "trigram-index", "posting-lists"]
  },
  "candidate-intersection": {
    s: "Combines posting lists for each required substring, keeping only files that appear in all of them, so only a small set of files needs full verification.",
    d: "Each trigram's posting list is a sorted list of document ids. Intersection walks several lists together, starting from the shortest and skipping ahead in longer ones using skip pointers or galloping search, and the result is the candidate set. Unions handle alternations and filters apply as additional lists or bitmaps. The challenge is the cost of long lists: common substrings can list millions of documents, so the planner chooses which terms to intersect and in what order to avoid reading them.",
    k: ["Intersect all lists vs stop after a few selective ones: full intersection gives the smallest candidate set, but stopping early saves reads when remaining lists are huge and the candidate set is already small.", "Sorted ids with skipping vs bitmaps: sorted lists compress and scale, while bitmaps are fast for dense sets and costly for sparse ones."],
    p: ["Selecting terms by order of appearance rather than size reads the longest list first and makes a cheap query slow.", "Candidate sets that remain huge push cost into verification, where each file requires reading content."],
    v: "Intersect lists for three substrings of known frequencies and confirm the candidate set equals a brute-force intersection and that the number of postings read is close to the shortest list's length.",
    dep: ["posting-lists", "trigram-index"]
  },
  "candidate-verification": {
    s: "Reads each candidate file's content and runs the real pattern against it, because the index only proves the substrings are present, not that the full pattern matches.",
    d: "For each candidate the shard loads the file text from the content store, runs the compiled regular expression or literal matcher, and records matching line numbers and offsets. Matching is line-oriented with case and word-boundary options. Verification dominates the cost of broad queries, so it runs in parallel across files, uses memory-mapped content and stops once enough matches are found. The hard part is cost control: a candidate set of a million files means reading a million files, however fast the index was.",
    k: ["Verify with the same regex engine as the planner assumes vs a fast prefilter then a general engine: a shared engine is consistent, while prefilters such as vectorized substring search speed the common case.", "Verify lazily as results stream vs all at once: lazy start gives early results, but cannot compute exact counts."],
    p: ["A verifier that uses different case or newline rules than the index produces files that were selected but show zero matches.", "A pathological pattern in a backtracking engine pins a core for minutes on one file."],
    v: "Query a pattern whose literal fragments occur in many files but whole pattern in few, and confirm the shard reports many candidates, few verified files, and that every reported line matches under an independent grep.",
    dep: ["content-store", "literal-and-regex-terms", "candidate-intersection"]
  },
  "early-termination": {
    s: "Stops work on a query once enough results are found or the time budget is spent, and says so in the response so callers know the list is incomplete.",
    d: "Each shard receives a limit on files and matches and a deadline. Documents are visited in an order that favors important ones first, so stopping early keeps the best results, not random ones. The shard returns a flag meaning truncated, and the coordinator surfaces it. Without it, one broad query could read the whole corpus. The difficulty is correctness of ranking under truncation: the top results depend on visiting order, and a shard that stops early can omit a better match that the user would have wanted first.",
    k: ["Limit by result count vs by time: count limits are predictable for users, while time limits protect the service but give variable completeness.", "Visit in importance order vs index order: importance order improves results under truncation, at the cost of an extra ordering structure in every shard."],
    p: ["Truncation not shown to users makes absence of a result look like proof the code is not there.", "Per-shard limits of N give up to N times shard count results, bloating memory in the coordinator."],
    v: "Run a query matching a million files with a limit of 100 and a 1 second deadline, and confirm exactly 100 results, a truncated flag, completion in about the deadline, and that results come from highly ranked repositories.",
    dep: ["query-coordinator", "ranking-signals"]
  },
  "result-merging": {
    s: "Combines the ranked result lists from many shards into one ordered, deduplicated list, keeping scores comparable across shards.",
    d: "Each shard returns its best results with scores. The coordinator performs a k-way merge by score, drops duplicates such as the same file from replicas or forks, and applies final limits and grouping by repository. It must then hand back aggregate counts and facets. The challenge is comparability: scores computed on different shards use different local statistics, so shards must either use globally agreed scoring functions or normalize before merge, or the order depends on which shard held a file.",
    k: ["Shard-local scoring vs global statistics: local scoring needs no coordination and scales, but frequency-based signals differ between shards; global stats are consistent and need refresh.", "Merge in the coordinator vs a tree of mergers: central merging is simple, while a tree reduces memory and network on very wide fan-outs."],
    p: ["Duplicates from replicated shards appear twice when deduplication keys are not stable across shard versions.", "A shard that returns unsorted results breaks the k-way merge and silently misorders the whole list."],
    v: "Split one corpus across 1 shard and across 16, run the same queries on both, and confirm the top 20 results and their order are the same.",
    dep: ["shard-fanout", "ranking-signals", "fork-deduplication"]
  },
  "query-cache": {
    s: "Stores recent results or intermediate work such as posting list reads and candidate sets, keyed by the query and the index version, to speed repeated and refined searches.",
    d: "Caching works at several levels: a result cache keyed by normalized query, user permission fingerprint and index version; a cache of decoded posting lists in memory; and a cache of compiled patterns. Entries are invalidated when a shard updates. Hit rates are modest for ad hoc searches but high for dashboards, bots and links shared in chat. The hard part is correctness: a cached result must never be shown to a user with different permissions, and must not outlive the index version it was computed on.",
    k: ["Cache final results vs intermediate postings: results are cheapest to serve but rarely repeat exactly, while postings help many different queries sharing common terms.", "Include permissions in the key vs filter after caching: keying by permission set is safe but fragments the cache, while filtering afterward needs caching of unfiltered results."],
    p: ["A cache key that omits the permission set leaks results across users.", "Not keying by index version serves results missing code committed minutes ago."],
    v: "Run an identical query twice and confirm the second is served from cache. Then update a shard and confirm the next run misses and shows the new match. Repeat as a user with fewer permissions and confirm no cached rows from the first user appear.",
    dep: ["permission-filtering", "freshness-tracking"]
  },
});
