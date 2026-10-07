// Details for the web analytics plate, part 2: behavior analysis, sessions and identity, aggregation.
ATLAS.details("web-analytics", {
  "funnels": {
    s: "Measures how many visitors complete an ordered series of steps, such as view, add to cart and pay, and where the others drop out.",
    d: "A funnel definition lists steps, each an event with conditions, plus a conversion window and whether steps must be strictly consecutive. The engine groups events by visitor or session, orders them by event time and finds the longest prefix of steps each completes within the window. It is expensive because it needs a per-entity ordered scan, so engines use sorted storage by visitor and time. It is hard because small definition choices, such as window length and strictness, change the answer sharply.",
    k: ["Strict order versus any order between steps: strict order matches a designed journey and is easy to explain, while any order counts real behavior but blurs what a step means.", "Session-bounded versus multi-session windows: session scope is cheap and clear, while a multi-day window captures long decisions but needs visitor-level history and stable identity."],
    p: ["Users who switch devices mid-purchase appear to drop out and then convert as a separate visitor, understating the true conversion.", "Events arriving out of order from batching place a later step first and falsely fail the funnel."],
    v: "Replay a synthetic visitor who performs each step, and a second who skips one, and confirm the funnel counts them at the right step and reports the second as dropping out exactly there.",
    dep: ["columnar-event-store", "partitioning-and-ordering", "visitor-identification", "event-time-semantics"]
  },
  "retention-and-cohorts": {
    s: "Groups visitors by when they first appeared or acted, then tracks what share return in each later period.",
    d: "A cohort is the set of visitors whose first qualifying event fell in a period. For each following period the engine counts how many of them were active, giving a triangular table. Variants measure returning on exactly day N versus on or after day N. It needs reliable first-seen dates and a stable visitor identifier over weeks. It is hard because retention is only as good as identity: cleared cookies and new devices look like churn, and recent cohorts are incomplete.",
    k: ["Unbounded retention versus exact-period retention: on-or-after counts anyone who came back eventually and is more forgiving, while exact-period shows habit but looks lower and noisier.", "Precomputed cohort tables versus on-demand computation: tables make retention charts instant, but fix the definition and need rebuilding when identity merges change membership."],
    p: ["A cookie lifetime shorter than the retention window makes every visitor look new, and retention reads far lower than reality.", "The latest cohort is shown beside complete ones, so it appears to retain badly when its periods have not ended."],
    v: "Create test visitors who return on known days and confirm the cohort table shows exactly those returns in the right cells, including the visitor who returns after a gap and appears only under on-or-after.",
    dep: ["visitor-identification", "identity-stitching", "columnar-event-store"]
  },
  "path-analysis": {
    s: "Shows the sequences of pages or events visitors follow, such as what they viewed before and after a given page.",
    d: "The engine extracts ordered event sequences per session, truncates them to a window, and counts common transitions or full paths, often drawn as a flow diagram. A before-and-after view fixes one node and counts its neighbors. High cardinality of pages makes the raw result unreadable, so URLs are normalized and low-volume paths are grouped. It is hard because paths multiply: the number of distinct sequences explodes, and exact counting needs bounded heaps or approximation.",
    k: ["Page-level nodes versus page-group nodes: raw pages show detail but produce unreadable diagrams, while groups give a clearer picture and hide differences within a group.", "Exact path counting versus top-N approximation: exact counts are trustworthy for small sites, while approximation keeps large sites tractable but can miss a meaningful rare path."],
    p: ["Query strings left in URLs make every visit a unique path and no pattern emerges.", "Reloads and back-button use create loops that dominate flows and misrepresent intent."],
    v: "Generate sessions following two known paths in a known ratio and confirm the flow report shows those two paths with counts in that ratio and no stray unique paths from tracking parameters.",
    dep: ["sessionization", "automatic-pageviews", "columnar-event-store"]
  },
  "attribution-models": {
    s: "Assigns credit for a conversion to the marketing touchpoints before it, using rules such as first touch, last touch or weighted across the path.",
    d: "For each conversion the system collects earlier touchpoints within a lookback window, each with a source, medium and campaign, then splits the conversion value by a model: first, last, linear, position-based or learned from data. Results are reported per channel. It needs touchpoints linked across sessions, so it depends on stable identity. It is hard because no model is true: each answers a different question, and missing touches from blocked trackers or unlinked devices bias the result.",
    k: ["Rule-based models versus data-driven ones: rules are transparent and cheap, while data-driven models adapt to actual behavior but need volume and are difficult to explain.", "Long lookback windows versus short: long windows credit early awareness but need identity to survive weeks, while short windows over-credit the last click."],
    p: ["Direct traffic grabs credit whenever the referrer is lost, so campaigns that start journeys look worthless.", "Comparing attribution totals with an ad platform's own numbers produces disagreement that is taken as a bug."],
    v: "Create a visitor with a known sequence of three sources before a conversion and confirm first-touch, last-touch and linear reports each assign credit exactly as defined, with linear summing to the full value.",
    dep: ["traffic-source-classification", "identity-stitching", "goals-and-conversions"]
  },
  "goals-and-conversions": {
    s: "Defines which events count as success, such as a purchase or sign-up, and records conversion counts, values and rates against them.",
    d: "A goal is a named condition on an event or a sequence, with optional value and a rule for counting once per session or every time. At processing time, matching events are marked as conversions and stored with the session's source and campaign. Reports then compute conversion rate as conversions over a denominator such as sessions or visitors. It is hard because the denominator is a choice, because retroactive goals need reprocessing of history, and because the thing counted may be duplicated by page reloads.",
    k: ["Marking conversions at ingestion versus computing at query time: ingestion-time marking is fast and cheap, while query-time computation lets new goals apply to history but costs more per request.", "Counting once per session versus every occurrence: once is right for sign-ups, while every occurrence suits purchases but multiplies on duplicate submissions."],
    p: ["A thank-you page reload fires the goal again and inflates conversions.", "A goal created today shows zero for last month because history was never reprocessed."],
    v: "Submit a test sign-up, reload the confirmation page twice, and confirm the goal counts once with the session's source attached, and that conversion rate equals conversions divided by the stated denominator.",
    dep: ["custom-events-api", "sessionization", "deduplication"]
  },
  "experiment-analysis": {
    s: "Compares metrics between visitors shown different variants of a page or feature, with tests of whether the difference is larger than chance.",
    d: "Events carry an experiment and variant label assigned by the site's testing system. The platform splits visitors by variant, computes the chosen metric and its variance, and reports lift with an interval or a probability of being best. Checks include sample ratio mismatch, which flags broken assignment. It is hard because statistical care matters: checking results repeatedly as data arrives inflates false positives, and metrics that are ratios need correct variance estimates.",
    k: ["Fixed-horizon tests versus sequential methods: fixed horizons are simple and valid but force waiting, while sequential methods allow early stops at the cost of more complex statistics.", "Analyzing by visitor versus by session: visitor-level analysis respects the unit of assignment, while session-level analysis is simpler but treats repeated visits as independent."],
    p: ["A mismatch between the planned and actual split goes unnoticed and the whole result is biased by a tracking bug.", "Stopping the test the first time the result looks significant produces many false winners."],
    v: "Run an experiment with identical variants and confirm no significant difference is reported across many repeated runs beyond the stated error rate, and that the split ratio check passes.",
    dep: ["visitor-identification", "metric-definitions", "audience-segments"]
  },
  "audience-segments": {
    s: "Named groups of visitors defined by behavior or traits, kept up to date so they can be analyzed, compared or sent to other tools.",
    d: "An audience is a saved segment evaluated against visitor-level data, with membership updated on a schedule or as events arrive. Rules may combine properties, past actions and recency, such as visited pricing twice in thirty days. Membership can be exported to email or ad systems. It is hard because membership is stateful: it needs a visitor profile store, and sending members onward demands consent and honors deletion.",
    k: ["Streaming membership updates versus periodic recomputation: streaming is near current but needs per-visitor state, while periodic recomputation is simpler but lags.", "Storing membership versus computing it on demand: stored membership makes lookups fast and exports easy, but duplicates personal data and must be kept consistent with deletions."],
    p: ["An audience sent to an ad system still includes visitors who withdrew consent since the last sync.", "Overlapping rules produce huge audiences that include nearly everyone and carry no signal."],
    v: "Define an audience of visitors who viewed a page twice, drive one test visitor through that behavior, and confirm membership appears within the update interval and vanishes after a deletion request for that visitor.",
    dep: ["segment-filters", "user-properties", "consent-state-propagation", "deletion-requests"]
  },
  "ecommerce-reporting": {
    s: "Reports on product views, carts, orders and revenue, built from structured commerce events carrying items, prices and currencies.",
    d: "Commerce events follow a defined shape: a list of items, each with identifier, name, category, price and quantity, plus order totals, tax and currency. The platform stores items as nested data and exposes metrics such as revenue, average order value and product conversion. Refunds arrive as later events and must reduce past revenue. It is hard because money is exact: currencies need conversion at defined dates, duplicate order events inflate revenue, and the analytics total will rarely match the finance system.",
    k: ["Client-sent purchase events versus server-confirmed orders: client events are easy but miss blocked pages and are forgeable, while server events are accurate but need backend integration.", "Converting currencies at order time versus at report time: order-time rates keep history stable, while report-time conversion is consistent across periods but shifts old figures."],
    p: ["The same order identifier arrives from the browser and the server and revenue is counted twice.", "A refund event is missing, so revenue only ever rises and diverges from accounting."],
    v: "Send one order with two items and then a partial refund, and confirm item revenue, order revenue and net revenue each match hand calculation, and a repeated order identifier changes nothing.",
    dep: ["custom-events-api", "deduplication", "server-side-api"]
  },
  "sessionization": {
    s: "Groups a visitor's events into sessions, usually split by an inactivity timeout, a day boundary or a change of campaign source.",
    d: "Events are ordered per visitor by event time. A new session starts when the gap since the previous event exceeds a threshold, commonly thirty minutes, or when a rule such as a new campaign parameter applies. Each session receives an identifier, a start, an end, an entry page and a source. It can run in a stream with per-visitor state or in batch. It is hard because late and out-of-order events can split or merge sessions after the fact.",
    k: ["Server-side sessionization versus client-assigned session identifiers: server-side logic is consistent and correctable, while client identifiers are simple but cannot be fixed and depend on storage that may be blocked.", "Streaming with per-visitor state versus recomputing in batch: streaming gives live sessions but must handle late events, while batch is exact but delayed."],
    p: ["A tab left open overnight sends a heartbeat and produces an enormous single session that distorts duration averages.", "A late event merges two sessions that were already counted, so session totals shift after reporting."],
    v: "Send events for one visitor with a forty-minute gap and confirm two sessions result, then send a late event inside the gap and confirm the sessions merge and the totals are corrected.",
    dep: ["visitor-identification", "event-time-semantics", "stream-processing-jobs"]
  },
  "visitor-identification": {
    s: "Assigns each browser or device a stable pseudonymous identifier so repeated hits can be counted as one visitor.",
    d: "The identifier comes from a stored value in a first-party cookie or local storage, or is computed server-side from a daily-rotating hash of coarse request attributes plus a secret. It is attached to every event. Distinct-visitor counts, retention and funnels all rest on it. It is hard because storage is blocked, cleared or capped to a short lifetime by browsers, so the same person appears as several visitors, while shared devices merge several people into one.",
    k: ["Stored identifier versus stateless hash: stored identifiers last across days and count returning visitors, while hashes avoid storage and consent but reset on rotation and cannot track long-term.", "Long-lived identifiers versus short-lived: long lifetimes improve retention measurement, but increase privacy risk and are often truncated by the browser anyway."],
    p: ["A browser capping cookie life to a week makes monthly unique visitors look several times too high.", "Rotating the hash salt at midnight splits a late-night visitor into two."],
    v: "Visit as a fresh browser twice, a day apart, and confirm the same visitor identifier for the stored mode and distinct identifiers for the daily-hash mode, matching the stated design.",
    dep: ["first-party-cookies", "cookieless-visitor-hash", "privacy-by-design"]
  },
  "identity-stitching": {
    s: "Links identifiers from different devices, browsers or logged-out and logged-in states into one person, when the site supplies a user identity.",
    d: "When a visitor logs in, the site sends a user identifier alongside the anonymous one. The platform records the edge between them and merges earlier anonymous history into the person. Merges may need to be applied retroactively to past events or at query time through a mapping table. Rules handle conflicts, such as one device used by two accounts. It is hard because merges are irreversible in effect, expensive to apply to history, and a wrong link leaks one person's activity into another's.",
    k: ["Resolving identity at query time through a mapping versus rewriting events: mapping keeps raw data intact and merges reversible, while rewriting speeds queries but makes mistakes hard to undo.", "Deterministic linking only versus probabilistic matching: deterministic links are explainable and lawful to reason about, while probabilistic ones recover more people but risk wrong merges."],
    p: ["A shared kiosk logs in several users in turn and merges all their histories into one person.", "A deletion request removes the person's identifier but not the anonymous history that was stitched to it."],
    v: "Browse anonymously, log in with a test account, then browse on a second device with the same account, and confirm all three activity periods appear under one person and that unlinking restores separate histories.",
    dep: ["visitor-identification", "user-properties", "deletion-requests"]
  },
  "user-properties": {
    s: "Attributes stored against a visitor or person, such as plan, language or signup date, which can be used to filter and group reports.",
    d: "Properties arrive on events or through separate identify calls, with a name, type and value. The platform keeps a current profile and often a history of changes so a report can use the value as it was at event time. Properties are limited in count and cardinality. It is hard because some are personal data, because current values and historical values answer different questions, and because uncontrolled names fill the schema with near duplicates.",
    k: ["Value at event time versus latest value: event-time values give correct history but need stored snapshots, while latest values are simple and cheap but rewrite the past.", "Free-form properties versus a declared list: free-form is flexible for developers, but a declared list keeps the schema clean and lets privacy rules apply by name."],
    p: ["A free-text property accidentally receives email addresses and enters reports and exports.", "Hundreds of unique values in a property make group-bys unusable and slow."],
    v: "Change a visitor's plan from free to paid, and confirm events before the change group under free and after under paid in the event-time mode, while latest-value mode shows paid for both.",
    dep: ["event-schema", "pii-detection-and-scrubbing", "identity-stitching"]
  },
  "device-and-browser-parsing": {
    s: "Turns the user agent and client hints of a request into device class, operating system, browser and version fields.",
    d: "The parser matches the user agent string against maintained rules and reads structured client hint headers where available, producing normalized fields. Screen size and language may come from the script. Results are cached by string because the same agents repeat heavily. Browsers have reduced the detail in user agents to limit fingerprinting. It is hard because rules age quickly with every release, strings can be spoofed, and unknown agents must be classified rather than dropped.",
    k: ["Parsing at ingestion versus at query time: ingestion parsing is cheap once and fast to query, while query-time parsing lets rule updates apply to history but costs on every scan.", "Reading client hints versus the user agent only: hints are structured and more accurate, but need server opt-in and are absent in some browsers."],
    p: ["Outdated parsing rules classify new browser versions as unknown and a visible share of traffic disappears into one bucket.", "A reduced user agent reports a frozen operating system version, so reports overstate old versions."],
    v: "Send requests with known user agent strings and hints and confirm the stored device, system and browser fields match expected values, and that an unrecognized string lands in a labeled unknown bucket.",
    dep: ["enrichment-workers", "dimension-lookups"]
  },
  "geolocation-enrichment": {
    s: "Maps the request's network address to a country, region and city using a lookup database, before the address is discarded.",
    d: "An enrichment step queries a locally held address-range database with the visitor's address and writes location fields to the event. Because the address is then dropped or truncated, the lookup must happen before anonymization. The database is refreshed on a schedule. It is hard because mapping is approximate: mobile carriers, proxies and privacy relays place people far from reality, city-level data is often wrong, and region data is itself personal-adjacent.",
    k: ["Country only versus city level: country is accurate and low-risk, while city level adds interest but is frequently wrong and raises privacy concerns.", "Local database lookup versus an external service: local lookups are fast and keep addresses inside the system, while external services may be more accurate but export personal data."],
    p: ["Anonymizing the address before enrichment leaves every event without a location.", "An outdated database assigns a new address range to the wrong country for months."],
    v: "Send requests from known address ranges in different countries and confirm the stored country is correct, and confirm the full address appears nowhere in the stored event.",
    dep: ["ip-anonymization", "enrichment-workers", "dimension-lookups"]
  },
  "traffic-source-classification": {
    s: "Assigns each session a channel such as search, social, email, referral or direct, from the referrer and campaign parameters.",
    d: "On the first event of a session, the classifier reads campaign parameters from the landing URL and the referrer. It first checks explicit campaign tags, then matches the referrer's domain against lists of search engines and social sites, falls back to referral, and uses direct when nothing is present. Rules map source and medium to channel groups. It is hard because referrers are often stripped, tags are inconsistent in case and spelling, and internal navigation must not be treated as a new source.",
    k: ["Rule-based channel mapping versus manual tagging only: rules classify untagged traffic automatically, but guess; tags are precise but depend on marketers applying them consistently.", "Fixed lists of known domains versus pattern matching: fixed lists are accurate for known sites but go stale as new platforms appear."],
    p: ["Inconsistent case in campaign tags splits one campaign into several rows.", "Payment provider redirects appear as the referrer and take credit from the real source."],
    v: "Open the site from a tagged email link, from a search result and from typing the address, and confirm the three sessions are classified as email, search and direct, with the tagged campaign name preserved exactly.",
    dep: ["sessionization", "dimension-lookups"]
  },
  "stream-aggregation": {
    s: "Updates running counts and sketches as events arrive, so recent totals are available within seconds without scanning storage.",
    d: "A streaming job keeps keyed state, for example counts per property, page and minute, updates it for each event and periodically flushes finished windows to storage. State is checkpointed so a restart resumes without loss. Windows close when a watermark says late events are unlikely. It is hard because state grows with key cardinality, because exactly-once results require idempotent writes and checkpointing, and because late events after a window closes must be handled.",
    k: ["Tumbling windows closed by a watermark versus continuously updated counts: closing gives final numbers and bounded state, while continuous updates are always current but never final.", "In-memory state with checkpoints versus an external key-value store: memory is fast but must be restored after failure, while an external store survives restarts but adds latency to every event."],
    p: ["A high-cardinality dimension such as full URL grows state until the job runs out of memory.", "A restart without checkpoints resets counters, and the minute of the restart shows a dip."],
    v: "Send a known number of events, stop and restart the job mid-stream, and confirm the flushed window counts equal the number sent exactly, with no loss or double counting.",
    dep: ["stream-processing-jobs", "event-time-semantics", "ingest-queue"]
  },
  "hourly-daily-rollups": {
    s: "Batch jobs that compute counts by hour and day across the commonly needed dimensions and store them in compact tables.",
    d: "Scheduled jobs read a finished time partition of events, group by a set of dimensions and compute additive counts, sums and mergeable sketches. They write to rollup tables keyed by grain, dimensions and period. Daily rollups can be built from hourly ones. Jobs are idempotent so a rerun replaces the same partition. It is hard because the dimension choice is permanent in practice, because time zones define what a day is, and because the late events must trigger recomputation.",
    k: ["Rolling up in the property's time zone versus in UTC: local-day rollups match what users expect to see, while UTC is simple and shared but misaligns days with business reality.", "Building daily from hourly versus from raw: from hourly is much cheaper, but cannot add dimensions that hourly rollups did not keep."],
    p: ["A day defined in UTC shows a traffic drop at local evening that is only a boundary effect.", "A rerun appends instead of replacing, and the day's totals double."],
    v: "Run the rollup job twice for one day and confirm the table has one row per key and totals equal a direct count over that day's raw events in the property's time zone.",
    dep: ["columnar-event-store", "rollup-tables", "approximate-distinct-counts"]
  },
  "approximate-distinct-counts": {
    s: "Counts unique visitors with small fixed-size sketches that can be merged across time and dimensions, trading a few percent of error for large savings.",
    d: "A sketch such as a probabilistic counter summarizes a set of visitor identifiers in a few kilobytes and supports union. Rollups store one sketch per row instead of a number, so unique visitors for a week can be computed by merging seven daily sketches. Plain counts cannot be added because a visitor appears on several days. It is hard because error is relative, so small groups are noisy, and because sketches cannot support deletion or exact reconciliation.",
    k: ["Sketches versus exact distinct counts: sketches are tiny and mergeable, while exact counts are precise but must keep or rescan every identifier.", "Sketch precision settings: higher precision cuts error but multiplies stored size across millions of rollup rows."],
    p: ["Summing daily unique counts to get weekly uniques overcounts returning visitors.", "A deletion request cannot remove one visitor from an existing sketch, so counts stay unchanged until it is rebuilt."],
    v: "Insert a known set of one million visitors across several days and confirm the merged weekly sketch estimate lands within its stated error of the true number, while the sum of daily counts clearly exceeds it.",
    dep: ["hourly-daily-rollups", "visitor-identification"]
  },
  "late-event-handling": {
    s: "Rules for events that arrive after their time window has closed, such as mobile clients sending hours later or retries after outages.",
    d: "The pipeline compares each event's client timestamp with arrival time. Events within an allowed lateness update open windows. Later events either update closed rollups through a correction job, go to a side output for batch reprocessing, or are accepted into raw storage only. The policy is explicit and measured. It is hard because clocks on devices are wrong, because correcting finished numbers confuses people who already read them, and because every extra day of allowed lateness delays final figures.",
    k: ["Long allowed lateness versus short: long lateness gives complete data but delays finality, while short lateness makes numbers settle quickly and drops or reroutes stragglers.", "Correcting closed windows versus freezing them: corrections give true totals, but change published numbers; freezing keeps history stable but permanently undercounts."],
    p: ["Devices with wrong clocks send events dated in the future or years ago, and they pollute partitions.", "Late data is silently dropped, and mobile traffic from poor networks is systematically undercounted."],
    v: "Send an event with a timestamp three hours old, one thirty hours old and one dated tomorrow, and confirm each follows the documented route and the lateness metric records all three.",
    dep: ["event-time-semantics", "stream-aggregation", "backfill-and-reprocessing"]
  },
  "backfill-and-reprocessing": {
    s: "Recomputes derived data for past periods from raw events after a bug fix, a new definition or late data, without disturbing live processing.",
    d: "A reprocessing job selects a range of partitions, reads raw events, reruns the current logic and writes results to a new version of the rollups, then swaps it in atomically. The raw log is the source of truth, which is why it is kept immutable. Jobs run at lower priority than live work. It is hard because live and backfill outputs can collide, cached results go stale, downstream exports have already consumed the old numbers, and old raw data may no longer exist.",
    k: ["Rebuilding into a new version then swapping versus updating in place: swapping is atomic and reversible, while in-place updates use less storage but expose half-corrected figures.", "Replaying through the full pipeline versus a separate batch path: one path guarantees identical logic, while a separate batch path can be faster but may drift from live behavior."],
    p: ["Reprocessing after the retention window has deleted raw events silently produces zeros for old days.", "A backfill triggers duplicate exports to customer warehouses unless downstream consumers are told."],
    v: "Fix a known filter bug, backfill one week, and confirm the corrected totals appear atomically, cached results for those days are invalidated, and days outside the range are unchanged.",
    dep: ["raw-event-log", "hourly-daily-rollups", "retention-policies"]
  },
  "dimension-lookups": {
    s: "Reference tables that translate codes in events into names and groups, such as country codes, channel groups and page categories.",
    d: "Events store compact codes or normalized values. Lookup tables supply display names, hierarchies and groupings, and are joined during enrichment or at query time. Some are static, such as countries, and some are maintained by users, such as page groups. Versions are tracked so a report can show the mapping as it was. It is hard because lookups change over time, because small tables must be available to every worker consistently, and because missing keys must not drop rows.",
    k: ["Joining at ingestion versus at query time: ingestion joins fix the mapping at event time and speed queries, while query-time joins let corrections apply to history.", "Slowly changing mappings kept with versions versus overwritten: versions keep old reports reproducible, but make every join depend on time."],
    p: ["A lookup missing a new code drops its rows from an inner join and revenue vanishes from a report.", "Workers hold different versions of a table during rollout and classify the same page differently."],
    v: "Add a new page category mapping, send an event for it, and confirm it appears under the right group, then send an unmapped code and confirm it appears in an explicit unknown row rather than disappearing.",
    dep: ["metadata-store", "enrichment-workers"]
  },
});
