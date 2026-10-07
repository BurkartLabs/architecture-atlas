// Details for the SIEM plate, part 2: storage, search and retention; ingest cost and capacity.
ATLAS.details("siem", {
  "ingest-buffer": {
    s: "A durable queue between collection and indexing that absorbs bursts, decouples producers from consumers and lets parsing and storage be restarted without losing events.",
    d: "Events land in a partitioned, replicated log or queue before any heavy processing. Consumers such as parsers, indexers and stream rules read from it at their own pace and track offsets, so a slow indexer builds a backlog instead of causing loss. Retention is short, hours to days. The hard parts are sizing and partitioning: too few partitions cap throughput, skewed keys overload one, and a backlog that outlives the buffer's retention is permanent data loss.",
    k: ["Durable queue between stages vs direct writes: a queue absorbs bursts and permits replay, but adds a system to operate and a delay to every event.", "Partition by source vs by hash: source keeps per-source order but concentrates a noisy source on one partition; hash spreads load but loses order."],
    p: ["One source producing most of the volume overloads its partition while others sit idle, so scaling consumers does nothing.", "A backlog that grows past retention discards the oldest events without any error."],
    v: "Stop the indexer for an hour under steady load, restart it, and confirm the backlog drains to zero with all events present in order within each partition and no consumer errors.",
    dep: ["transport-reliability"]
  },
  "indexing": {
    s: "Building the data structures that make search fast: inverted indexes over terms, column indexes over fields and time partitions, trading write cost and storage for query speed.",
    d: "Incoming events are grouped into time-based segments. For each, the indexer builds term dictionaries and postings, field values and sometimes bloom filters or min-max summaries per block, so a query skips most data. Segments are merged in the background. Index cost can exceed the raw data size. The difficulty is balance: indexing every field makes search quick and ingest slow and large, indexing little makes common queries scan everything, and merges compete with queries for disk and CPU.",
    k: ["Full-text index everything vs index selected fields: full indexes make any search fast but multiply storage and slow ingest; selective indexing is cheaper but leaves unindexed searches slow.", "Many small segments vs few large: small segments make new data searchable sooner, large ones search faster and cost more to merge."],
    p: ["A field with millions of unique values, such as a session identifier, bloats the index and slows every write.", "Merge storms after a burst saturate disks and make searches time out."],
    v: "Ingest a day of representative events, measure time from arrival to searchable and index size against raw size, and confirm a query on an indexed field is orders of magnitude faster than a scan.",
    dep: ["ingest-buffer", "compression-and-encoding"]
  },
  "hot-tier": {
    s: "The fastest and most expensive storage, holding the most recent data on local solid-state disks so that day-to-day alerting and investigation run at interactive speed.",
    d: "Recent events, typically days to weeks, stay on local or high-performance disks, fully indexed and replicated for availability. Most detection and nearly all investigation touches this tier. Sizing comes from ingest rate multiplied by retention, replication and index overhead. The difficulty is that it is sized for the average but needed at the peak: an incident, a flood from one source or a rule that scans widely can exhaust it, and moving data off before it fills causes either lost speed or lost data.",
    k: ["Short hot retention vs long: short is cheaper but forces investigators into slower tiers for anything older than days; long makes everything fast and costs much more.", "Replicate in the hot tier vs rely on backups: replication keeps search available through node loss, but doubles or triples the most expensive storage."],
    p: ["A disk watermark reached during a flood makes the tier read-only and ingest stalls at the worst moment.", "Sizing from average volume ignores incident-driven search load."],
    v: "Kill one hot node under load and confirm search and ingest continue with no data lost. Fill a test tier toward its watermark and confirm data moves down or alerts before ingest blocks.",
    dep: ["indexing", "retention-policies"]
  },
  "warm-cold-tiers": {
    s: "Cheaper storage tiers for older data, with fewer replicas, higher compression and slower media, searched less often but still directly queryable.",
    d: "As data ages, a lifecycle policy moves segments to disks or object storage with less replication and heavier compression, sometimes dropping some indexes. Queries still reach them, but slower. This tier carries most of the data for most of the retention period. Challenges include query planning across tiers with very different speeds, avoiding scans of the whole cold set by good time partitioning, and moving data without interrupting searches that are already running against it.",
    k: ["Searchable cold storage vs offline archive: searchable cold keeps old data a query away, at several times the cost of an archive that needs a restore step.", "Drop secondary indexes when cooling vs keep them: dropping saves space, but turns indexed lookups into slow scans."],
    p: ["A search over a year with no narrow time filter touches the slowest tier and times out, with no clue why.", "Moving segments while a long search reads them makes the search fail or return partial results."],
    v: "Query a field value across data in hot, warm and cold tiers and confirm all matches return, with the response reporting which tiers were searched and how long each took.",
    dep: ["hot-tier", "search-execution", "compression-and-encoding"]
  },
  "archive-and-rehydration": {
    s: "Long-term, lowest-cost storage of raw or compressed events in object storage, and the process for bringing a chosen time range back into searchable form when needed.",
    d: "Events are written in an open, compressed file format into object storage, often partitioned by date and source. Nothing is indexed. When an investigation or audit needs old data, an operator selects a range and the system rehydrates it into a searchable tier or queries the files directly with a scan engine. The challenges are cost of retrieval, delay of hours, keeping a catalog so the right files can be found, and making sure the data is still readable years later with the schema of its time.",
    k: ["Open file format in your own storage vs proprietary archive: open files let other tools read them and survive a product change, but you manage layout and schema.", "Query in place vs rehydrate: in-place scan is quick to start but slow per query; rehydration pays once and then searches fast."],
    p: ["Rehydration of a wide range during an incident fills the hot tier and evicts the data analysts were using.", "Archives written without the schema version become unreadable when field meanings change."],
    v: "Pick a day from the oldest retained period, rehydrate it, and confirm event counts match the archive manifest and a known event from that day is found with all fields intact.",
    dep: ["retention-policies", "compression-and-encoding"]
  },
  "retention-policies": {
    s: "Rules stating how long each data class is kept in each tier and when it is deleted, set by detection need, legal duty, contract and cost.",
    d: "A policy is defined per source type, index or tenant: days in hot, warm and cold, then archive, then delete. Compliance regimes set minimums, privacy rules set maximums, and cost pushes shorter. The system applies policies by dropping whole time partitions rather than rows. It is hard because requirements conflict, because one dataset may serve security, audit and business uses, and because legal holds override everything and must stop deletion safely and visibly.",
    k: ["Retention per source vs one global value: per source matches value and obligation, but needs ownership and review of dozens of settings.", "Delete whole partitions vs individual events: partition drops are fast and cheap, but cannot honor requests to remove a single person's records without rewriting."],
    p: ["A global short default silently deletes data a regulation required for a year.", "Retention set once and never reviewed keeps verbose debug logs for years at full cost."],
    v: "Create test data older than its policy, run the lifecycle job, and confirm exactly the expired partitions are removed, a held dataset is untouched, and the deletion is recorded in the audit log.",
    dep: ["legal-hold", "platform-audit"]
  },
  "search-execution": {
    s: "The engine that runs a query across partitions and tiers: planning, parallel scanning, filtering, aggregation and merge of partial results, with limits so one search cannot starve the rest.",
    d: "A parsed query is turned into a plan: select the time range and indexes, push filters to the storage layer, scan matching segments in parallel on many nodes, aggregate locally and merge. A scheduler enforces per-user quotas and timeouts, and caches repeated results. Detection rules run through the same engine. The difficulty is fairness and cost: one badly written wildcard search over a year can consume the cluster, and scheduled rules and human searches fight for the same resources.",
    k: ["Distributed scan with pushdown vs central processing: pushdown moves less data and scales out, but needs every node to understand every filter.", "Strict search quotas vs open access: quotas protect shared capacity, but block legitimate large investigations unless exceptions are easy to grant."],
    p: ["Scheduled rules that all fire at the top of the hour overload the cluster and make interactive searches crawl.", "A query with no time bound defaults to everything and scans every tier."],
    v: "Run a wide search that is deliberately expensive alongside ten normal ones and confirm the normal ones finish within their usual time while the expensive one is throttled or stopped with a clear message.",
    dep: ["indexing", "hot-tier", "warm-cold-tiers"]
  },
  "compression-and-encoding": {
    s: "How events are laid out and compressed on disk, using column layouts, dictionaries and general-purpose compression to cut storage and read volume.",
    d: "Security logs are repetitive: the same field names, hosts, users and message templates appear constantly. Storing values by column, dictionary-encoding low-cardinality fields and compressing blocks reduces size by large factors and speeds scans, since less is read. Compression choice trades CPU for space and read speed. The challenge is the mix: raw text compresses well but is slow to filter, structured columns are fast but need a stable schema, and unusual events with huge fields break assumptions.",
    k: ["Columnar storage vs row storage: columns compress better and scan fewer bytes for field queries, but reassembling whole events for display costs more.", "Heavy compression for old data vs light for new: heavy saves space where reads are rare, but slows the rare large rehydration."],
    p: ["Very long single-line messages, such as full request bodies, defeat block compression and inflate storage.", "Choosing compression by benchmark on clean data underestimates real, messier volume."],
    v: "Store a day of real events in each candidate layout and compare on-disk size, ingest CPU and time for one field-filter query and one full-event fetch, then select with those numbers.",
    dep: []
  },
  "legal-hold": {
    s: "A mechanism that freezes selected data against deletion, aging and tier changes for the duration of litigation or an investigation, and releases it when cleared.",
    d: "A hold is a named record with a scope, such as a user, time range or source, an owner and a reason. While active, lifecycle jobs skip matching data and archive copies are preserved. The hold itself and every release are audited. It is hard because scopes are described in business terms while storage is partitioned by time and source, so a small hold can pin large partitions, and because forgotten holds keep data, and its cost and liability, forever.",
    k: ["Hold at partition level vs at event level: partition holds are simple and robust but retain unrelated data; event-level holds are precise and require copying or tagging.", "Holds that expire automatically vs require release: expiry prevents forgotten holds, but risks deleting data still needed."],
    p: ["A hold applied after the retention job already ran protects nothing, so request latency matters.", "Holds owned by nobody persist for years and keep personal data that policy says to delete."],
    v: "Place a hold on a range already due for deletion, run the lifecycle job, and confirm it is untouched. Release the hold, run again, and confirm deletion occurs and both actions are in the audit log.",
    dep: ["retention-policies", "platform-audit"]
  },
  "ingest-metering": {
    s: "Measuring how much data each source, team and tenant sends, in bytes and events per day, so usage can be budgeted, billed and traced to the sources responsible for cost.",
    d: "A meter counts volume at the point of ingestion before and after filtering, tagged by source type, host group, tenant and data class. Dashboards show trends, top talkers and daily totals against license or budget, with alerts on sudden jumps. It feeds chargeback and capacity plans. Difficulty comes from definitions: size can be raw bytes, indexed bytes or events; vendors count differently; and attribution needs reliable tags on every source, which are often missing.",
    k: ["Meter before filtering vs after: before shows true source behavior, after shows what you pay for; you need both to judge a filter's value.", "Per-source quotas vs shared pool: quotas stop one team from consuming all, but cause dropped data when a legitimate spike hits a limit."],
    p: ["A misconfigured source sending debug level logs triples daily volume and is found only at the month-end bill.", "Untagged sources land in an unowned bucket and nobody takes responsibility for them."],
    v: "Increase one test source's volume tenfold and confirm the meter attributes the increase to it within minutes, raises the spike alert and shows both pre-filter and post-filter byte counts.",
    dep: ["ingest-buffer"]
  },
  "filtering-and-sampling": {
    s: "Dropping or thinning events before storage by rule, such as removing known-noisy messages or keeping one in N of low-value records, to reduce volume without losing useful signal.",
    d: "Filters match on source, event type, field value or message pattern and discard, mask or reduce events at the agent, relay or ingest stage. Sampling keeps a fraction of high-volume, low-value records. Done well, a handful of filters remove a large share of volume. The risk is invisible loss: filtered data cannot be recovered, rules depending on it stop working, and what looks like noise during normal days can be the evidence in an incident.",
    k: ["Filter early near the source vs late at ingest: early saves bandwidth and cost everywhere, but needs distributed configuration and cannot be revisited for past data.", "Sampling vs full retention of a noisy source: sampling cuts cost sharply, but statistics and rare events from that source become unreliable."],
    p: ["A filter written to drop a harmless message pattern also matches a rare, important one.", "Filters added over years are never reviewed, and nobody knows what is being discarded."],
    v: "List every active filter with its owner, daily dropped count and last review date. Replay a sample of dropped events against current rules and confirm none would have produced an alert.",
    dep: ["ingest-metering", "host-agents"]
  },
  "event-reduction": {
    s: "Combining many similar events into one summary record, such as counting repeated connection attempts per minute, to keep the meaning while storing far fewer events.",
    d: "A reducer groups events by chosen keys over a time window and emits a single event with counts, first and last seen times and sample values. It suits flow records, repeated denials and heartbeats. Aggregates are cheaper to store and search, but lose per-event detail. It is hard because the grouping keys decide what survives: group too coarsely and you lose the attacker's distinct ports or users, group too finely and nothing reduces.",
    k: ["Aggregate at ingest vs keep raw and aggregate in queries: ingest aggregation saves storage immediately, but loses detail irreversibly; query-time aggregation keeps everything at higher cost.", "Fixed windows vs sliding windows: fixed are simple and cheap, but split a burst across a boundary."],
    p: ["Aggregating repeated failures by source address hides a distributed attack whose attempts come from many addresses.", "Summary events fed back into rules designed for raw events produce wrong counts."],
    v: "Send 10,000 identical denied connections, and confirm one summary event records the count, first and last time and the distinct values kept, and that a rule on denied traffic still triggers correctly.",
    dep: ["stateful-windows", "filtering-and-sampling"]
  },
  "tiered-routing": {
    s: "Sending each data class to a destination matched to its value: full indexed search for detection data, cheap object storage for compliance-only data, and nothing for noise.",
    d: "Routing rules inspect source, category and fields and choose a pipeline: a hot, indexed store for events used by rules, a low-cost lake for events kept for audit or occasional hunting, or direct archive. Data in cheaper stores can still be queried or promoted on demand. The skill is classification: knowing which events drive detections, which support investigations and which only satisfy retention, and keeping a way to use cheap data in a detection when needed.",
    k: ["Route by data class vs send everything to one store: routing can cut cost by a large factor, but requires knowing which data detections need.", "Keep cheap-tier data searchable vs archive-only: searchable keeps hunting practical at a modest cost, archive-only is cheapest but slow to use."],
    p: ["Moving a source to the cheap tier silently disables the rules that read it.", "Routing rules based on a field that some events lack send those events to the default store at full price."],
    v: "For each routed class, confirm every detection rule's input sources are present in the indexed tier, and check that a sample event sent to the cheap tier is findable by a query within its documented time.",
    dep: ["filtering-and-sampling", "archive-and-rehydration", "warm-cold-tiers"]
  },
  "capacity-planning": {
    s: "Forecasting storage, compute and network needs from ingest growth, retention and search load, and acting before limits cause dropped data or slow searches.",
    d: "Inputs are events per second, average size, indexing overhead, replication factor, retention per tier and expected query concurrency. From these come node counts, disk, memory and link bandwidth, with headroom for bursts of two to five times normal. Growth tracks the estate: new cloud accounts and verbose sources arrive without notice. Difficulty lies in nonlinear behavior: performance degrades sharply near full disks or saturated merges, and incident periods raise both ingest and search at once.",
    k: ["Provision for peak vs for average with autoscaling: peak sizing is safe but idle most of the time; autoscaling saves money but depends on scaling faster than bursts.", "Scale out nodes vs scale up: out adds resilience and parallelism, up is simpler but concentrates failure."],
    p: ["Planning from last quarter's volume misses a new log source that doubles ingest in a week.", "Headroom measured on empty disks vanishes when merges and replicas need temporary space."],
    v: "Replay a recorded peak day at 1.5 times volume against a staging cluster and confirm ingest lag stays within target, search latency stays within its budget and no tier crosses its disk watermark.",
    dep: ["ingest-metering", "hot-tier"]
  },
  "backpressure-and-load-shedding": {
    s: "The policy for what happens when intake exceeds capacity: slow the sources, queue, or drop by priority, chosen deliberately instead of by whatever fails first.",
    d: "When indexers fall behind, buffers fill. The system can signal upstream to slow, spill to disk, or begin dropping, and a priority scheme decides which data goes first: authentication and detection inputs last, verbose debug first. Sources are given quotas so one noisy sender cannot take the whole pipeline. Hard to get right because backpressure propagates into production systems, dropping hides itself, and the overload usually happens during an incident, when data matters most.",
    k: ["Shed low-priority data vs slow all sources: shedding keeps critical data flowing and loses the rest; slowing everything preserves completeness and risks delaying detection and stalling producers.", "Per-source quotas vs global limit: quotas contain noisy sources, but need tuning and can drop legitimate surges."],
    p: ["Unprioritized dropping discards authentication events as readily as debug noise.", "Drops during overload are not counted, so reports claim complete data when they are missing."],
    v: "Overload a test pipeline at twice capacity with mixed priorities, and confirm critical sources lose nothing, low-priority sources are dropped first, and the dropped counts per source are recorded and alerted.",
    dep: ["ingest-buffer", "ingest-metering", "transport-reliability"]
  },
});
