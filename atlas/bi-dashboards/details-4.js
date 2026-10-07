// Details for the BI & dashboard plate, part 4: the semantic layer and query generation.
ATLAS.details("bi-dashboards", {
  "semantic-model-definition": {
    s: "The declared model of the business: entities, their fields, relationships and metrics, written in a governed format that every query is compiled from.",
    d: "The model maps friendly names and business meaning onto physical tables and columns, and states how entities relate. It is stored as versioned definitions, loaded into the compiler, and exposed to authors, the metric API and the natural language layer. It is the contract between data engineers who know the tables and analysts who know the questions. Hard parts: modeling the same table at several grains, keeping it in step with source schema changes, and avoiding a single team that must approve every edit.",
    k: ["Central model owned by one team vs federated domain models: central gives uniformity and a bottleneck, while federated models scale authorship and risk conflicting definitions of shared entities.", "Model over raw tables vs over transformed marts: raw tables are flexible but push complexity into the model, while marts keep the model simple and depend on an upstream pipeline."],
    p: ["A table gets a second business meaning in another domain's model, and the two disagree.", "A source column rename breaks the model and every query compiled from it until someone notices."],
    v: "Change a physical column name in a test source and rebuild the model. Validation fails naming the affected fields before any dashboard runs, and after the mapping is fixed all dependent questions return unchanged numbers.",
    dep: ["entities-and-joins", "dimensions-and-hierarchies", "metric-definitions", "schema-sync"]
  },
  "entities-and-joins": {
    s: "The declaration of business objects such as customers and orders, their keys, and the relationships between them, with the cardinality of each.",
    d: "Each entity has a primary key, a grain and its attributes. Relationships state which key joins to which, whether it is one-to-one, one-to-many or many-to-many, and which join type to use. The compiler uses these to find a join path between any set of fields without authors writing joins. Cardinality is the critical metadata: it determines when a metric will be duplicated by a join. Ambiguous paths, such as two ways to reach the same date table, must be resolved explicitly.",
    k: ["Declared relationships vs inferred from names: declared are accurate and take effort, while inferred are quick and sometimes wrong in ways nobody notices.", "Star schema only vs arbitrary graphs: stars give predictable paths and fan-out safety, while graphs model real complexity and need path rules and ambiguity handling."],
    p: ["Cardinality declared as one-to-many is really many-to-many for a few records, and totals inflate.", "Two relationships from orders to the same date table lead to metrics grouped by the wrong date."],
    v: "Request a metric from one entity grouped by an attribute from a related entity. The generated SQL joins on the declared keys, and the total equals the metric computed without the join for a case where the join cannot duplicate rows.",
    dep: ["semantic-model-definition", "join-path-resolution", "fan-out-protection"]
  },
  "dimensions-and-hierarchies": {
    s: "The attributes by which numbers can be grouped and filtered, such as region or product category, with ordered levels like country, state and city.",
    d: "A dimension has a type, a label, a sort order and optional hierarchy levels. Time dimensions have grains such as day, week and month, with calendar rules. Dimensions can be shared across entities, which is what allows cross-filtering and drill-down to work between datasets. Slowly changing attributes need a decision: attribute value at the time of the event or the current value. Hard parts are ragged and unbalanced hierarchies and many-to-many memberships.",
    k: ["Conformed shared dimensions vs per-entity copies: shared dimensions allow cross-dataset analysis, while copies are simple and block it.", "Value as of event time vs current value: event-time is historically accurate and needs history tables, while current value is simple and rewrites the past when attributes change."],
    p: ["A customer moves region and their entire history is reassigned to the new region.", "Two datasets have a region dimension with different spellings, and cross-filtering finds no matches."],
    v: "Group a metric by a dimension whose attribute changed during the period. The tool uses the declared mode, history rows are attributed per the declaration, and filtering on a shared dimension affects both datasets identically.",
    dep: ["semantic-model-definition", "entities-and-joins"]
  },
  "metric-definitions": {
    s: "The single governed definition of each business measure: aggregation, source field, filters, grain, units and owner, referenced by name everywhere.",
    d: "A metric states how to compute a number: sum of net amount where status is completed, or a ratio of two other metrics. It carries a description, owner, format and allowed dimensions. Because the compiler generates queries from this definition, any chart or alert that uses it gets the same logic. Versioned changes should state effective dates so history stays interpretable. Hard parts are metrics that are only valid at certain grains and derived metrics that depend on others.",
    k: ["Metric as a named formula vs as a saved query: formulas compose and apply to any allowed grouping, while saved queries are specific and cannot be regrouped.", "Immutable versions vs editing in place: versions keep history reproducible and need a migration path, while in-place edits are simple and silently change past reports."],
    p: ["A metric is edited to include refunds, and last quarter's reported figures no longer match.", "A metric used with a dimension it does not support returns a plausible but meaningless number."],
    v: "Change a metric's filter in staging, request it grouped by three allowed dimensions and by one disallowed one. Results reflect the new definition everywhere it is used, and the disallowed grouping is refused with a reason.",
    dep: ["semantic-model-definition", "aggregation-semantics", "calculated-measures"]
  },
  "time-intelligence": {
    s: "Built-in handling of time: calendars, fiscal periods, period-to-date, same period last year, rolling windows and week boundaries.",
    d: "Time logic is generated from a calendar definition rather than rewritten per chart. It offers comparisons such as growth versus previous period, running totals and trailing averages, and works at any grain. Calendars cover fiscal years, retail four-four-five patterns and holidays, and a time zone for each query. The core challenges are incomplete periods, where this month so far should not be compared with a full last month, and boundaries across time zones.",
    k: ["Date dimension table vs computed dates: a table supports fiscal and custom calendars and requires maintenance, while computed dates are automatic and handle only the standard calendar.", "Compare to the same elapsed days vs to the full previous period: same elapsed days is fair and unusual, while full period comparisons mislead early in the month."],
    p: ["Month-to-date this year is compared with last year's full month, and growth looks terrible.", "Weeks start on Sunday in one chart and Monday in another because defaults differ."],
    v: "Request a metric with month-to-date and same-period-last-year on the 10th of a month, in two time zones. The comparison uses the first ten days of both periods, and an event at 23:30 local time lands on the correct day in each zone.",
    dep: ["dimensions-and-hierarchies", "metric-definitions", "scales-and-axes"]
  },
  "calculated-measures": {
    s: "Metrics derived from other metrics through formulas, such as margin as revenue minus cost over revenue, evaluated after aggregation at the requested grain.",
    d: "A derived measure refers to base metrics by name, and the compiler computes the bases at the requested grain and then applies the formula. This differs from a row-level calculation, and gives correct ratios when grouped differently. Conditional and level-of-detail forms, such as share of the total or compared with the average across a dimension, require window operations or multiple passes. The expression language must guard against division by zero and nulls.",
    k: ["Evaluate after aggregation vs per row: after aggregation gives correct ratios at any grouping, while per row is simple and wrong for non-additive results.", "Single pass with window functions vs multi-pass: windows are efficient and not available on every source, while multi-pass works anywhere at more cost."],
    p: ["Division by a zero denominator turns whole rows into errors instead of nulls.", "Share of total ignores the active filter and uses the unfiltered total."],
    v: "Request a share-of-total measure with and without a filter. Shares sum to one hundred percent within the filtered set, a zero denominator returns null, and the same numbers appear when grouped by a different dimension.",
    dep: ["metric-definitions", "aggregation-semantics", "sql-dialect-compiler"]
  },
  "aggregation-semantics": {
    s: "The rules for how each measure may be combined: additive, semi-additive across time, or non-additive, and how distinct counts and averages are rolled up.",
    d: "A sum of sales is additive across every dimension. An account balance can be summed across accounts but not across time, and a distinct count of customers cannot be summed across anything. Declaring these properties lets the compiler and charts decide if totals and regrouping are valid, and when to run a new query instead of adding numbers. Approximate methods for distinct counts offer mergeable sketches that make rollup possible with a small error.",
    k: ["Declared additivity vs inferred from the function: declared handles semi-additive cases correctly, while inference is automatic and only knows sum and count.", "Exact distinct counts vs approximate sketches: exact is correct and expensive, while sketches are cheap and mergeable with a bounded error that must be disclosed."],
    p: ["Monthly balances are summed to a yearly total that no one can interpret.", "Unique visitors per day are added to get unique visitors per month."],
    v: "Define a balance, a distinct count and a sum, and request each at day, month and total level. Balances use the period-end value, the distinct count is recomputed rather than added, and the sum matches the daily sums.",
    dep: ["metric-definitions", "dimensions-and-hierarchies"]
  },
  "metric-api": {
    s: "A programmatic interface that serves governed metrics to any client: dashboards, notebooks, spreadsheets, applications and the natural language layer.",
    d: "Clients send a request naming metrics, dimensions, filters and a time range, and receive rows. The API validates the request against the model, applies permissions, compiles and runs the query, and returns data and metadata such as units and freshness. It makes the semantic layer reusable outside the tool, so numbers in a spreadsheet match the dashboard. Versioning of the request format and metric names matters, as external clients cannot be updated with the tool.",
    k: ["Query by metric names vs by SQL: metric requests keep logic centralized and limit what clients can ask, while SQL access is flexible and reproduces definitions in each client.", "Synchronous responses vs asynchronous jobs: synchronous is simple for small results, while jobs handle long queries and need polling and expiry."],
    p: ["A client caches the response for days and shows numbers that disagree with the dashboard.", "A metric is renamed, and an external script fails without any notice."],
    v: "Request one metric with the same filters through the API, the dashboard and a spreadsheet client. All three return identical numbers with the same unit and a freshness timestamp, and an unauthorized dimension is refused.",
    dep: ["query-planner-ir", "data-permissions", "semantic-model-definition"]
  },
  "glossary-and-certification": {
    s: "Plain-language descriptions, owners and approval status for metrics and fields, so people can tell the official definition of a number from an experiment.",
    d: "Each definition carries a description, an owner, examples, known caveats and a status such as draft, certified or deprecated. Certification means an owner reviewed the logic and takes responsibility for it, and is shown in the picker, on charts and in natural language answers. Review dates remind owners to revalidate. The benefit depends on discipline: a glossary that nobody updates is worse than none, because it looks authoritative.",
    k: ["Certification by designated owners vs by crowd votes: designated owners are accountable and slow, while votes are fast and reward popularity over correctness.", "Mandatory descriptions vs optional: mandatory descriptions build a usable glossary and produce low-effort text, while optional ones are skipped."],
    p: ["A metric stays certified after its source table changed meaning.", "The glossary describes the metric one way and its formula does something else."],
    v: "Open the glossary entry for a certified metric. It shows owner, last review date, the live formula (not typed text), the dashboards using it and a deprecation notice after the status is changed, which appears in the field picker too.",
    dep: ["metric-definitions", "dependency-and-impact-tracking", "usage-analytics"]
  },

  "query-planner-ir": {
    s: "The logical representation of a request after validation: which metrics, dimensions, filters and sorts, with permissions applied, before any SQL is written.",
    d: "Every entry point (explorer, dashboard tile, alert, metric API, natural language) produces the same intermediate structure, so one set of rules for permissions, row policies, joins and limits applies to all. The planner resolves names to model objects, expands derived measures, adds security predicates and decides what can run in one query. Keeping this layer independent from SQL syntax lets the same request run against different sources and be inspected, cached and explained.",
    k: ["One shared intermediate form vs each feature building SQL: a shared form enforces rules once, while per-feature SQL is quicker to write and bypasses controls.", "Rich intermediate model vs thin: rich models allow optimization and are costly to evolve, while thin ones are simple and leave work to the dialect compiler."],
    p: ["A new feature builds SQL directly and skips row-level rules.", "The intermediate form changes between versions, invalidating stored cache keys and saved plans."],
    v: "Send the same request from the explorer, a tile, the API and an alert. The logged intermediate structures are identical after normalization, and each carries the same security predicates and limits.",
    dep: ["semantic-model-definition", "metric-definitions", "data-permissions", "row-level-security"]
  },
  "join-path-resolution": {
    s: "Choosing how to connect the entities needed by a request, selecting the join sequence, the join types and the base table that preserves the right rows.",
    d: "Given fields from several entities, the resolver finds a connected set of relationships in the model graph. With multiple paths it follows declared preferences or refuses to guess. It chooses join types: left joins from the entity being measured keep rows that lack related data, while inner joins drop them. It also prunes unneeded joins, so a request for only order fields does not join to customers. Poor choices produce wrong numbers or slow queries.",
    k: ["Explicit preferred paths vs shortest path: explicit paths are predictable and need modeling effort, while shortest path is automatic and chooses surprising joins when the model changes.", "Left joins from the fact vs inner joins: left joins keep unmatched facts and show nulls, while inner joins are faster and quietly remove them."],
    p: ["An inner join silently drops orders with no customer, so totals fall below the finance report.", "A newly added relationship creates a shorter path and changes the results of existing charts."],
    v: "Request fields from three entities, with a fact row lacking a related record. The plan shows the chosen path and join types, the unmatched row appears under a null group, and adding an unrelated relationship leaves the plan unchanged.",
    dep: ["entities-and-joins", "query-planner-ir", "fan-out-protection"]
  },
  "filter-and-parameter-binding": {
    s: "Converting user-chosen filter values and dashboard parameters into safe, typed predicates in the generated query, applied at the right level of the plan.",
    d: "Filter values arrive as text from controls or URLs. The binder checks them against the field's type and allowed values, converts dates and numbers, and places them as bound parameters, never as concatenated text. It decides where the predicate applies: before aggregation (row filter) or after (filter on a metric value). Multi-value filters, ranges, null handling and relative date expressions all need defined behavior. It is also the main defense against injection through shared dashboard links.",
    k: ["Bound parameters vs inlined literals: parameters are safe and let the source reuse plans, while literals allow better estimates on skewed data and need strict escaping.", "Filter before vs after aggregation: before filters source rows and is cheaper, while after filters results and is required for metric thresholds."],
    p: ["A filter on a metric is applied to rows, and the result is silently different.", "An empty multi-select is interpreted as no filter in one place and as nothing selected in another."],
    v: "Open a dashboard URL whose filter parameter contains quotes and a statement terminator. The value is bound as data, the query log shows parameters separately from text, and a metric threshold filter is applied after grouping.",
    dep: ["query-planner-ir", "global-filters", "sql-dialect-compiler"]
  },
  "sql-dialect-compiler": {
    s: "The final step that turns the logical plan into the query text a specific source understands, handling differences in functions, quoting, types, limits and syntax.",
    d: "Each source type has a dialect definition: identifier quoting, date truncation and extraction functions, string and null handling, limit syntax, window support and type mappings. The compiler emits SQL that works on that source and uses its strengths, such as native approximate counting. Differences are subtle: integer division, case sensitivity, time zone conversion and how nulls sort. Test suites run the same logical request against every supported dialect and compare results.",
    k: ["Handwritten dialect backends vs a shared generator with a dialect table: handwritten backends can use every native feature, while a table is easier to extend and limited to common syntax.", "Generate the simplest portable SQL vs source-specific optimized SQL: portable code is predictable, while specific SQL is much faster on large data."],
    p: ["Integer division truncates on one source and returns decimals on another, so a ratio differs per source.", "Null ordering differs, and the top row of a sorted table changes after a source migration."],
    v: "Run a suite of fifty logical requests against each supported source type with identical data. Results match row for row within stated tolerances, and each dialect's differences are listed with tested workarounds.",
    dep: ["query-planner-ir", "driver-adapters", "filter-and-parameter-binding"]
  },
  "fan-out-protection": {
    s: "Preventing duplicate rows from joins on one-to-many relationships from inflating sums and counts, usually by aggregating each entity before joining.",
    d: "When a request mixes a measure from orders with an attribute or measure from order lines, a plain join repeats each order once per line and a sum of order totals multiplies. Protection aggregates each measure at the requested grain in its own subquery and then joins the aggregates, or uses distinct-key aggregation to count each row once. It needs the declared cardinalities. It costs performance, which is why tools detect the safe cases and only apply it where fan-out is possible.",
    k: ["Aggregate each side then join vs deduplicate by key: separate aggregation is exact and may scan each table separately, while key deduplication is a single scan and more complex SQL.", "Always protect vs only when cardinality demands: always protecting is safe and slow, while selective protection is fast and depends on correct model metadata."],
    p: ["An undeclared one-to-many relationship bypasses protection, and revenue is double counted.", "Protection applied to every query doubles scan cost on a very large fact table."],
    v: "Request an order-level sum alongside a line-level attribute where orders have multiple lines. The total equals the sum computed without the join, and the logged SQL shows each measure aggregated before joining.",
    dep: ["entities-and-joins", "join-path-resolution", "aggregation-semantics"]
  },
  "query-pushdown": {
    s: "Doing filtering, grouping and aggregation inside the source database, so only the small final result crosses the network into the tool.",
    d: "The planner sends as much computation as the source supports and brings back aggregated rows. This uses the source's indexes, partitions and parallelism, and keeps tool memory small. It depends on source capability: some functions are not available everywhere, and then the planner must fetch more rows and finish locally. It also must pass partition filters so the source can prune data. Poor pushdown is the usual cause of dashboards that are slow only on large data.",
    k: ["Push everything vs split between source and tool: pushing everything scales with the source and requires full dialect support, while splitting works across weak sources and moves data.", "Trust the source's optimizer vs add hints: trusting keeps queries portable, while hints help on a specific source and become maintenance work."],
    p: ["A date function the source lacks forces the filter to run in the tool after reading the whole table.", "Filters on a computed expression prevent partition pruning, and the query scans every partition."],
    v: "Open a dashboard over a billion-row table with a date filter. The source query plan shows partition pruning, only aggregated rows return, and bytes transferred to the tool are a small fraction of the table size.",
    dep: ["sql-dialect-compiler", "query-planner-ir", "driver-adapters"]
  },
  "multi-source-federation": {
    s: "Answering a request that needs data from more than one source by running separate queries and joining their results inside the tool or a federation engine.",
    d: "When a dashboard needs an operational database and a warehouse together, the planner issues a query to each, then joins the results in memory or in a small embedded engine. Both sides should be aggregated or filtered first, so only small results cross. Different types, time zones and collations must be reconciled. It is a convenience with a limit: very large joins across sources do not scale, and the usual advice is to load both into one place.",
    k: ["Join in the tool vs load into one store: in-tool joins give quick answers with no pipeline, while loading scales and adds engineering.", "Push semi-join filters to the second source vs fetch both fully: semi-join filters reduce transfer when the first side is small, while full fetches are simpler and can be huge."],
    p: ["A join key is text in one source and integer in another, and no rows match.", "Both sources are queried without filters, and the tool runs out of memory building the join."],
    v: "Join a small dimension from one source with a large aggregated fact from another. Each source receives its own filtered query, only aggregated rows are transferred, and a type mismatch on the key is reported before the join runs.",
    dep: ["query-planner-ir", "driver-adapters", "result-post-processing"]
  },
  "result-post-processing": {
    s: "Work done in the tool after rows return: sorting, top-N with other grouping, running totals, totals rows, type conversion and row limiting.",
    d: "Some operations are not pushed to the source: combining results from several queries, grouping the tail of a long list into other, reshaping to wide format for charts and computing totals rows. It also enforces result row limits, converts types, and attaches metadata such as column units and truncation flags. Memory is bounded with streaming where possible. The danger is silent alteration: limits and truncation must be signaled, because a truncated result looks like a complete one.",
    k: ["Stream rows vs materialize in memory: streaming handles large exports and cannot sort or pivot freely, while materializing supports any shaping and is bounded by memory.", "Truncate at the limit vs fail: truncation always returns something and misleads, while failing is honest and annoying."],
    p: ["A result limit cuts the table at ten thousand rows, and a total computed from it is presented as complete.", "Top-N with other is computed after a row limit and groups the wrong rows."],
    v: "Run a query with more rows than the display limit. The response carries a truncated flag and total count, the chart shows a notice, and a top-ten with other bucket sums to the unlimited total.",
    dep: ["query-planner-ir", "driver-adapters", "query-limits-and-cost-guard"]
  },
  "query-limits-and-cost-guard": {
    s: "Limits on rows, time, scanned bytes and concurrency per query, user and workload, which stop runaway queries before they harm the source or other users.",
    d: "Guards combine static checks on the plan (a missing time filter on a partitioned table), source-provided cost estimates, run-time timeouts, and per-user or per-group concurrency caps. Violations produce clear messages with advice, such as narrowing the date range. Separate budgets for interactive and scheduled work keep exports from starving dashboards. Where sources bill per byte scanned, the guard can also stop spending. Limits must be tuned; too tight and they block legitimate work.",
    k: ["Estimate before running vs kill at run time: estimates prevent waste and are often inaccurate, while run-time kills are exact and the cost is already partly spent.", "Hard limits vs soft warnings: hard limits protect the system, while warnings respect power users and are ignored."],
    p: ["A query with a missing partition filter scans years of data, and the bill arrives at month end.", "Limits are per query, so a script that opens a hundred queries bypasses them."],
    v: "Submit a query over a partitioned table without a date filter, a query that runs past the timeout, and a burst beyond the per-user concurrency cap. Each is stopped with a specific message, and source-side usage shows no leftover running work.",
    dep: ["query-planner-ir", "query-cancellation", "async-query-queue", "observability-and-health"]
  },
});
