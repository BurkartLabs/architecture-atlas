// Details for the graph database plate, part 1: tools, import, query language.
ATLAS.details("graph-database", {
  "graph-explorer": {
    s: "An interactive view that draws query results as nodes and relationships, and lets a user expand neighbors, filter by label and inspect properties by clicking.",
    d: "The explorer runs a query through the normal API, receives nodes and relationships, and renders them as a diagram. Clicking a node issues a follow-up expansion query for its neighbors and merges the results into the picture without duplicating elements already shown. It keeps a client-side set of known element identifiers to do the merge. The difficulty is volume: expanding one popular node can return thousands of neighbors, so the explorer must cap and paginate expansions or the view becomes an unreadable hairball.",
    k: ["Client-side merge of incremental expansions vs rerunning a full query: keeps the user's layout stable and cheap, but the client must track identity and can show stale data.", "Cap neighbors per expansion vs show everything: protects readability and the browser, but hides edges unless the user asks for the rest."],
    p: ["Expanding a supernode returns tens of thousands of elements and freezes the browser tab.", "Identifiers recycled by the store after a delete make a stale picture point at an unrelated node."],
    v: "Open a node with two hundred neighbors, expand it, and confirm exactly two hundred new nodes appear, none duplicated, with the expansion capped and a visible control to load more.",
    dep: ["query-workbench", "layout-engine", "result-limits"]
  },
  "layout-engine": {
    s: "Computes screen positions for nodes so connected nodes sit near each other and edges cross as little as possible, usually with a force-directed simulation.",
    d: "A force simulation treats nodes as repelling charges and relationships as springs, then iterates until positions settle. Large graphs use approximations that group distant nodes to avoid comparing every pair. Alternative layouts arrange nodes in layers or concentric circles for hierarchies. The engine must be incremental so adding a few nodes does not rearrange the whole picture, and it must stop on its own, because a simulation that never converges burns the processor and makes nodes drift while the user reads.",
    k: ["Force-directed vs hierarchical layout: force-directed reveals clusters in general graphs, while hierarchical layouts read better for trees and flows but misrepresent cycles.", "Continuous simulation vs compute once and freeze: continuous feels alive and adapts to additions, but moves things the user was looking at."],
    p: ["Recomputing the whole layout after each expansion scatters nodes the user had already memorized.", "Quadratic repulsion calculations make a few thousand nodes unusable."],
    v: "Render a graph of one thousand nodes and confirm the simulation settles within a few seconds, then add ten nodes and confirm existing nodes move less than a small tolerance.",
    dep: []
  },
  "query-workbench": {
    s: "An editor for writing and running queries with syntax highlighting, completion based on the live schema, parameter entry, saved queries and result views as a table or a graph.",
    d: "The workbench sends text and parameters to the server through the wire protocol and renders streamed results. Completion asks the schema catalog for labels, relationship types and property keys so suggestions match the data actually stored. It keeps history and lets users cancel a running statement. The difficulty is that a query can run for minutes or return millions of rows, so the tool must stream, paginate and cancel on the server, not only on the screen.",
    k: ["Schema-aware completion vs static grammar completion: live suggestions catch typos in labels and property names, but require schema reads and can lag when the schema changes.", "Client-side row limit vs server-side limit: a client limit is easy but still pulls everything over the network, while a server limit saves work and can change semantics."],
    p: ["Closing the tab leaves the server still executing an abandoned expensive statement.", "Saved queries with literals instead of parameters leak personal data into shared history and defeat plan caching."],
    v: "Run a query that sleeps for sixty seconds, press cancel after two, and confirm the server's running-query list no longer shows it and the workbench reports the cancellation.",
    dep: ["wire-protocol", "schema-catalog", "result-limits"]
  },
  "schema-visualizer": {
    s: "Draws the shape of the data as labels and the relationship types that connect them, with counts, so people can see what the graph contains without reading its content.",
    d: "Because the model is often schemaless, the visualizer derives a schema from the data by sampling nodes and relationships, or from catalog statistics, and draws labels as boxes with relationship types as arrows between them. It lists property keys with their observed types and how often each appears. Sampling keeps it fast but can miss rare label combinations. The hard part is honesty: an inferred schema describes what was seen, not what is allowed, and must be labeled as such.",
    k: ["Sample-based inference vs full scan: sampling returns in milliseconds on large graphs, but can omit rare relationship patterns that matter.", "Catalog statistics vs live counts: statistics are free to read, though they may be stale after bulk changes."],
    p: ["Treating an inferred diagram as an enforced schema leads people to believe rule violations cannot exist.", "A full-scan inference on a billion-node graph locks up the server during business hours."],
    v: "Load nodes with one label having a rare property on one record in ten thousand, run the visualizer, and confirm the property is shown with a frequency, not omitted or presented as universal.",
    dep: ["schema-catalog", "graph-statistics"]
  },
  "plan-viewer": {
    s: "Displays the chosen execution plan as a tree of operators with estimated and actual row counts, so the reader can see where a query spent its work.",
    d: "The viewer takes the plan from an explain or profile request and draws operators connected by data flow, annotated with estimated rows, actual rows, database hits and time. Large gaps between estimated and actual row counts point at bad statistics or a missed index. It highlights the operators that dominate cost. It depends on the executor reporting counts without distorting performance, since profiling every row of every operator is itself expensive.",
    k: ["Estimate-only explain vs executed profile: explain is safe and instant, but only a profiled run shows true counts, at the cost of actually running the query.", "Per-operator counters on every row vs sampling: exact counts help diagnosis but add overhead that can change the timing being measured."],
    p: ["Profiling a destructive write statement in order to look at its plan performs the writes.", "Reading estimated rows as actual rows leads to blaming the wrong operator."],
    v: "Profile a query whose first operator scans all nodes of a label and confirm the viewer shows the actual row count equal to the number of such nodes, flagged against a much smaller estimate.",
    dep: ["explain-and-hints", "cardinality-estimation"]
  },
  "result-limits": {
    s: "Rules that cap how many rows, nodes and relationships a tool will fetch or draw, with sampling or pagination so a large result stays usable and cheap.",
    d: "Limits exist at several points: a row limit appended to queries, a cap on elements drawn, a maximum payload size on the wire, and server-side result memory limits. Pagination uses a cursor or a stable ordering, because skipping rows by offset on a changing graph can duplicate or lose results. Sampling returns a random subset for a quick look. The tension is that silently truncating hides data, so the tool has to say the result was cut.",
    k: ["Offset pagination vs keyset pagination: offsets are simple but rescan skipped rows and drift under writes, while keyset paging needs a sortable key and is stable.", "Truncate with a warning vs refuse to run: truncation keeps tools responsive, but users may not notice that conclusions rest on partial data."],
    p: ["Appending a limit before an aggregation changes the answer instead of just the display.", "Offset paging over unordered results returns different rows on each page."],
    v: "Run a query matching ten thousand nodes with a limit of one hundred and confirm exactly one hundred return with a visible truncation notice, and that a second page by cursor returns the next hundred without overlap.",
    dep: ["wire-protocol"]
  },
  "bulk-importer": {
    s: "A tool that builds a new store directly from large files while the database is offline, writing records in bulk without transactions, logging or per-row index updates.",
    d: "The importer reads node and relationship files in parallel, assigns internal identifiers, sorts and links relationship chains in batches, writes store files directly, and builds indexes at the end. Skipping the transaction machinery makes it an order of magnitude faster than running inserts. It needs enough memory to map external keys to internal identifiers. Because nothing is transactional, a failure midway leaves an unusable store that must be deleted and rebuilt from the start.",
    k: ["Offline direct write vs online insert: offline import is far faster and produces compact files, but needs downtime and cannot add to an existing populated store.", "Build indexes after loading vs maintain them during: deferring avoids repeated rebalancing, at the cost of a long final phase and a store unusable until it ends."],
    p: ["A run out of memory while mapping external keys aborts hours into a load with nothing usable written.", "Dangling relationships referencing missing nodes are either dropped silently or corrupt the store depending on the flags used."],
    v: "Import a million nodes and five million relationships, start the database, and confirm counts match the source files, a sampled node's neighbor list matches the input, and the consistency checker reports no errors.",
    dep: ["external-id-mapping", "import-validation", "node-store", "relationship-store", "online-index-build"]
  },
  "tabular-loader": {
    s: "Reads rows from delimited text files inside an ordinary transaction and turns each into node and relationship writes using the query language, usually in batched commits.",
    d: "A load statement streams a file, binds each row's fields as parameters, and runs a write query that matches or creates nodes and then creates the relationship between them. Batching commits every few thousand rows bounds memory and the transaction log. Unlike the offline importer it runs while the database serves traffic and obeys constraints. It is much slower, and its speed depends heavily on an index existing for each match, or every row scans the whole label.",
    k: ["Merge-by-key writes vs plain creates: merge makes loads idempotent and safe to retry, but needs an index on the key and costs a lookup per row.", "Large batches vs small batches: large batches reduce commit overhead and log flushes, but hold locks longer and risk memory exhaustion."],
    p: ["Matching on an unindexed property makes every row scan all nodes of a label, turning minutes into days.", "Loading relationships in the same pass as nodes with eager evaluation silently creates duplicates on retry."],
    v: "Load a file of one hundred thousand rows twice with merge-by-key, and confirm node and relationship counts are identical after the second run and that the load used an index seek for matching.",
    dep: ["write-clauses", "parameter-binding", "property-index", "transaction-manager"]
  },
  "external-id-mapping": {
    s: "A temporary lookup from the identifiers used in source data to the internal identifiers the store assigned, needed to wire relationships to the right nodes.",
    d: "Source files name relationships by business keys such as account numbers, while the store links records by internal ids. During import, a map from external key to internal id is built as nodes are written and consulted as relationships are written. The map can be held in memory as a compact hash or sorted array, with the key's group distinguishing key spaces. For huge imports it is the largest memory consumer. Duplicate keys within a space are the common data defect it must detect.",
    k: ["In-memory map vs disk-backed map: memory is fast but caps import size, while a disk-backed structure lifts the cap and slows every relationship by random reads.", "Hashing keys to fixed-width values vs storing full keys: hashing saves memory but risks collisions that wire two entities together."],
    p: ["Two different entities colliding on the same hashed key are silently merged into one node.", "Reusing one key space for different entity types lets a customer number match a product number."],
    v: "Import files where two nodes share a key within one key space and confirm the importer reports the duplicate by key and line, not by merging them or failing without detail.",
    dep: ["internal-identifiers"]
  },
  "relational-mapper": {
    s: "Declarative rules that turn rows and foreign keys from relational tables into nodes, relationships and properties, so an existing database can be loaded or federated as a graph.",
    d: "A mapping states that each row of a table becomes a node with a label, columns become properties, and a foreign key or join table becomes a relationship type. Many-to-many join tables become relationships carrying the join table's extra columns as properties. Mappings run as one-off exports or as continuing synchronization. The challenge is deciding which modeling changes are worth making: a direct mirror of tables rarely produces useful traversals, because tables are shaped for storage and the graph should be shaped for the questions.",
    k: ["Mirror the table structure vs remodel for queries: mirroring is mechanical and reversible, but yields a graph that is just joins in a new syntax.", "One-time export vs continuing synchronization: one-time is simple and consistent, but synchronization keeps data fresh and needs change detection and conflict handling."],
    p: ["Turning every column into a property and every lookup table into nodes produces a graph with huge supernodes for code values like country or status.", "Deleting a row in the source leaves an orphaned node, since an export carries no deletions."],
    v: "Map a customers table, an orders table with a foreign key and an order-lines join table, load it, and confirm a query from one customer to the products they bought returns the same set as the equivalent SQL join.",
    dep: ["tabular-loader", "nodes-and-labels", "relationships"]
  },
  "streaming-ingest": {
    s: "Applies a continuing feed of events to the graph as node and relationship upserts, with ordering, deduplication and batching so the graph tracks its upstream sources.",
    d: "A consumer reads partitioned event streams, turns each event into a parameterized write, and commits micro-batches. Events carry stable keys so that replays upsert rather than duplicate. Ordering matters per entity, so events for one key must reach one consumer in order. Relationship events may arrive before the nodes they reference, which requires creating placeholders or buffering. The risk is contention: many consumers updating the same popular node serialize on its lock.",
    k: ["Idempotent upserts vs exactly-once delivery: upserts tolerate redelivery cheaply, but the writes must be designed so applying twice equals applying once.", "Create placeholder nodes for early references vs buffer events: placeholders keep the pipeline moving but later fill in partial data, while buffering preserves integrity and adds latency."],
    p: ["Parallel consumers writing to a high-degree node deadlock or serialize and throughput collapses.", "Out-of-order updates to one entity let an old event overwrite a newer one."],
    v: "Replay the same ten thousand events twice into an empty graph and confirm node and relationship counts and property values are identical after each pass, with no duplicates.",
    dep: ["write-clauses", "transaction-manager", "lock-manager", "constraints"]
  },
  "entity-resolution": {
    s: "Decides when different records describe the same real entity and merges or links them, so one person or company is one node instead of several.",
    d: "Matching compares names, addresses, identifiers and shared neighbors using exact keys, normalized strings or similarity scores. Graph context helps: two records connected to the same unusual third party are more likely the same entity. Results either merge nodes, rewiring all relationships onto the survivor, or add a same-as relationship that keeps the originals. It is hard because wrong merges are worse than missed merges, and undoing a merge needs the original records and their provenance retained.",
    k: ["Merge nodes vs link with a same-as relationship: merging gives a clean graph and fast queries, but is hard to reverse, while links keep provenance and cost an extra hop.", "Rules and thresholds vs learned matching: rules are explainable, while learned scores catch fuzzy cases but need labeled examples and monitoring."],
    p: ["A merge on a common name joins two people and fuses their entire relationship neighborhoods.", "Merging nodes rewires thousands of relationships in one transaction and holds locks for minutes."],
    v: "Insert two records for one entity with different spellings and an obvious shared neighbor, run resolution, and confirm one canonical node holds both sets of relationships and the original records remain retrievable.",
    dep: ["node-similarity", "write-clauses", "property-index"]
  },
  "import-validation": {
    s: "Checks incoming records for malformed fields, missing keys, duplicate ids and dangling references, and writes the rejected ones to a report instead of loading them.",
    d: "Validation runs in the importer or loader before a record becomes a node or relationship. It checks that required fields exist, types parse, keys are unique within their space and that both endpoints of a relationship resolve. Rejected rows go to a log with source line and reason, while the load continues up to a configured tolerance. Strict failure stops at the first problem, which is safer for small data and unusable for messy real data where a few percent of rows are bad.",
    k: ["Fail fast vs tolerate with a bad-row budget: failing fast guarantees clean data, but tolerance lets a load finish and be fixed up, at the risk of silent data loss.", "Validate before writing vs rely on constraints at write time: pre-validation is fast and gives clear reports, while constraints catch everything but only report one error per failure."],
    p: ["Dropping dangling relationships silently produces a graph that is missing connections nobody noticed.", "Type coercion that turns an unparseable number into zero loads wrong data without any error."],
    v: "Load a file with fifty deliberately broken rows and confirm exactly fifty appear in the reject report with line numbers and reasons, the rest load, and counts reconcile as loaded plus rejected equals input.",
    dep: ["constraints", "property-values"]
  },
  "query-parser": {
    s: "Turns query text into a syntax tree, reporting errors with positions, and normalizes the text so equivalent queries can share a cached plan.",
    d: "A lexer and grammar-driven parser handle clauses for matching, filtering, writing and returning, plus an ASCII-art style for drawing patterns with parentheses for nodes and brackets for relationships. The parser produces an abstract syntax tree that later phases resolve and type-check. Normalization strips whitespace and replaces literals with parameters so the plan cache key matches. The language must evolve without breaking existing queries, so keywords tend to stay reserved forever, and error messages need to point at the exact clause that is wrong.",
    k: ["Hand-written parser vs generated from a grammar: hand-written gives better error messages and recovery, while a generated one is easier to keep consistent with a published grammar.", "Reserving keywords vs context-sensitive keywords: reserving is simpler to parse, but forces users to quote identifiers that collide with new keywords."],
    p: ["Auto-parameterizing literals changes the plan chosen because the optimizer no longer sees the value it would have used.", "A new keyword breaks existing queries that used it as a property name."],
    v: "Submit a query with a misspelled clause keyword on line three and confirm the error names that line and column and the offending token, and that two queries differing only in a literal share one cache key.",
    dep: ["plan-cache"]
  },
  "pattern-matching": {
    s: "The core of the language: describing a subgraph with labeled nodes, typed relationships and property conditions, and returning every place in the data that fits it.",
    d: "A pattern such as a person who works at a company located in a city states a connected shape with variables bound to each element. The engine finds all assignments, starting from nodes it can locate cheaply and extending along relationships. Patterns can be optional, which keeps a row even when a part is missing, or negated, which excludes matches. A pattern describes what to find, not how, leaving order to the planner. That freedom is also the danger: a loosely connected pattern silently yields a cross product of all combinations.",
    k: ["Declarative patterns vs imperative traversal code: patterns are concise and optimizable, but give less control over exact traversal order and are harder to tune by hand.", "Homomorphism vs isomorphism matching: allowing one node to bind to several variables yields more rows and is cheaper to compute, while requiring distinct nodes matches intuition."],
    p: ["Two disconnected patterns in one match multiply their row counts and return an enormous cross product.", "An optional match followed by filtering on the optional part quietly turns into a required one."],
    v: "Match a three-hop pattern over a graph with known contents and confirm the returned rows equal a hand-built expected set, and that a second pattern with a disconnected part returns the product of both counts.",
    dep: ["query-parser", "logical-plan", "expand-operator"]
  },
  "variable-length-paths": {
    s: "Pattern syntax for following a relationship type a range of times, such as one to five hops, and returning the endpoints or the paths themselves.",
    d: "A variable-length expansion repeats the expand step between a lower and upper bound, tracking visited elements so a path never reuses a relationship. Results can be every distinct path, which grows combinatorially, or just the reachable endpoints, which can be computed breadth first with a visited set and is far cheaper. Shortest-path forms have dedicated operators. The danger is the path explosion: in a dense graph the number of paths of length six can dwarf the number of nodes by many orders of magnitude.",
    k: ["Enumerate all paths vs compute reachability: path enumeration answers every question and can be astronomically large, while reachability with a visited set is linear but discards the routes.", "Unbounded upper limits vs mandatory bounds: unbounded is convenient for exploration, but a single query on a cyclic graph can consume all memory."],
    p: ["An unbounded range on a graph with cycles and high degree runs until memory or time limits stop it.", "Using paths when only endpoints are needed makes the query exponentially slower than necessary."],
    v: "On a graph with a known cycle, run a one-to-ten hop query and confirm no path repeats a relationship, the count matches an independent enumeration, and a reachability-only variant returns in a fraction of the time.",
    dep: ["pattern-matching", "traversal-frontier", "path-uniqueness"]
  },
  "aggregation-and-projection": {
    s: "Clauses that group matched rows, compute counts, sums and collected lists, order and limit results, and shape what is returned to the caller.",
    d: "After matching, projection selects which variables, properties and expressions to return and aggregation groups by the non-aggregated expressions. Functions collect values into lists, count distinct nodes, or compute statistics. Ordering with a limit can use a bounded heap rather than sorting everything. Because a node can be matched along many paths, counting rows is different from counting distinct nodes, which is a frequent source of wrong numbers. Collecting very large lists is also an easy way to exhaust memory.",
    k: ["Implicit grouping on non-aggregated columns vs explicit grouping clauses: implicit is concise, but silently changes grouping when someone adds a returned column.", "Streaming aggregation vs materializing all rows first: streaming uses little memory when input is ordered, while hash grouping must hold every group at once."],
    p: ["Counting rows after multiple matching paths overcounts compared with counting distinct nodes.", "Collecting every neighbor of a supernode into one list builds a result too large to transmit."],
    v: "Insert a node reachable by three distinct paths and confirm counting rows returns three while counting distinct nodes returns one, and that ordering by a property with a limit of ten returns the right top ten.",
    dep: ["pattern-matching", "memory-and-spill"]
  },
  "write-clauses": {
    s: "Statements that create, update, merge and delete nodes, relationships and properties, either alone or driven by the rows a pattern match returned.",
    d: "Create writes new elements, merge matches a pattern and creates it only if absent, set changes properties and labels, and delete removes elements. Writes can follow a match, so one statement can rewrite thousands of relationships. A node with relationships usually cannot be deleted until they are, or a detach form removes them first. Writes inside a statement are visible to later clauses, so the order of clauses matters. Merge is the hard one: without a unique constraint, concurrent merges of the same key can each decide it is absent and create duplicates.",
    k: ["Merge vs match-then-create: merge is atomic in intent and concise, but its concurrency safety depends on constraints existing, while explicit steps are verbose and still racy.", "Delete with detach vs requiring manual relationship removal: detach is convenient, but one statement can silently remove a vast neighborhood."],
    p: ["Concurrent merges on an unconstrained key create duplicate nodes.", "A delete after a loose match removes far more than intended because the match returned a cross product."],
    v: "Run two concurrent merges of the same key with a uniqueness constraint in place and confirm exactly one node exists afterward, with one transaction waiting then matching, not failing.",
    dep: ["pattern-matching", "transaction-manager", "constraints", "lock-manager"]
  },
  "procedures-and-functions": {
    s: "Server-side callable units that extend the query language with custom logic, algorithms or integrations, invoked from queries and able to stream rows back.",
    d: "Functions return a value usable in expressions, while procedures can read, write, and yield rows, and are called from queries or standalone. They are loaded from plugins and run inside the server process with access to the database through a transaction-bound API. Procedures give analytics and integrations a way to run next to the data. Because they run in-process, they share memory and threads with the engine, and a poorly written one can leak memory, block threads or bypass the security model.",
    k: ["In-process procedures vs external services called over the network: in-process is fastest and sees the transaction, but a defect can crash or stall the whole server.", "Mode declarations such as read-only vs write: declared modes let the planner and access control reason about side effects, but rely on authors declaring them honestly."],
    p: ["A procedure that holds a reference to transaction objects beyond its lifetime reads invalid data.", "An allow-everything plugin setting lets any installed library run with full database privileges."],
    v: "Call a read-only procedure from a user without write privileges and confirm it succeeds, then call a write procedure as the same user and confirm access control denies it before any change.",
    dep: ["access-control", "transaction-manager", "query-parser"]
  },
  "parameter-binding": {
    s: "Passing values to a query separately from its text, so the same plan runs for different inputs and user-supplied data can never be interpreted as query syntax.",
    d: "The client sends the query text with placeholders plus a map of parameter values. The server plans the text once, caches the plan and binds values at execution. This prevents injection, because values are never parsed as language, and improves cache hit rates. Parameters can be lists, which lets one query write or match many rows at once. The tradeoff is that the optimizer plans without seeing the actual values, so a value that is extremely common or rare is estimated as average.",
    k: ["Plan for placeholders vs plan per value: one reusable plan saves planning time, but the plan may suit typical values and be poor for skewed ones.", "List parameters for batch writes vs one statement per row: lists cut round trips dramatically, but one failure aborts the whole batch."],
    p: ["Building query text by concatenating user input allows injection of extra clauses.", "A parameter that is a very common value gets a plan chosen for rare ones and runs for minutes."],
    v: "Submit a name parameter containing quotes and a closing clause, and confirm it matches only a node with that literal name, while the plan cache shows one entry reused across different values.",
    dep: ["query-parser", "plan-cache"]
  },
  "wire-protocol": {
    s: "The network protocol and driver libraries that carry queries, parameters, transaction control and streamed results between applications and the server, with routing in clustered setups.",
    d: "Drivers open pooled connections over a binary protocol on top of TCP with TLS, send queries with parameters, and receive results in batches as the client pulls them, giving back-pressure. They expose explicit transactions, retries for transient failures and a routing table that tells them which servers accept writes and which serve reads. Results include typed values for nodes, relationships and paths. Version negotiation lets old drivers talk to new servers. The hard part is retry semantics: replaying a transaction after an ambiguous network failure may apply it twice.",
    k: ["Pull-based result streaming vs push everything: pull gives back-pressure and lower memory, but needs the server to keep cursor state open while the client reads.", "Client-side routing vs a proxy: client routing avoids an extra hop and a bottleneck, but every driver must implement and keep up with topology changes."],
    p: ["Automatic retry after a lost commit acknowledgment applies a non-idempotent write twice.", "Idle pooled connections silently dropped by a firewall fail on first use after a quiet period."],
    v: "Kill the leader during a stream of write transactions and confirm the driver refreshes its routing table, retries only transactions marked safe, and the final committed count equals the count the application acknowledged.",
    dep: ["transaction-manager", "shard-routing", "leader-election", "access-control"]
  },
});
