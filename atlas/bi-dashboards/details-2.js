// Details for the BI & dashboard plate, part 2: natural language queries, dashboards, visualization.
ATLAS.details("bi-dashboards", {
  "nl-query-interface": {
    s: "The box where a person types a question in plain words and gets back a chart or number, with the generated query and assumptions available for inspection.",
    d: "The interface accepts free text, suggests questions from the semantic model, and returns a result with a chosen chart type. It shows which metric, filters and time range were chosen, and lets the user correct them by clicking instead of retyping. It sends the text and context to the translation component and renders whatever comes back through the normal visualization path. It is hard because users read a confident chart as a correct one, so the interface must expose interpretation, not just output.",
    k: ["Free text only vs guided suggestions: free text is flexible but invites unanswerable questions, while suggestions steer toward answerable ones and limit discovery.", "Showing the interpretation vs hiding it: showing it builds calibrated trust and catches errors, but clutters the answer for casual users."],
    p: ["A question about revenue is answered with gross sales and no sign that the choice was made.", "The interface returns a chart for an ambiguous term without asking which of two metrics was meant."],
    v: "Ask an ambiguous question such as revenue last month. The result shows the chosen metric and time range as editable chips, and clicking one to switch metric re-runs and updates the chart without retyping.",
    dep: ["intent-to-query-translation", "answer-explanation", "chart-type-library"]
  },
  "schema-grounding-context": {
    s: "The curated description of metrics, dimensions, synonyms and sample values given to the translation model so questions are interpreted against governed definitions, not guessed table names.",
    d: "Grounding is built from the semantic model: names, descriptions, synonyms, valid values for categorical fields and example questions. Only the parts relevant to the question are selected, usually by retrieval over embeddings or keyword matching, because the full model may not fit the context. Permissions apply too: a user should not see even the names of fields they cannot access. Quality depends on documentation, so undocumented models give poor answers.",
    k: ["Grounding on the semantic layer vs on raw schema: the semantic layer gives consistent answers with fewer errors, but needs maintained definitions and descriptions.", "Retrieving a relevant subset vs sending everything: a subset scales to large models but can miss the needed field, while everything is complete until it overflows the context."],
    p: ["Two fields share a synonym, and the retriever always picks the wrong one.", "Sample values include sensitive entries, and they are shown to users without access."],
    v: "Ask for a metric by one of its listed synonyms, then remove the synonym and repeat. The first resolves correctly, the second is flagged as unknown or asks for clarification, and a restricted field never appears in the context for a user denied access.",
    dep: ["semantic-model-definition", "glossary-and-certification", "data-permissions"]
  },
  "intent-to-query-translation": {
    s: "The step that converts a parsed question into a structured request against the semantic layer: chosen metrics, dimensions, filters, time range and sort, usually produced by a language model.",
    d: "The model outputs a structured query in the metric API's vocabulary rather than free SQL, which keeps joins, definitions and permissions under the compiler's control. Deterministic parts handle dates such as last quarter, and a validator checks every reference against the model. Ambiguity is resolved by asking or by choosing a default and displaying it. The hard part is rare vocabulary and compound questions, where fluent but wrong structures are likely.",
    k: ["Structured request vs generated SQL: structured requests are checkable and governed, while generated SQL can express anything but bypasses definitions and is hard to validate.", "Ask when ambiguous vs choose a default: asking prevents wrong answers but adds friction, while defaults are fast and require visible assumptions."],
    p: ["Relative dates are resolved in the server's time zone instead of the user's, shifting a boundary.", "A question needing two metrics with different grains is forced into one query and gets double-counted."],
    v: "Run a set of fifty questions with known correct structured requests and compare. Report exact-match and result-match rates, and check that every miss is either a clarifying question or a visibly stated assumption, not a silent wrong result.",
    dep: ["metric-api", "schema-grounding-context", "query-validation-guardrails"]
  },
  "query-validation-guardrails": {
    s: "Checks applied to model-produced queries before execution: known fields only, permissions respected, cost within limits, and no operations other than reading.",
    d: "Guardrails treat the model's output as untrusted input. They verify that every metric and dimension exists, that the user may access each, that filters and joins are valid, and that estimated cost is under limits. They run after generation and before the compiler, and they also protect against text in data values that tries to change the model's instructions. Failed checks produce an explanation or a retry, never an unvalidated query.",
    k: ["Validate structure vs validate results: structural checks stop bad queries early and cheaply, but cannot tell that a valid query answers the wrong question.", "Fail closed vs retry silently: failing closed is safe but shows more errors, while automatic retries hide failures yet can loop on the same mistake."],
    p: ["A value in a data column contains instructions, and the model includes them in later queries.", "Validation checks the field list but not row-level rules, which are only applied later by a path that can be skipped."],
    v: "Submit questions that reference a hidden field, a nonexistent metric, and a request to modify data. Each is refused with a specific reason, no source query is issued, and the refusals appear in the audit log.",
    dep: ["data-permissions", "query-limits-and-cost-guard", "metric-api", "audit-log"]
  },
  "answer-explanation": {
    s: "The plain-language account shown with each answer: which definitions, filters and date range were used, and how the number was computed.",
    d: "Explanations are generated from the structured query, not from the model's memory, so they match what was run. They name the metric with its definition, list filters and the comparison period, show the source freshness and link to the underlying query. Good explanations let a reader verify an answer in seconds and let an analyst reproduce it as a saved question. The challenge is brevity: a full account is accurate but unread.",
    k: ["Explanation from the executed query vs from model text: executed-query explanations are faithful, while model text reads better but can describe a query that was not run.", "Always shown vs on request: always shown builds trust at some clutter, while on request keeps answers clean but is rarely clicked."],
    p: ["The explanation describes the intended filter, but a permission rule added another, so the numbers differ from what was described.", "A long definition is truncated and drops the one qualification that matters."],
    v: "Ask a question affected by a row-level rule and a default filter. The explanation lists both, and an analyst reproducing it from the shown query in the explorer gets exactly the same number.",
    dep: ["metric-definitions", "result-cache", "saved-questions"]
  },
  "conversation-context": {
    s: "The memory of earlier turns in a chat session, so follow-ups such as now by region or only for last year modify the previous query instead of starting over.",
    d: "The session stores the last structured query and its result summary. A follow-up is interpreted as an edit to that structure: add a dimension, replace a filter, change the time range. The system must decide when a message is a new question and drop context accordingly. Context is per user and per permission set and must not carry data from earlier answers into prompts where it is no longer allowed. Long sessions need pruning.",
    k: ["Edit the previous query vs rewrite from history: structured edits are precise and cheap, while rewriting from text history handles odd follow-ups but drifts over turns.", "Persist sessions vs discard them: persistence helps return visits, but stored questions and results become data that needs retention rules and access control."],
    p: ["A stale filter from three turns ago is silently kept when the user switches topics.", "A saved session is shared with a colleague who lacks access to the data it shows."],
    v: "Ask a question, follow with a region breakdown, then a different topic. The second turn modifies the first query and shows it, the third clears earlier filters, and each answer lists the filters actually applied.",
    dep: ["nl-query-interface", "intent-to-query-translation", "metadata-store"]
  },
  "nlq-feedback-and-evaluation": {
    s: "The thumbs, corrections and maintained test set that measure how often natural language answers are right and feed fixes back into synonyms, examples and definitions.",
    d: "Users mark answers right or wrong and can correct the interpretation, and those corrections become candidate synonyms and example questions after review. A curated evaluation set of questions with accepted structured answers is run on every change to the model, prompt or semantic layer, giving a measured accuracy instead of an impression. Without this loop, quality degrades unnoticed as definitions change.",
    k: ["Result-match scoring vs structure-match scoring: result match tolerates equivalent queries but can pass by coincidence, while structure match is strict and fails harmlessly different forms.", "Automatic learning from feedback vs reviewed changes: automatic learning improves fast but can be poisoned by wrong votes, while review is slower and safer."],
    p: ["The evaluation set covers easy questions only, so accuracy scores stay high while real questions fail.", "A definition change breaks ten stored examples and nobody reruns the set."],
    v: "Change a metric's definition and run the evaluation set in the build pipeline. The report lists each affected question with before and after results, and the change is blocked or flagged if accuracy falls below the stated threshold.",
    dep: ["intent-to-query-translation", "schema-grounding-context", "environments-and-promotion"]
  },

  "dashboard-layout-engine": {
    s: "The component that arranges tiles on a grid or canvas, stores their positions and sizes, and handles editing by drag, resize and add.",
    d: "A dashboard is a document: a list of tiles, each with a position, size, a bound query and display options, plus shared filters and parameters. The layout engine maps these to a grid, prevents overlap, and reflows when tiles are moved. Edit mode and view mode share the same rendering code so what is built is what is seen. It must produce stable layouts across screen sizes and keep saved documents readable by later versions.",
    k: ["Fixed grid vs free canvas: a grid keeps pages tidy and responsive, while a free canvas allows pixel-perfect designs but breaks on small screens.", "Layout stored per dashboard vs per breakpoint: one layout is simple, while per-breakpoint layouts look better on phones and double the maintenance."],
    p: ["Dragging one tile pushes others down into unreadable stacks the author doesn't notice.", "A new version changes the grid width, and old dashboards reflow with overlapping tiles."],
    v: "Build a dashboard by dragging, resizing and deleting tiles, save, reload and open on a narrower screen. Positions are identical after reload, no tiles overlap, and the narrow view shows every tile in a readable order.",
    dep: ["visual-spec-format", "responsive-layout", "metadata-store"]
  },
  "global-filters": {
    s: "Dashboard-level controls such as date range, region or segment whose chosen values apply to every tile that is bound to the same field.",
    d: "A filter control is linked to a field in the semantic layer, and each tile declares whether and how it uses the filter. Values travel into every tile's query as parameters, so one change triggers many queries at once. Filter options themselves come from queries and can depend on other filters. Defaults, saved views and URL state let people share a filtered page. The difficulty is tiles over different datasets that only partly share the filtered field.",
    k: ["Apply on change vs apply on button: immediate updates feel responsive but fire many queries per keystroke, while an apply button is cheaper and less fluid.", "Filter by semantic field vs by column name: semantic fields bind across datasets consistently, while column names need exact matches and miss tiles."],
    p: ["A tile silently ignores a filter because its dataset has no matching field, and the page shows mixed filtered and unfiltered numbers.", "A cascading filter's option query is slow and blocks the whole page."],
    v: "Set a region filter on a dashboard with tiles from two datasets, one lacking the field. The matching tiles change, the other shows a visible notice that it is not filtered, and the URL reproduces the same state when opened elsewhere.",
    dep: ["dimensions-and-hierarchies", "filter-and-parameter-binding", "tile-load-scheduler"]
  },
  "cross-filtering": {
    s: "Interaction where clicking a bar, slice or point in one chart filters every other chart on the page to that selection.",
    d: "A click emits a selection of field values, which is turned into a temporary filter applied to other tiles that share the field. Selections accumulate across charts, and clearing one removes the rest of the dependency. Each selection triggers a refresh of many tiles, so queries are batched and stale responses discarded. It works well on a single star of related data, and breaks down when tiles come from unrelated datasets with no shared dimension.",
    k: ["Selection filters other charts vs highlights within them: filtering narrows precisely but loses context, while highlighting keeps context but is harder to read.", "Per-chart opt-in vs global default: opt-in avoids surprising interactions, while global default makes every chart interactive for little authoring effort."],
    p: ["Rapid clicks produce out-of-order responses, and an older result overwrites the newer one.", "A selected value is outside a tile's own filter, and the tile shows empty with no explanation."],
    v: "Click quickly through five bars in one chart on a dashboard. The other charts always settle on the last selection, no stale data appears, and clearing the selection returns every chart to its unfiltered values.",
    dep: ["global-filters", "tile-load-scheduler", "visual-spec-format"]
  },
  "drill-down": {
    s: "Moving within one chart from a coarse level of a hierarchy to a finer one, such as year to quarter to month, by clicking a mark.",
    d: "The chart is bound to a hierarchy defined in the semantic layer. A click replaces the current dimension with the next level and adds a filter for the chosen member, so the new query is the same metric at finer grain. A breadcrumb lets the user go back. The hierarchy definition decides the valid paths, including ragged ones where levels are missing. Rolling up can reuse cached results from the level above.",
    k: ["Hierarchy defined in the model vs picked by the author: model-defined paths are consistent and governed, while author-defined paths are flexible but differ between dashboards.", "Replace the chart vs open a new view: replacing keeps focus and page context, while a new view preserves the original at the cost of navigation."],
    p: ["Hierarchies with ragged levels produce an empty bar for members with no child at the next level.", "A drill into a very high-cardinality level returns hundreds of thousands of marks and freezes the browser."],
    v: "Drill from year to quarter to month on one chart and back using the breadcrumb. At each level the totals reconcile with the level above, and the generated queries show the previous filters carried forward.",
    dep: ["dimensions-and-hierarchies", "filter-and-parameter-binding", "chart-type-library"]
  },
  "drill-through": {
    s: "Jumping from a number to the detail rows or a related dashboard behind it, carrying the current filters along.",
    d: "A click opens another saved question or dashboard with the filters of the clicked mark passed as parameters, or a table of the underlying records. The target is chosen by an action configured by the author, often to a page about the specific entity such as a customer or order. Row-level rules must still apply at the destination. The difficulty is making sure the detail reconciles with the summary, which requires the same filters and definitions.",
    k: ["Passing filter values vs passing entity identifiers: filter values are general but can change meaning between datasets, while identifiers are exact but need a shared key.", "Opening in the same tab vs a new one: same tab keeps flow and back navigation, while a new tab protects the origin's state."],
    p: ["Detail rows count 10,412 while the summary said 10,398 because the detail query dropped a default filter.", "A drill-through to a table with no row cap tries to load millions of rows."],
    v: "Click a summary total and open the detail table. The row count and sum equal the clicked number, the filters are listed at the top, and a user with restricted rows sees fewer details than an administrator, matching their summary.",
    dep: ["saved-questions", "row-level-security", "filter-and-parameter-binding"]
  },
  "tile-load-scheduler": {
    s: "The client and server logic that decides which tiles load first, how many queries run at once, and how stale results are discarded when filters change.",
    d: "Opening a dashboard triggers one or more queries per tile. The scheduler loads visible tiles first, limits concurrency to what the server and source tolerate, and cancels outstanding queries when the user changes a filter. Tiles share identical queries so they run once. Each tile reports loading, error or done, and the page reports ready when all are finished, which is also the signal the headless renderer waits for.",
    k: ["Load all tiles vs only visible tiles: loading all gives a complete page quickly on small dashboards, while visible-only saves queries on long pages and adds a delay on scroll.", "Client-side coordination vs server-side batching: client coordination is simple, while a batched server request cuts round trips and can optimize across tiles."],
    p: ["Slow tiles hold connection slots, so quick tiles wait behind them and the page feels stuck.", "Cancelled requests are not cancelled at the source, which keeps working on abandoned queries."],
    v: "Open a forty-tile dashboard and change a filter during loading. Visible tiles populate first, outdated requests are cancelled in the source's running-query list, and the page reaches ready exactly once for the final filter.",
    dep: ["query-coalescing", "query-cancellation", "async-query-queue", "application-api"]
  },
  "responsive-layout": {
    s: "Rules for adapting a dashboard to different screen sizes: reordering, stacking and simplifying tiles for tablets and phones.",
    d: "Layouts define breakpoints at which the grid collapses to fewer columns, tiles stack in reading order and charts switch to simpler forms such as dropping legends or secondary axes. The same document must serve large wall displays and phones. Charts need minimum readable sizes and may be replaced by a number or a table when space is small. Authors often only check one size, so previews for each breakpoint are important.",
    k: ["Automatic stacking vs authored mobile layout: automatic stacking costs nothing but can produce a poor order, while authored layouts read well and need extra work.", "Simplify charts on small screens vs scale them down: simplifying keeps readability, while scaling keeps identical content with unreadable labels."],
    p: ["Tiles stack in the order of their grid position, putting a footnote before the headline number.", "A wall display shows the page at four times the intended size with blurred charts."],
    v: "Open the same dashboard at desktop, tablet and phone widths. Every tile is reachable, text stays above a minimum size, the most important number appears first, and no horizontal scrolling is needed on the phone.",
    dep: ["dashboard-layout-engine", "chart-type-library", "accessibility-rendering"]
  },
  "annotations-and-comments": {
    s: "Notes attached to a chart, a data point or a time range, so context such as a launch or an outage travels with the number.",
    d: "An annotation stores the target, a time or value range, the text, the author and visibility. Charts draw markers on top of the data, and comments form threads that notify participants. Annotations are keyed to dimension values, not pixel positions, so they survive layout changes. They are subject to the same permissions as the data: a comment on a restricted figure can reveal it. They are among the few places where people add knowledge to the data.",
    k: ["Annotations tied to data coordinates vs to tiles: data coordinates follow the point across filters and charts, while tile-level notes are simple and ignore data changes.", "Visible to all viewers vs to commenters' groups: wide visibility spreads context, while narrow visibility avoids leaking sensitive remarks."],
    p: ["A comment quoting a restricted figure is visible to everyone who can view the dashboard.", "Annotations pile up on a long time series and cover the data."],
    v: "Add an annotation to one date on a time series, then filter to a different range and change the chart type. The marker appears at that date wherever the date is visible, and a viewer without access to the data sees no marker text.",
    dep: ["visual-spec-format", "content-permissions", "metadata-store"]
  },

  "visual-spec-format": {
    s: "The declarative description of a chart: data fields, encodings, marks, scales and options, stored with the question and interpreted by the rendering library.",
    d: "A spec says which fields map to x, y, color, size and facets, what mark to draw and how to format it, without containing drawing commands. Because it is data, it can be saved, versioned, validated, diffed and produced by other tools such as the natural language interface. The renderer interprets it, and the same spec feeds the browser, the headless renderer and exports. Evolution is the hard part: old saved specs must keep rendering after the format grows.",
    k: ["Declarative spec vs imperative drawing code: specs are portable and safe to store, while code can do anything but is hard to validate and migrate.", "Grammar of composable marks vs a fixed list of chart types: a grammar is expressive and compact, while fixed types are easier for authors and limit novelty."],
    p: ["A new option is added without a default, and old charts render differently after an upgrade.", "A spec references a field that was removed, and the chart shows an unexplained blank."],
    v: "Load a corpus of saved specs from previous versions in the current renderer and compare images with stored baselines. Charts render identically unless a documented migration says otherwise, and removed fields give a named error.",
    dep: ["chart-type-library", "scales-and-axes", "version-history-and-restore"]
  },
  "chart-type-library": {
    s: "The catalog of chart forms the tool can draw: bars, lines, areas, scatter, funnels, heatmaps and others, with the rules for when each fits the data.",
    d: "Each chart type is a mapping from a result shape to marks, with required and optional fields, limits on categories and series, and behaviors such as stacking and tooltips. A recommender can suggest a type from the result, for example a line for a time axis. Drawing uses vector graphics for most charts and falls back to bitmap canvases for very many points. The difficulty is behaving well at extremes: one point, ten thousand categories or only nulls.",
    k: ["Many specialized types vs few configurable ones: specialized types are easy for authors but multiply code, while configurable ones are compact and need more author skill.", "Vector marks vs bitmap canvas: vector output scales and is accessible, while canvas handles hundreds of thousands of points and is opaque to screen readers."],
    p: ["A bar chart with three hundred categories draws unreadable slivers instead of warning or grouping.", "Dual-axis charts are misread because the scales are not obviously independent."],
    v: "Render each chart type with an empty result, one row, nulls, and a hundred thousand rows. Each shows a meaningful empty state or a sane aggregation within a time budget, and none throws an error or freezes the page.",
    dep: ["visual-spec-format", "scales-and-axes", "color-and-palettes", "client-side-aggregation"]
  },
  "scales-and-axes": {
    s: "The mapping from data values to positions, sizes and colors: linear, logarithmic, time and categorical scales, with ticks, labels and domain rules.",
    d: "A scale converts a domain of data values to a range on screen. Time scales must respect calendars, time zones and missing periods, while categorical scales need ordering rules. Domains can be fitted to the data or fixed so charts can be compared. Tick selection chooses readable round values and formats them. Mistakes here distort meaning: a bar chart axis that does not start at zero, or a log scale with zero values, give misleading pictures.",
    k: ["Shared domains across small multiples vs independent ones: shared domains allow honest comparison, while independent domains show each series' shape at the cost of misleading magnitudes.", "Gaps shown for missing periods vs connecting points: showing gaps is truthful, while connecting hides outages and makes lines look continuous."],
    p: ["A time axis built in the server's zone shifts day boundaries for viewers elsewhere.", "A log scale receives zeros or negatives and drops those points without notice."],
    v: "Plot a series with a missing month, zeros and a daylight saving change on both linear and log scales. Gaps are visible, zero handling is stated on the chart, and day boundaries match the viewer's selected zone.",
    dep: ["visual-spec-format", "number-and-date-formatting", "time-intelligence"]
  },
  "color-and-palettes": {
    s: "The rules and palettes that assign colors to categories and values: categorical, sequential and diverging schemes, consistent mapping across charts and contrast checks.",
    d: "Categorical palettes give each series a distinct color, ideally the same color for the same value on every chart in a dashboard, which needs a color assignment kept by value instead of by order. Sequential and diverging ramps encode magnitude and sign and must be distinguishable under common forms of color vision deficiency. Themes supply palettes, and the renderer checks contrast against the background. Charts with more categories than colors need grouping into other.",
    k: ["Color by value across charts vs by position in each chart: value-based colors are consistent for readers, while position-based colors are simpler and change when filters reorder series.", "Many distinct hues vs grouping into other: more hues identify every series but are hard to read, while grouping is clear and hides the tail."],
    p: ["A filter removes one category, and every remaining series changes color.", "Red and green encode good and bad and cannot be told apart by many viewers."],
    v: "Filter a dashboard so the series order changes. Each category keeps its color in all charts, and a contrast checker on the rendered output reports acceptable ratios for text and marks in both light and dark themes.",
    dep: ["visual-spec-format", "theming-and-white-label", "accessibility-rendering"]
  },
  "pivot-table-engine": {
    s: "The component that turns a flat result into a table with row and column groupings, subtotals, grand totals and expandable levels.",
    d: "The engine takes measures and dimensions assigned to rows and columns, groups the data, and computes totals. Totals can be computed in the tool by summing displayed values, or requested from the source as a separate query so non-additive measures such as distinct counts and ratios are correct. Large pivots need windowing so only visible cells are drawn, and long headers must be pinned. Interaction includes expand, collapse, sort and conditional formatting.",
    k: ["Totals from a separate query vs summing visible cells: separate queries are correct for ratios and distinct counts, while summing is free and wrong for non-additive measures.", "Server-side pivoting vs client-side: server-side handles large data, while client-side makes interaction instant on small results."],
    p: ["A grand total of averages is computed as the average of the visible averages.", "A pivot with two high-cardinality columns generates millions of cells and exhausts the browser's memory."],
    v: "Pivot a ratio measure and a distinct count by two dimensions. Subtotals and the grand total match a direct query over the same filters, not the sum of cells, and the table stays responsive with a very wide result.",
    dep: ["aggregation-semantics", "client-side-aggregation", "result-post-processing", "scales-and-axes"]
  },
  "geo-and-maps": {
    s: "Rendering of geographic data: point and region maps with boundaries, projections, base tiles and the matching of place names or codes to shapes.",
    d: "Maps need geometry: region boundaries, a projection that fits the area and optional base layers loaded from a tile source. Data is matched to shapes by code or name, with fuzzy matching a common source of errors. Choropleth maps shade by value, point maps plot coordinates and cluster at scale. Boundaries change over time, so a historical comparison may need versions of the shapes. Offline and private deployments cannot load external tiles and must bundle their own.",
    k: ["Matching by standard codes vs by names: codes are exact but need data cleaning, while names are what users have and mismatch on spelling and language.", "Bundled boundaries vs external tile service: bundled is private and works offline, while external services give detail and updates at the price of a dependency and data exposure."],
    p: ["A place name matches two regions and the value is painted on the wrong one.", "A private deployment behind a firewall shows blank maps because base tiles cannot be fetched."],
    v: "Plot a column of place names including misspellings and duplicates across regions. Unmatched and ambiguous names are listed instead of silently dropped, and the map renders in a network-isolated environment using bundled shapes.",
    dep: ["visual-spec-format", "scales-and-axes", "client-side-aggregation"]
  },
  "number-and-date-formatting": {
    s: "The rules that render values as text: decimals, thousands separators, currency, percentages, abbreviations and dates in the viewer's locale and time zone.",
    d: "Formats are specified per field in the semantic layer and applied by every surface, so a currency metric is shown the same in charts, tables, tooltips and exports. Locale decides separators and date order, while the time zone decides which day a timestamp belongs to. Rounding must be done at display time, never before aggregation. Abbreviations such as K and M need unambiguous thresholds, and negative numbers and nulls need defined appearances.",
    k: ["Format defined in the model vs per chart: model-defined formats are consistent everywhere, while per-chart formats allow local choices that drift.", "Viewer locale vs author locale: viewer locale reads naturally to each person, but screenshots and exports then differ between people."],
    p: ["Values are rounded before summing, and the displayed total differs from the sum of displayed parts.", "A date formatted as day-first in one locale and month-first in another is misread in a shared screenshot."],
    v: "View one dashboard and export under two locales and two time zones. Separators and date order follow each locale, an event near midnight falls on the right day, and the full-precision total reconciles with the unrounded sum.",
    dep: ["metric-definitions", "dimensions-and-hierarchies", "configuration-and-feature-flags"]
  },
  "client-side-aggregation": {
    s: "In-browser or in-tool grouping, sorting and filtering of an already fetched result, so small interactions need no new source query.",
    d: "When a result is small enough to hold, the client keeps it and performs interactions such as sorting, legend toggles, top-N filtering and regrouping locally. This makes interaction instant and saves source queries. The limit is correctness: re-aggregating already aggregated rows is only valid for additive measures. The component needs to know each measure's aggregation rule and refuse or re-query when local computation would be wrong.",
    k: ["Re-aggregate locally vs always re-query: local is instant and free, while re-querying is always correct and slower.", "Larger initial fetch vs more queries: fetching detail enables more local work, but costs transfer and may expose rows the user did not request."],
    p: ["Local regrouping averages precomputed averages and displays a wrong number.", "A result silently truncated at the row limit is aggregated locally, so totals are wrong with no warning."],
    v: "Regroup a fetched result locally by a coarser dimension for a sum and for a distinct count. The sum matches a fresh query, while the distinct count triggers a new query instead of local arithmetic.",
    dep: ["aggregation-semantics", "result-post-processing", "visual-spec-format"]
  },
  "accessibility-rendering": {
    s: "Making charts usable without sight or a mouse: text alternatives, keyboard navigation, data table views, sufficient contrast and motion that can be turned off.",
    d: "Charts expose a summary and the underlying data as a table that screen readers can navigate, and marks are focusable with keyboard arrows that announce values. Colors must satisfy contrast ratios and not be the only encoding, so patterns or labels supplement them. Tooltips must be reachable without hovering. Exports to paged documents need tagged structure. Retrofitting is expensive when marks are drawn on an opaque canvas, so the choice has to be made when the renderer is designed.",
    k: ["Data table alternative vs fully navigable marks: a table is simple and complete, while navigable marks keep the chart's structure and cost more to build.", "Patterns and labels in addition to color vs color alone: extra encodings help many readers, and add clutter that designers resist."],
    p: ["A canvas-drawn chart exposes nothing to assistive technology.", "Tooltips appear only on hover, so keyboard users never see values."],
    v: "Navigate a dashboard with the keyboard and a screen reader only. Every chart announces a summary, arrow keys read values in order, filters are operable, and the exported document has a reading order that matches the page.",
    dep: ["chart-type-library", "color-and-palettes", "dashboard-layout-engine"]
  },
});
