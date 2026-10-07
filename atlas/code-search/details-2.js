// Details for the code search plate, part 2: ranking, structural and semantic search, access control, navigation, file analysis.
ATLAS.details("code-search", {
  "ranking-signals": {
    s: "The set of features combined into a relevance score: match quality, where in the file and path the match is, file and repository properties, and how often code is used or changed.",
    d: "A score is a weighted combination computed per matching file or line: whether the match is a whole word, in a definition, in the filename, in a comment, how short the file is, repository importance and recency. Most signals are stored with the document at index time so scoring needs no extra reads. Weights are tuned with click data and judged query sets. The hard part is that code search queries are exact, so ranking only orders matches that are all correct; a poor ordering hides the one result the user wanted among thousands.",
    k: ["Hand-tuned weighted sum vs learned model: a weighted sum is explainable and cheap to compute per candidate, while a learned model can capture interactions but is hard to debug and needs training data.", "Rank at file level vs line level: file ranking suits finding a place to read, while line ranking suits locating a specific use at the cost of more scoring work."],
    p: ["A boost that favors short files floods results with tiny test fixtures.", "Tuning against one team's clicks hurts every other team's results."],
    v: "Build a judged set of at least 100 real queries with known best results, and confirm the correct answer appears in the top 3 for a stated fraction of them, and that this fraction does not drop after a change.",
    dep: ["filename-boosts", "definition-boost", "repository-importance", "recency-and-popularity"]
  },
  "filename-boosts": {
    s: "A ranking increase for results where the query matches the file's name or a path segment, because people searching for a name often want the file with that name.",
    d: "The filename and path are indexed as separate fields. A match in the base name scores above a match in the body, an exact base name match above a partial one, and a match in a directory name below that. Common names such as index or main are discounted by how many files share them. The difficulty is balance: strong filename boosts bury the actual use sites the user was looking for, and weak ones hide files that are obviously the intended target.",
    k: ["Large filename boost vs modest: large boosts help navigate to a file by name, while modest ones preserve content-match relevance for code-reading queries.", "Match against base name vs full path: base name is precise, full path catches directory conventions but lets long paths match accidentally."],
    p: ["A file named after a common word outranks the real definition for every query that uses it.", "Boosts that ignore case rules rank README variants unpredictably."],
    v: "Search for a unique filename and confirm that file is the first result. Search for a common word that is also a filename and confirm definitions of that word still appear in the top results.",
    dep: ["filename-index", "ranking-signals"]
  },
  "definition-boost": {
    s: "A ranking increase for matches that are the definition of a name rather than a use, using symbol data when available and heuristics when not.",
    d: "If the matching line is where a symbol is declared, as recorded in the symbol index, the result is boosted over a call, import or comment. For languages without parsers, heuristics look for declaration patterns such as keywords before the name. Definitions of exported or public symbols can rank above private ones. It is hard because a search for a name may want the definition, the callers or the documentation, and the engine has to guess; tuning for definitions hurts people looking for usage examples.",
    k: ["Boost definitions vs treat all matches equally: boosting answers where is this defined quickly, but demotes usage examples that people often want.", "Parser-based vs pattern-based detection: parsers are accurate but limited to supported languages, patterns work everywhere but misfire."],
    p: ["Generated copies of a definition, such as stubs, rank next to the real one and confuse people.", "A name defined in many repositories returns many identical-looking definitions and no signal about which is canonical."],
    v: "Search a function name defined once and used in hundreds of places and confirm the definition appears first, with usages after it. Repeat for a language without a parser and confirm the heuristic ranks the declaration line first.",
    dep: ["symbol-index", "ranking-signals"]
  },
  "repository-importance": {
    s: "A per-repository score that raises results from actively used, widely depended-on code over archived, abandoned or experimental repositories.",
    d: "The score combines stars or watchers, number of dependents, commit activity, size of the contributor set and flags such as archived or fork. It is computed periodically outside the query path and written into each shard as a field. Results from a high score repository are boosted, so shared libraries appear above forks and scratch projects. The hard part is that popularity is a weak stand-in for relevance and can freeze the ranking: a new important repository starts with no signals and stays invisible.",
    k: ["Computed score vs manually curated tiers: computed scores need no upkeep but can be gamed or misjudge, while curated tiers are accurate and need an owner.", "Strong effect vs mild: strong effects tidy results, but bury small repositories that are the right answer for specialist teams."],
    p: ["Archived repositories keep a high score from past activity and keep showing outdated code first.", "A repository copied into dozens of services is ranked by its copies and not by its origin."],
    v: "Search a symbol defined in both an active library and an archived fork, and confirm the active library result ranks higher, then archive the library in a test and confirm the order flips after the next score refresh.",
    dep: ["ranking-signals", "repository-discovery"]
  },
  "recency-and-popularity": {
    s: "Ranking signals based on how recently a file changed and how often it is opened, imported or referenced, which favor live code over dormant code.",
    d: "At index time each file receives a last-modified time from history and a reference count from the code graph, such as how many files import it. Both are normalized and fed to the scorer. Click and open counts from usage logs can add a popularity signal, aggregated and stored per file. It is hard because these signals are weak and noisy: a file untouched for years may be stable and correct, and recency favors code churn, such as generated files that change every day.",
    k: ["Use reference counts from the code graph vs click logs: graph data is available from day one and private, while click data reflects actual need but starts empty and reinforces what is already shown.", "Decay recency smoothly vs a cutoff: smooth decay avoids cliffs, but a cutoff is easier to explain and test."],
    p: ["Frequently regenerated files outrank hand-written source because they changed today.", "Click-based popularity makes the first page self-reinforcing, so better results never surface."],
    v: "Compare two copies of the same helper, one imported by 500 files and one by none, and confirm the first ranks above the second for a query matching both, with the signal values visible in debug output.",
    dep: ["reference-index", "ranking-signals", "history-links"]
  },
  "snippet-extraction": {
    s: "Chooses the lines of a file to show for each result: the matching lines with surrounding context, merging nearby matches and trimming very long lines.",
    d: "After verification, matched offsets are grouped into regions. Each region is expanded by a few lines of context, adjacent regions are merged, and the best few per file are kept within a size limit. Long lines, such as minified code, are cut around the match. The shard returns these snippets with the result so the coordinator never reads files. The difficulty is volume: a file with thousands of matches must not send thousands of snippets, and picking which to show without scoring everything is a quality and cost trade.",
    k: ["Snippet from the shard that matched vs fetching later from a content store: returning it with the hit saves a round trip, but inflates response size across all shards even for results never displayed.", "Fixed context lines vs adaptive to code structure: fixed is predictable, while structural context shows the enclosing function at the cost of parsing."],
    p: ["Snippets taken from unfiltered content may include secrets that the match did not need to reveal.", "Cutting a long line in the middle of a multibyte character produces corrupted text."],
    v: "Search a pattern that matches 5,000 lines in one file and confirm the result shows a bounded number of snippets and a count of the rest. Search a minified file and confirm the snippet is trimmed around the match.",
    dep: ["candidate-verification", "content-store"]
  },
  "match-highlighting": {
    s: "Marks the exact characters that matched in each snippet, including the parts of regular expression matches, so the cause of each result is visible at a glance.",
    d: "The verifier records byte offsets for each match, which the shard maps to line and column positions in the snippet. The client wraps those ranges in markup, after converting from byte offsets to character positions for display. Multiple terms get distinct marks, and structural matches highlight a syntax range. The hard part is correctness across encodings and rendering: byte offsets differ from character offsets in multibyte text and tabs, and case folding can change string length.",
    k: ["Highlight on the server vs on the client: server offsets are authoritative and consistent, while client highlighting repeats the match logic and can disagree with the engine.", "Highlight whole match vs only the literal anchors: whole match is what people expect, but costs more for big patterns."],
    p: ["Offsets computed in bytes and applied as characters shift highlights by the number of non-ASCII characters before the match.", "Overlapping matches produce nested markup that breaks the page layout."],
    v: "Search a term in a file with accented characters and tab indentation, and confirm the highlighted text equals the term exactly, with a check run automatically over a corpus of multibyte samples.",
    dep: ["candidate-verification", "snippet-extraction"]
  },
  "structural-matcher": {
    s: "Matches code by shape instead of text, so a query such as a call with a given argument pattern finds all calls regardless of whitespace, line breaks or argument names.",
    d: "A structural query is written in the target language with placeholders for holes. The matcher parses the query and each candidate file into syntax trees and unifies them, binding placeholders to subtrees. To keep it fast, the planner extracts literal tokens from the query and uses the text index to find candidate files before parsing. Matching understands nesting, so an expression inside parentheses matches. It is hard because it needs a parser for every language, and syntax that is invalid on its own, such as a fragment, must still parse.",
    k: ["Parse every file at query time vs store trees at index time: query-time parsing keeps the index small, but is slow on wide queries; stored trees are fast and large.", "Language-specific patterns vs a common tree format: per-language fidelity is higher, while a common format reduces work but loses language features."],
    p: ["Files with syntax errors fail to parse and drop silently from results.", "A pattern with only placeholders has no literal for the index and scans every file."],
    v: "Run a structural query for calls to a function with a second argument of null and confirm it finds calls split across lines and with nested parentheses, and a text search for the same lines misses some.",
    dep: ["syntax-parsers", "candidate-intersection", "syntax-tree-queries"]
  },
  "syntax-tree-queries": {
    s: "A query form over the syntax tree: select nodes by type, parent and name, such as every method declared inside a class that has a given annotation.",
    d: "Syntax trees are produced by incremental parsers that keep a concrete tree with node types and byte ranges. A query language selects nodes by pattern over types and fields, and captures named nodes for display. It is run on candidates already narrowed by the text index, because a tree query alone would parse the whole corpus. Results highlight the captured ranges. The difficulty is the maintenance of per-language grammars: node names vary, grammar updates change tree shapes, and queries written for one version stop matching.",
    k: ["Query the generic tree vs typed semantic model: trees are available for many languages, but cannot resolve names or types, which a semantic model can at the cost of build integration.", "Ship a query library vs let users write queries: a library is safe and tuned, while open queries support cases nobody anticipated but can be slow."],
    p: ["A grammar upgrade renames a node type and saved queries return nothing.", "Queries with no literal anchor force parsing of the entire corpus."],
    v: "Run a tree query for every function with more than six parameters and compare to a count from a compiler front end on one repository, expecting equal counts.",
    dep: ["syntax-parsers", "structural-matcher"]
  },
  "embedding-generation": {
    s: "Converts code chunks and queries into numeric vectors with a trained model so that similar meaning gives nearby vectors, enabling search by description.",
    d: "Files are split into chunks at function or block boundaries, passed through an encoder model in batches on accelerators, and the resulting vectors are stored with chunk ids. A natural-language query is encoded by the same model at query time. Re-encoding is required whenever a chunk changes or the model is upgraded. It is expensive: for billions of lines, encoding costs far more than text indexing, and model changes force a full recomputation, so chunking and which files to encode are cost decisions.",
    k: ["Encode every chunk vs only popular or recently changed code: complete coverage finds anything, but costs compute and storage that scale with the corpus.", "General model vs one tuned to code: tuned models retrieve better, but need training data and a plan for upgrades."],
    p: ["Mixing vectors from two model versions in one index returns meaningless neighbors.", "Chunks that split a function in the middle lose the meaning the encoder needs."],
    v: "Describe a known function in plain words, and confirm its chunk is within the top 10 nearest vectors. Re-encode with the same model and confirm vectors are identical to within a tolerance.",
    dep: ["document-filtering", "index-build-workers"]
  },
  "vector-index": {
    s: "An approximate nearest-neighbor index over embeddings, returning the closest chunks to a query vector quickly, trading exactness for speed and memory.",
    d: "Vectors are organized in a graph or partitioned structure so a query visits a small fraction of them. Vectors may be compressed by quantization to fit in memory. Each vector links to its chunk, file and repository, and permission filtering must be applied to neighbors. Updates are batched into new segments and merged. The difficulty is recall versus cost: higher recall means visiting more of the graph, and filtering after retrieval can leave too few results while filtering during retrieval slows the search.",
    k: ["Compressed vectors in memory vs full-precision on disk: compression allows far more vectors per machine at some loss of accuracy, which a re-rank step can recover.", "Filter before vs after the neighbor search: pre-filtering keeps result counts right but slows the search; post-filtering is fast but can return nothing."],
    p: ["Strict permission filtering after retrieval leaves a user with an empty list when most neighbors are in private repositories.", "Recall quietly falls as the corpus grows if search parameters are never retuned."],
    v: "Compare approximate results to an exact search on a sample of 1,000 queries and confirm recall at 10 is at or above the target, such as 0.95, and report latency at that recall.",
    dep: ["embedding-generation", "permission-filtering"]
  },
  "hybrid-ranking": {
    s: "Combines exact text matches and embedding matches into one ordered list, so a query benefits from both literal precision and semantic recall.",
    d: "A query runs through both the text path and the vector path. Their results have scores on different scales, so the merger normalizes them or combines by rank, then optionally re-ranks the top few with a heavier model that reads the query and the code together. Query classification decides which path to emphasize: an identifier favors text, a question favors vectors. It is hard because the signals disagree and ground truth is scarce, so tuning relies on a judged query set and often a feedback loop.",
    k: ["Combine by rank vs by score: rank fusion is robust to different scales and needs no calibration, while score combination is finer and fragile.", "Re-rank with a large model vs none: re-ranking improves the top results, at a latency and compute cost on every query."],
    p: ["Semantic results for an exact identifier query displace the literal matches the user typed.", "A re-ranker that sees code from repositories the user cannot read leaks content through its output."],
    v: "On a judged set that includes identifier queries and descriptive queries, confirm hybrid ranking beats both text-only and vector-only on the proportion of queries with the right answer in the top 5.",
    dep: ["vector-index", "ranking-signals", "result-merging"]
  },
  "rewrite-search": {
    s: "Finds code matching a pattern and proposes replacement code, used for large-scale refactors that change one construct to another across many repositories.",
    d: "A rewrite query pairs a structural pattern with a template that uses the captured placeholders. The engine finds all matches, produces a patch per file, and may group them into reviewable change requests per repository or owner. Matches are re-run against the latest revision before applying. It is hard because correctness requires more than text: a rewrite must preserve formatting, keep imports consistent, and leave code that still compiles, so the output is typically a proposal for human review and build verification.",
    k: ["Generate patches centrally vs run the rewrite in each repository: central generation scales and can be audited, while local runs can use each repository's build to validate.", "One large change vs many small ones: a single change is atomic, but hard to review and likely to conflict; small ones land independently."],
    p: ["A rewrite applied to a stale index revision conflicts with newer code and produces broken patches.", "Patterns that match intentionally different cases change code that should have stayed as it was."],
    v: "Run a rewrite across ten repositories, build every patched repository, and confirm all builds and tests pass and the diff touches only matched constructs, as shown by a patch review listing.",
    dep: ["structural-matcher", "code-host-connectors"]
  },
  "permission-sync": {
    s: "Continuously copies who can read which repository from the code host into the search system, so results can be filtered to what each person is allowed to see.",
    d: "A sync service pulls repository permissions, either per user (which repositories can this person read) or per repository (which users and groups can), from the code host or identity system. It writes them into a permissions store with timestamps, refreshed by schedule, by webhook on membership changes, and on demand when a user logs in. It is hard because permissions change often, hosts rate-limit the calls, and the lag between a revocation in the host and in the index is a security exposure window.",
    k: ["Sync per user vs per repository: per user is fast to evaluate at query time but expensive to refresh for a large organization; per repository is cheaper to refresh and needs a join with group membership.", "Short refresh interval vs event driven: short intervals are simple but load the host, and event driven is prompt but needs webhooks that can be lost."],
    p: ["A missed revocation event leaves someone able to search code for hours or days after losing access.", "Hitting rate limits stalls the sync for everyone, so permissions go stale organization-wide."],
    v: "Revoke a user's access to a repository in the host and measure the time until a search by that user stops returning its files. The measured delay must be within the stated bound.",
    dep: ["code-host-connectors", "permission-cache"]
  },
  "permission-filtering": {
    s: "Removes from every result any file the asking user could not open in the code host, at query time and at every merge, so no unauthorized path, snippet or count is revealed.",
    d: "At query start the coordinator resolves the user's readable repository set from the permissions store and passes it to the shards as a filter or bitmap. Filtering before matching keeps the work small, and filtering again before returning guards against mistakes. Counts and suggestions must obey it too. The difficulty is leakage through side channels: a total count, a suggestion, a timing difference or an error message can reveal that a hidden file exists.",
    k: ["Filter inside the shard before matching vs after at the coordinator: filtering inside saves work and avoids transferring hidden results, while a second filter at the coordinator is a defense in depth.", "Per-repository permission only vs per-file rules: per-repository is fast and matches most hosts, but cannot express path-level restrictions some organizations need."],
    p: ["Aggregate counts computed before filtering reveal the number of hidden matches.", "A cache or log that stores unfiltered results becomes a second copy of the data with weaker controls."],
    v: "With a test user who cannot read a repository containing a unique string, search for that string and confirm zero results, zero count, no suggestion and no change in response size compared to a string that does not exist.",
    dep: ["permission-cache", "repository-visibility", "group-resolution"]
  },
  "repository-visibility": {
    s: "The record of which repositories are public to the whole organization, private to groups, or restricted, used as a fast first test and as the basis for per-shard filters.",
    d: "Each repository has a visibility class and, if restricted, a list of allowed users and groups. Organization-wide repositories need no per-user check, so most queries touch a small set of restricted ones. The shard stores a repository id per document so a filter is a bitmap over repository ids. It is hard because visibility changes, such as a private repository made public or the reverse, must reach every shard promptly, and archived or deleted repositories must stop appearing at once.",
    k: ["Store visibility in the shard vs look it up at query time: in-shard is fast but requires pushing updates, while lookup is always current and adds a dependency on the permission service.", "Treat public inside the organization as readable by all vs require explicit grants: the first matches the code host, and the second is stricter and bigger to maintain."],
    p: ["A repository turned private keeps appearing until the next index build if visibility is baked into the shard.", "Default visibility for new repositories set too open exposes code before anyone reviews it."],
    v: "Change a repository from public to private and confirm that within the documented bound a user without access no longer sees its files, without a reindex, and the change is visible in the permissions audit trail.",
    dep: ["permission-sync", "shard-file-format"]
  },
  "group-resolution": {
    s: "Expands users into the groups and teams they belong to, including nested groups, so repository grants given to groups can be checked for a person.",
    d: "Membership comes from the identity provider and the code host. Nested groups are flattened to a set of effective groups, computed on login or when memberships change and cached. A repository's allowed groups intersect with the user's effective set to decide access. Service accounts and external collaborators follow separate rules. The hard parts are cycles in nested groups, very large groups of tens of thousands of members, and keeping the code host's view and the identity provider's view from disagreeing.",
    k: ["Flatten groups ahead of time vs expand at query time: ahead of time is fast per query and needs updates when any parent changes, while query-time expansion is current and slower.", "Trust the identity provider vs the code host as the source: one source is simpler, but the other may hold grants the first does not know about."],
    p: ["A cycle in nested groups sends the expansion into a loop.", "A user removed from a group in the identity provider keeps access until the cached expansion expires."],
    v: "Add a user to a nested group, wait for sync, and confirm they can search a repository granted to the parent group. Remove them and confirm access ends within the stated time.",
    dep: ["permission-sync"]
  },
  "permission-cache": {
    s: "Holds each user's computed set of readable repositories in memory for a short time, so a query does not call the permission service or recompute group membership every time.",
    d: "The cache maps user to a compact set, such as a bitmap over repository ids, with a version and a time to live. A change notification from the sync service evicts affected users. On a miss the coordinator computes the set synchronously and stores it. Size matters in an organization with many thousands of users and repositories. It is hard because the cache is a security control: its time to live is the maximum period a revoked permission can still be honored, and invalidation must be reliable.",
    k: ["Short time to live vs event-based invalidation: short lifetimes bound exposure with no extra machinery but raise load, while invalidation is faster and fails open if an event is lost.", "Cache bitmaps vs lists of ids: bitmaps are small and quick to intersect, while lists are readable and cheaper for tiny sets."],
    p: ["A long time to live chosen for performance turns into the real revocation delay.", "A cold cache after a restart sends every user's first query to the permission service at once."],
    v: "Revoke access, then repeatedly query as that user until results stop, and confirm the delay is below the configured time to live. Restart a coordinator and confirm the first queries succeed within the latency budget.",
    dep: ["permission-sync", "group-resolution"]
  },
  "search-audit-log": {
    s: "A record of who searched for what and which files they opened, kept for investigating leaks, answering compliance questions and detecting bulk reading of code.",
    d: "Each query writes an event with user, time, query text, scope, result counts and the repositories touched, and each file open writes another. Events go to an append-only store with restricted access and a retention policy. Analysts alert on patterns such as a user running thousands of queries or searching for credential formats. It is hard because query text can itself contain secrets pasted by users, so the audit store holds sensitive data, and a long retention conflicts with privacy obligations.",
    k: ["Log full query text vs a hash: full text allows investigation, while hashes protect sensitive strings but can only confirm a known value.", "Synchronous write before returning results vs asynchronous: synchronous guarantees every read is recorded and adds latency and a failure mode; asynchronous may lose events at a crash."],
    p: ["Audit logs readable by the same people they are meant to watch provide no oversight.", "Missing events from a crashed coordinator leave a gap that looks like inactivity."],
    v: "Run a search and open a file as a test user and confirm both events appear in the audit store with the correct user, scope and timestamps. Delete the test user's permissions and confirm the events remain.",
    dep: ["query-coordinator", "query-logging"]
  },
  "symbol-extraction": {
    s: "Parses source files to list the names the code defines, with kind, location and enclosing scope, producing the raw data behind symbol search and navigation.",
    d: "A tag parser for each language walks the syntax tree or runs queries over it to emit records of name, kind, line, container and sometimes signature or visibility. It runs in the indexer for each changed file. The results feed the symbol index, the definition boost and navigation. It is hard because languages differ widely, some defining names through macros, reflection or naming conventions, and because a parser used here must be fast and tolerate the broken code that real repositories contain.",
    k: ["Fast syntactic extraction vs full semantic analysis: syntactic extraction works without building the code and covers many languages, but cannot resolve names or imports.", "Extract at index time vs on demand: index time makes symbol queries instant and enlarges the index; on demand saves space but delays each query."],
    p: ["A parser that crashes on malformed files stops the whole shard build.", "Extraction misses symbols in generated or embedded code, so searches find nothing there."],
    v: "Run extraction on a repository and compare the symbol list to the compiler's list of declared names, and confirm coverage above the target for each supported language, with the missing set reviewed.",
    dep: ["syntax-parsers", "language-detection"]
  },
  "definition-index": {
    s: "Maps each symbol name to the places it is defined, with kind and scope, so go-to-definition and symbol search can answer from a lookup instead of scanning files.",
    d: "The index is keyed by name, and each entry lists definition locations with repository, path, line, kind and container. Qualified names and prefix lookups are supported by sorted or trie-based structures. For popular names the list may be long, so entries carry ranking features. It is rebuilt per shard from symbol extraction. The difficulty is ambiguity: one name has many definitions, and picking the right one needs context such as imports and the file being viewed.",
    k: ["Name-only keys vs qualified names: name-only is simple and finds things, but returns many unrelated hits, while qualified names are exact but need resolution of the caller's context.", "One global index vs per-shard: per-shard is simple and consistent with the rest of the system, while a global one answers navigation with a single lookup but needs its own replication."],
    p: ["Returning only the first definition for an ambiguous name sends users to the wrong function.", "Definitions in files excluded from indexing make a symbol appear undefined."],
    v: "Look up a symbol defined in three repositories and confirm all three locations are returned with correct line numbers, and that the entry for a deleted symbol disappears after the next index update.",
    dep: ["symbol-extraction", "symbol-index"]
  },
  "reference-index": {
    s: "Records where each name is used, so find-references can list callers and users without grepping everything, at much greater size than the definition index.",
    d: "References are far more numerous than definitions, often by a factor of ten or more. The index maps a name, or a resolved symbol id when precise data exists, to a list of locations. Compression stores locations as deltas, and for popular names the list is paginated. Syntactic references match by name, so unrelated symbols with the same name are mixed. It is hard because of size and noise: storing every use of common names bloats the index, and a name-only match returns many false references.",
    k: ["Index all references vs compute them on demand by text search: a stored index answers instantly, while on demand search saves space and is imprecise.", "Resolve references to symbols vs match names: resolution gives exact results and needs compiler data, while name matching works everywhere with false positives."],
    p: ["Common names such as get or id have millions of references and make queries slow or useless.", "References in files from a different revision than the definition point to lines that have moved."],
    v: "Find references of a function in a repository and compare the list to the compiler's call graph, confirming all true calls are present and listing false positives from name collisions.",
    dep: ["symbol-extraction", "posting-lists"]
  },
  "cross-repo-links": {
    s: "Connects a use of a name in one repository to its definition in another, through package and dependency metadata, so navigation follows code across repository boundaries.",
    d: "Package manifests and lock files tell which repository provides each dependency at which version. When a reference cannot be resolved locally, the resolver maps the imported module to the providing repository and looks up the symbol there at the matching revision. Monorepos solve this with one namespace, while multi-repository setups need a package registry mapping. It is hard because versions differ between consumers, vendored copies shadow the original, and internal and external dependency names collide.",
    k: ["Link to the exact dependency version vs the latest: exact is correct for the code as built, while latest is simpler and shows current code but may not match the call.", "Resolve through package metadata vs name heuristics: metadata is exact and requires parsers for each ecosystem, while heuristics are easy and wrong in edge cases."],
    p: ["A vendored copy of a library catches the link and hides the upstream definition.", "A dependency on a private package that the viewer cannot read yields a dead link without explanation."],
    v: "Open a call to a function from an internal library and confirm navigation lands in the library repository at the version pinned in the lock file, and that a viewer without access sees a message, not a broken page.",
    dep: ["definition-index", "code-host-connectors", "permission-filtering"]
  },
  "precise-code-intelligence": {
    s: "Navigation data produced by running the real compiler or type checker over each commit, uploaded as an index, giving exact definitions and references including types and overloads.",
    d: "A build step in continuous integration runs a language-specific indexer that outputs a file listing each symbol occurrence with its resolved identity. The service ingests the file, stores it per repository and commit, and answers lookups by position. For a commit with no upload, it uses the nearest ancestor that has one and adjusts positions by the diff. It is hard because it depends on every repository adding the indexing job, uploads lag commits, and files are large.",
    k: ["Uploaded precise indexes vs search-based guesses: precise results are correct but exist only where teams run the indexer; guesses work everywhere with errors.", "Index every commit vs only the default branch tips: every commit gives exact answers anywhere in history, and costs storage and build time."],
    p: ["An upload that fails in continuous integration leaves navigation silently falling back to heuristics.", "Positions from an ancestor commit are off when the diff is large."],
    v: "On a repository with the indexer enabled, go to a definition of an overloaded method and confirm the correct overload is chosen, then check the same click on a commit with no upload and confirm it falls back and says so.",
    dep: ["build-integrated-indexers", "history-links", "heuristic-navigation"]
  },
  "heuristic-navigation": {
    s: "Approximate go-to-definition and find-references using text search and symbol tags, available for every language and repository without build integration.",
    d: "The system takes the clicked name, searches the symbol index for definitions with that name, and ranks candidates by closeness: same file, same package, imported modules, same repository, then others. References are found by searching for the name and filtering by language. Results are labeled as approximate. It is hard because without type information it cannot tell overloads, shadowed names or dynamic dispatch, so correctness falls as codebases grow and names repeat.",
    k: ["Heuristics as default vs only precise data: heuristics cover all repositories and are quick to deploy, while precise-only gives trustworthy answers on a subset.", "Label results as approximate vs hide the difference: labeling sets expectations and invites better indexing, while hiding looks cleaner and hides errors."],
    p: ["A very common name returns dozens of definitions and the user gets no help picking one.", "Users learn the approximate answers are wrong and stop trusting navigation entirely."],
    v: "Measure on a sample of 200 clicked names across repositories how often the top candidate equals the compiler's answer, report that rate per language, and confirm approximate results carry the label.",
    dep: ["definition-index", "reference-index", "language-detection"]
  },
  "call-and-type-hierarchy": {
    s: "Shows who calls a function, what it calls, and which types extend or implement a given type, built from precise data where available.",
    d: "The hierarchy view follows references transitively. Callers come from reference lookups at the function's symbol id, and implementers from relations recorded by the indexer. The UI expands levels on demand and limits depth and breadth. It needs resolved symbols because name matching explodes: a call of a common name would show callers of all functions with that name. The difficulty is size and dynamic behavior, since indirect calls through function pointers, callbacks or reflection are not visible in static data.",
    k: ["Compute on demand per click vs precompute graphs: on demand needs no extra storage, while a stored graph answers deep traversals quickly and must be refreshed.", "Static edges only vs add runtime data: static is complete for what it sees, while runtime traces add dynamic calls but reflect only exercised paths."],
    p: ["A traversal without a depth limit on a widely used utility returns thousands of nodes and hangs the page.", "Missing edges for callbacks make a function look unused and invite its deletion."],
    v: "Open the caller view of a function with a known set of 12 callers and confirm exactly those appear, and that expanding one level further matches the callers computed by the compiler for each.",
    dep: ["precise-code-intelligence", "reference-index"]
  },
  "history-links": {
    s: "Connections from lines of code to their blame, commit, review and issue history, and ability to view or search the code as it was at an earlier commit.",
    d: "Blame data maps each line to the commit that last changed it, computed from version control and cached per file and revision. The viewer links each line to its commit, and from there to the change request and ticket. Historical views fetch content at a given commit from the mirror or content store. It is hard because blame computation is expensive for long histories and large files, rewritten history changes commit ids, and search over every past commit is impractical for most systems.",
    k: ["Compute blame on demand and cache vs precompute at index time: on demand avoids storing data nobody reads, while precompute makes the viewer instant at a large build cost.", "Index only current state vs also past commits: current-only is small and covers most use, while history search is rarely used and costs storage."],
    p: ["A force push or history rewrite invalidates cached blame and commit links.", "Blame for a file that was renamed or moved stops at the rename unless it follows copies."],
    v: "Open a file, click a line's history link, and confirm the commit shown is the one `blame` reports from version control, including after a file rename.",
    dep: ["source-mirrors", "content-store"]
  },
  "language-detection": {
    s: "Assigns each file a programming language label from its name, content, shebang and path context, which drives filtering, parsing choice, symbol rules and ranking.",
    d: "A classifier first applies cheap rules such as file extension and well-known filenames, then looks at the first line, then at content features when the extension is ambiguous, for example for header files or extensionless scripts. It may also use repository-level overrides that users commit. The label is stored with each document. It is hard because extension collisions are common, many files mix languages, and wrong labels propagate: the wrong parser yields wrong symbols.",
    k: ["Rule-based detection vs a trained classifier: rules are predictable and fast, while a classifier handles ambiguous cases at the cost of training and occasional odd results.", "Allow repository overrides vs central rules only: overrides let owners fix errors, but can be used to hide files from filters."],
    p: ["A header file shared by two languages is labeled by the first rule that matches and is parsed incorrectly.", "A new file extension appears in the organization and its files are labeled as plain text for months."],
    v: "Run detection over a labeled corpus of at least 10,000 files and confirm overall accuracy and the per-language rate meet the target, and list the worst-performing extensions for review.",
    dep: []
  },
  "syntax-parsers": {
    s: "Language-specific parsers that produce syntax trees and tags quickly and tolerate errors, used to extract symbols, run structural queries and color code.",
    d: "Each supported language has a grammar compiled into a parser that builds a concrete syntax tree, recovering from errors so that a file with a typo still yields most of its structure. Parsers run in the indexer and in the viewer, and may be incremental, reusing earlier parse work after an edit. Parsers are loaded as plugins so adding a language does not change the engine. The difficulty is volume and breadth: dozens of languages and dialects must be supported, and each grammar has bugs and versions.",
    k: ["Error-tolerant parsing vs strict parsing: tolerant parsers give partial structure on broken files, but may produce odd trees, while strict parsers reject files and lose them from the index.", "Sandbox parsers vs run in process: sandboxing contains crashes and hostile inputs at a cost in speed."],
    p: ["A pathological file makes the parser run for minutes, stalling the index build for that shard.", "Grammar upgrades change tree shapes and break structural queries."],
    v: "Parse a corpus including intentionally broken files, and confirm no parse exceeds a time limit, no crash occurs, and the extracted symbols for valid files equal those of a reference implementation.",
    dep: ["language-detection"]
  },
  "build-integrated-indexers": {
    s: "Language tools that hook into a repository's build to compile it with full type information and emit navigation data, run in continuous integration.",
    d: "An indexer wraps the compiler or type checker so that every file is analyzed with its real dependencies and flags, and writes a data file describing definitions, references, and relationships. The file is uploaded to the service tied to repository and commit. Indexers exist per language and per build system. The difficulty is adoption and reliability: builds are complicated, indexing slows continuous integration, and a broken build produces no data.",
    k: ["Run in continuous integration vs a central indexing service: running in the build is simple, as the environment already works, while a central service avoids touching every pipeline and must reproduce every build.", "Index all commits vs default branch: all commits maximize coverage, at much higher cost."],
    p: ["An indexer version out of sync with the compiler version generates wrong positions.", "Failing uploads go unnoticed because the job is marked optional."],
    v: "Run the indexer in a test pipeline for a repository and confirm an upload appears for the commit, that its symbol counts match the compiler's, and that a deliberately failing upload raises an alert.",
    dep: ["language-detection"]
  },
  "generated-code-detection": {
    s: "Recognizes machine-written files, such as generated sources, bundled output and vendored third-party code, so they are skipped or ranked down.",
    d: "Detectors look at header comments such as 'do not edit', file name patterns, directories like vendor or build output, repository-level ignore files and statistical features such as very long lines and low variety. Matches are flagged on the document; the index can exclude them completely or keep them with a flag so they can be searched when asked. It is hard because the line between generated and hand-edited is fuzzy, and excluding too much hides code that people really want to find, while including it floods results.",
    k: ["Exclude generated files vs flag and demote: excluding saves a lot of space and noise, while demoting keeps them findable at the cost of a larger index.", "Heuristic detection vs explicit owner configuration: heuristics need no work from teams, while owner declarations are accurate and rarely written."],
    p: ["Vendored copies of a library fill the top results for a library function.", "A heuristic that treats long files as generated drops a large handwritten source file."],
    v: "Search for a symbol defined in a library and also vendored in ten repositories, and confirm the original ranks first and vendored copies are marked or hidden, with the flagged files listable.",
    dep: ["document-filtering"]
  },
  "binary-and-minified-filtering": {
    s: "Detects files that are not useful to search as text, such as binaries, huge data files and minified bundles, and keeps them out of the index or truncates them.",
    d: "A file is classified binary if it contains null bytes or a high share of non-text bytes in its first block. Size limits drop very large files and cap the portion indexed. Minified code is detected from very long lines with little whitespace. Excluded files are still listed by name in the filename index so they can be found. It is hard because limits are arbitrary: a legitimate large source file is silently skipped, and one oversized file can blow up the posting lists.",
    k: ["Hard size limit vs index a prefix: a limit is predictable and cheap, but a prefix keeps some matches in huge files at the risk of misleading partial coverage.", "Drop minified files vs index with a flag: dropping saves space and removes noise, but makes searching for a string known to be in a bundle impossible."],
    p: ["A text file with an unusual encoding is wrongly classified binary and disappears from search.", "A single multi-hundred-megabyte log committed by mistake inflates the shard and slows every query on it."],
    v: "Commit a large text file just below and just above the size limit, and confirm the first is searchable and the second is not, with its name still findable and the skip reason recorded in the index report.",
    dep: ["document-filtering", "encoding-detection"]
  },
  "encoding-detection": {
    s: "Determines the character encoding of each file, converting to a uniform internal form so searches match regardless of how the file was saved.",
    d: "The detector checks byte-order marks, validates against UTF-8, and falls back to statistical guesses for older single-byte or multibyte encodings. Content is normalized to one encoding before indexing, and line endings are handled consistently. Offsets are reported in the original or the normalized form, which the highlighter must know. It is hard because detection is guessing: short files are ambiguous, and a wrong guess produces garbled text that neither matches searches nor displays correctly.",
    k: ["Convert to UTF-8 at index time vs index raw bytes: conversion makes matching uniform and unlocks case folding, while raw bytes avoid errors from wrong guesses but break non-ASCII search.", "Normalize Unicode forms vs preserve exactly: normalizing finds visually identical strings, but loses exactness needed for security-sensitive searches."],
    p: ["A file in a legacy encoding is read as UTF-8 and its accented identifiers cannot be found.", "Mixed line endings change byte offsets between the stored and displayed text."],
    v: "Index the same text saved in three encodings and confirm a search for a non-ASCII identifier returns all three files with highlights on the correct characters.",
    dep: []
  },
});
