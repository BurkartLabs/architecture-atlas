// Details part 5: serving infrastructure and cross-cutting concerns.
ATLAS.details("ad-exchange", {
  "edge-load-balancing": {
    s: "The first hop for incoming requests: spreading them across servers and regions, terminating encryption and shedding load before it reaches the auction servers.",
    d: "Requests arrive from publishers and wrappers worldwide. Edge balancers terminate encryption, route to the nearest healthy region by network address or anycast, and spread load across auction servers by connection or request. They enforce per-source rate limits and drop obviously abusive traffic. Health checks pull failing nodes out quickly. The hard part is spikes: ad traffic can double in minutes at the start of a big event, and a balancer that overloads takes down everything behind it.",
    k: ["Anycast or latency-based routing vs fixed regional assignment: dynamic routing finds the closest region and moves traffic during failures; fixed assignment is predictable and slower to recover.", "Balancing per connection vs per request: per connection is cheap and can leave one server hot; per request spreads evenly and costs more work."],
    p: ["Health checks that test only that the port is open keep sending traffic to servers that answer every auction late.", "A rate limit keyed on address throttles a large legitimate partner whose requests share one gateway."],
    v: "Ramp synthetic load to twice the normal peak over a few minutes while failing one node. Confirm requests are redistributed within seconds, tail latency stays under budget and excess load is shed with a clear status.",
    dep: ["regional-deployment", "connection-management"]
  },
  "regional-deployment": {
    s: "Running complete copies of the auction and bidding stack in several regions, close to publishers and to buyers' servers, to keep network time inside the deadline.",
    d: "Each region holds auction servers, a cache of configuration and a local counter store, and sends events to a central pipeline. Requests are served entirely in the region where they arrive so no auction crosses an ocean. Bidders also locate in the same regions, since every extra hop reduces their time. Regional state, such as budgets and frequency counts, must be shared or approximated across regions, and a regional failure sends traffic to a neighbor with higher latency.",
    k: ["Full stack in every region vs few large regions: full stacks minimize latency and multiply operations and data copies; few regions are simple and cost deadline.", "Active-active regions vs primary and standby: active-active uses capacity and needs conflict-tolerant state; standby is simple and wastes hardware."],
    p: ["A region that lacks a recently released configuration serves old rules and floors while others serve new ones.", "Failover traffic overloads the nearest region because capacity was not reserved."],
    v: "Fail one region in a staging copy of production. Confirm traffic moves to neighbors within the stated time, deadline misses stay under the stated rate and counters across regions reconcile after recovery.",
    dep: ["edge-load-balancing", "config-distribution", "distributed-counter-store"]
  },
  "connection-management": {
    s: "Managing the many long-lived connections between exchanges and bidders: pooling, keep-alive, limits, retries and detecting connections that have silently died.",
    d: "An exchange holds pools of persistent connections to each bidder in each region and sends requests over them in parallel. Idle connections are kept warm with periodic traffic so intermediate devices do not close them. Limits prevent one slow bidder from using up all connections. Failed connections are re-established in the background, never in the request path. Hundreds of thousands of requests per second per bidder make small inefficiencies large, and retries multiply load during trouble.",
    k: ["A large pool per bidder vs a small pool with multiplexing: a large pool is simple and uses many sockets; multiplexing uses fewer and fails together when one connection stalls.", "Retrying failed requests vs failing fast: retries recover brief errors and amplify load during outages; failing fast protects the system and loses some bids."],
    p: ["A half-open connection looks alive and absorbs requests until the deadline passes for each of them.", "Retries after a bidder slowdown double the traffic it is already struggling with."],
    v: "Kill a bidder's connections and slow its responses in a test. Confirm the exchange stops sending to bad connections within seconds, rebuilds them outside the request path and does not retry beyond its budget.",
    dep: ["transport-and-compression", "latency-monitoring"]
  },
  "low-latency-runtime": {
    s: "The execution environment and coding practices that keep an auction server's response time steady: preallocated memory, no blocking calls, and no unexpected pauses.",
    d: "Servers avoid allocating memory in the request path, use event-driven or thread-per-core designs, keep data structures in cache-friendly layouts and avoid locks shared by all workers. Garbage collection or memory compaction pauses, if the runtime has them, are tuned or avoided. Operating system settings pin threads and tune network buffers. The aim is predictable tail latency, as one slow response in a hundred is millions of late auctions a day.",
    k: ["Event loop vs one thread per request: an event loop handles huge concurrency cheaply and one slow handler stalls everything; threads isolate slow work and cost memory and switching.", "Managed memory vs manual memory control: managed is productive and risks pauses; manual is predictable and risks mistakes."],
    p: ["A single blocking call, such as a synchronous log write, stalls all requests on that thread.", "Heap growth over hours eventually triggers a long pause at peak traffic."],
    v: "Run a soak test at peak load for several hours while recording latency percentiles every minute. The ninety-ninth and ninety-ninth-point-nine percentiles must stay flat, without spikes aligned with memory events.",
    dep: ["in-memory-config-cache"]
  },
  "config-distribution": {
    s: "Delivering campaign, floor, seller, blocklist and model data to every server quickly and consistently, so a change takes effect everywhere within seconds.",
    d: "A central system validates changes and publishes versioned snapshots or deltas. Servers subscribe, download, verify and swap in the new version atomically while serving traffic. Large artifacts, such as models and audience tables, are shipped as files and loaded in the background. Version numbers appear in logs so behavior can be traced. The danger is a bad change spreading everywhere fast, which is why changes roll out gradually with automatic rollback.",
    k: ["Push to all servers at once vs staged rollout: all at once is fast and spreads mistakes immediately; staged limits the damage and delays urgent changes such as stopping spend.", "Full snapshots vs deltas: snapshots are simple and large; deltas are small and break if one is missed."],
    p: ["A snapshot that parses but contains an empty campaign list makes servers stop bidding everywhere.", "Servers that fail to update keep old data and no alert reports the version split."],
    v: "Publish a change that pauses a test campaign and watch every server's reported version. All servers must reach the new version within the stated time, the campaign must stop bidding, and a bad snapshot must be rejected and rolled back.",
    dep: ["in-memory-config-cache", "regional-deployment"]
  },
  "in-memory-config-cache": {
    s: "Data held in each server's memory for lookups during the auction: campaigns, seller rules, blocklists, mappings and models, loaded ahead of time and read without network calls.",
    d: "Anything needed in the request path is kept in memory in compact structures, loaded at start and refreshed in the background, so lookups take microseconds. Large tables such as identifier mappings are sharded across nodes or held in a nearby memory store. Memory use is the limit: more campaigns or users means more machines. Consistency between servers is loose by design, which means two servers may briefly disagree about the same rule.",
    k: ["Copy everything to every server vs shard and look up remotely: copying gives microsecond lookups and limits data size; sharding scales data and adds a network hop to the deadline.", "Immutable snapshots swapped atomically vs in-place updates: snapshots are consistent and need double memory during a swap; in-place saves memory and exposes torn reads."],
    p: ["Loading a new snapshot allocates memory twice and causes the server to be killed for exceeding its limit.", "A server restarted at peak serves requests before its cache is warm, and bids without data."],
    v: "Restart a server under load and measure the time until its cache is complete and the share of requests it answers with partial data. Both must be inside stated limits and a health check must hold traffic until it is ready.",
    dep: ["config-distribution"]
  },
  "distributed-counter-store": {
    s: "A shared, replicated store that holds the counts everyone updates, such as campaign spend, frequency counts and seller quotas, trading exactness for speed.",
    d: "Counters are partitioned by key and replicated across nodes and regions. Writes are applied locally and merged in the background using operations that can be combined in any order, so no node waits for the others. Reads return the local value, which may lag. Where exactness matters, such as billing, a different path counts every event once from the log. The design question is the permitted error and what is done when a node or region is unavailable.",
    k: ["Eventually consistent counters vs strongly consistent: eventual is fast and available and allows overspend by the lag; strong is exact and adds latency and fails when regions are cut off.", "Per-node local counters merged periodically vs a central counter: local is fast and drifts; central is simple and a bottleneck and a single point of failure."],
    p: ["A network partition lets both sides spend the full remaining budget independently.", "Counters with no expiry fill memory with keys for users who never return."],
    v: "Increment a test counter from several regions at a known rate, then cut one region off and restore it. The merged total must equal the sum of all increments after recovery and the divergence during the cut must stay inside the stated bound.",
    dep: ["in-memory-config-cache", "regional-deployment"]
  },
  "stream-processing": {
    s: "Continuous computation over the flow of auction and event records: counts, joins, rates and anomaly checks, producing results within seconds instead of the next day.",
    d: "Events flow through a durable queue to processors that group them by key and time window, update running aggregates, join wins with impressions and publish results to stores and dashboards. Outputs feed pacing, spend, fraud checks and floor models. Exactly-once results are hard: a processor that restarts must not count events twice or skip any. Late and out-of-order events require windows that stay open past their nominal end and then close with a defined cutoff.",
    k: ["At-least-once delivery with deduplication vs exactly-once processing: at-least-once is robust and needs identifiers and state to dedupe; exactly-once is convenient and costs throughput and complexity.", "Short windows for freshness vs long windows for accuracy: short is timely and sensitive to late data; long is accurate and delays control decisions."],
    p: ["A processor that lags during a spike feeds the pacing controller old spend, which then overspends.", "State lost on restart without checkpoints resets running counts to zero."],
    v: "Feed a recorded hour of events through the processor with a forced restart halfway. The totals must equal a batch computation over the same hour, and the processing delay must remain under the stated seconds.",
    dep: ["event-log-storage"]
  },
  "event-log-storage": {
    s: "Durable, cheap storage for every auction and event record, partitioned by time, serving analysis, model training, billing and audits.",
    d: "Records are written as compact columnar files partitioned by date and key, in an object store or distributed file system, and also kept in a durable queue for a few days for replay. Volumes reach terabytes a day. Retention tiers move recent data to fast storage and older data to cheap storage, subject to privacy limits. Schema evolution must not break old readers, and loss or corruption must be detectable because money depends on it.",
    k: ["Columnar files vs row-oriented logs: columnar is compact and fast for analysis and awkward for single-record lookup; rows are easy to write and slow to scan.", "Keeping raw data long vs aggregating early: raw allows later questions and increases cost and privacy exposure; aggregates are cheap and answer only what was planned."],
    p: ["A partition written twice by a retried job doubles that hour's spend in reports.", "Raw logs with user identifiers outlive their retention period because a cleanup job failed silently."],
    v: "Count records written per hour against the count received by the queue for a week. Totals must match exactly, every partition must be readable with the current schema, and data older than the limit must be gone.",
    dep: []
  },
  "latency-monitoring": {
    s: "Continuous measurement of response time, timeouts, error rates and bid rates by region, bidder and seller, with alerts that fire before the revenue loss is large.",
    d: "Every auction records timings for each stage and each bidder, and these are aggregated into percentile distributions. Dashboards show the share of requests answered on time, bidder timeout rates and no-bid reasons. Alerts compare against baselines for the time of day, since traffic follows daily patterns. It is hard because averages hide the problem: a rise in the tail may affect one bidder, one region or one seller only, and so metrics need dimensions without exploding in cost.",
    k: ["Percentiles per dimension vs only global percentiles: per-dimension finds local faults and costs storage and cardinality; global is cheap and hides them.", "Fixed thresholds vs baseline-aware alerts: fixed are simple and noisy across daily cycles; baseline-aware fit the pattern and need history and tuning."],
    p: ["Alerting on average latency lets a bad tail run for hours while the average looks fine.", "A bidder's timeout rate rising slowly is not noticed until its seat is a fraction of its earlier spend."],
    v: "Inject a slowdown into one bidder in one region and measure the time to alert. The alert must name the bidder and region, fire within the stated minutes and clear after the slowdown ends.",
    dep: ["stream-processing", "auction-decision-log"]
  },
  "latency-budget": {
    s: "The division of the total response time, usually around a hundred milliseconds, between network, exchange work, bidder time and rendering, decided before any component is built.",
    d: "The seller sets a deadline for the whole auction. Network travel from the user takes a share, the exchange's own work a small share, and bidders the rest, perhaps sixty to eighty milliseconds. Each step in each component spends from that budget, so a new check or lookup has to pay for itself. The budget forces choices: data in memory and not fetched, work moved ahead of time, and early rejection. It must be measured at the tail, not on average.",
    k: ["A tight budget for page speed vs a loose one for more bids: tight keeps pages fast and loses late bidders; loose increases price and delays content.", "Spending budget on richer decisions vs on speed margin: richer decisions raise value per impression; margin protects against tail spikes."],
    p: ["Each team adds a few milliseconds and no one owns the total until bids are late everywhere.", "A budget measured on average hides that one region always misses it."],
    v: "Trace sampled auctions end to end and break down time by stage. The sum must fit the stated deadline at the ninety-ninth percentile, and any stage over its allocation is a named finding.",
    dep: ["timeout-management", "low-latency-runtime"]
  },
  "scale-and-peak-load": {
    s: "Planning for hundreds of thousands of requests per second, daily and event-driven peaks, and the behavior when demand exceeds capacity.",
    d: "Traffic follows daily cycles and spikes for events, holidays and viral content. Capacity is sized for the peak with headroom, and autoscaling responds in minutes, which is slower than spikes. Under overload the system must degrade deliberately: shed low-value traffic, skip optional work and reduce fan-out, rather than slowing everything. Fan-out multiplies load: one request becomes dozens of bidder calls, so scale is felt at every bidder as well.",
    k: ["Provisioning for peak vs autoscaling: peak provisioning is safe and idle most of the day; autoscaling saves cost and lags a sudden spike.", "Shedding by priority vs dropping evenly: priority shedding protects the valuable traffic and needs value estimates; even dropping is simple and costs the most."],
    p: ["Autoscaling reacts after the spike and the first minutes of the event are served badly.", "Overload at the exchange sends bidders a retry storm that makes recovery longer."],
    v: "Load test with traffic at one and a half times the highest observed peak, ramped quickly. Confirm the system sheds by the documented priority, keeps deadline misses inside the limit and returns to normal after the load stops.",
    dep: ["edge-load-balancing", "bidder-fan-out-selection"]
  },
  "privacy-and-compliance": {
    s: "The legal and platform rules on personal data, applied across every layer: what may be collected, matched, stored and used, and how long, which differ by region and change often.",
    d: "Rules from regional laws, browser policies and platform restrictions limit identifiers, location, profiling and data sharing. They require consent signals, opt-outs, deletion on request and records of processing. The decisions are architectural: which data enters a request, where it is stored, how long it lives and which partners receive it. Compliance cannot be added late, because identifiers and logs are everywhere in the system, and a rule change can remove a signal that models relied on.",
    k: ["One global policy at the strictest level vs regional rules: global is simple and gives up targeting where it is legal; regional keeps value and multiplies rules and test cases.", "Building for consent as data vs as filters at the end: consent as data in every record is traceable and expensive; end filters are cheap and miss leaks."],
    p: ["A new log field added by a team contains an identifier and escapes the retention process.", "A rule change from a browser vendor removes an identifier the system assumed was permanent."],
    v: "Trace a test user's data through every store and partner from a request with each consent state. Show where each identifier goes, its retention, and that deletion removes it everywhere within the legal period.",
    dep: ["consent-enforcement", "data-minimization", "data-subject-requests"]
  },
  "accounting-exactness": {
    s: "Deciding how precisely money and counts must be tracked in each place: loose and fast for bidding decisions, exact and reproducible for invoices and payouts.",
    d: "Real-time controls such as budgets and caps are approximate because exactness would cost latency. Billing, in contrast, must be exact and reproducible, so it is computed from durable logs with defined rules for rounding, currency, deduplication and late events. The boundary between the two paths has to be explicit, with reconciliation between them. Tolerances are agreed with buyers and sellers, and disputes are settled against the exact path.",
    k: ["One exact system for everything vs a fast approximate path plus an exact one: one exact system is simple and slows bidding; two paths are fast and require reconciliation between them.", "Integer micro-units vs decimal or floating values: integers are exact and need conversions at the edges; floating values are convenient and accumulate error."],
    p: ["Floating-point sums of tiny prices drift from the exact total over billions of impressions.", "The approximate path is quietly used for billing during an incident."],
    v: "Compare a day of real-time spend estimates with the exact billing total per campaign. The difference must be inside the agreed tolerance everywhere, and billing must reproduce its result when rerun on the same logs.",
    dep: ["budget-accounting", "billing-and-invoicing", "impression-deduplication"]
  },
  "adversarial-participants": {
    s: "Assuming that some sellers, buyers, intermediaries and clients will cheat, and designing each interface so a dishonest party gains little and is detected.",
    d: "Sellers inflate traffic or lie about content, buyers misreport spend or run malicious creatives, intermediaries alter prices or copy supply chains, and bots mimic people. Each public interface, such as the request, the beacon and the creative, is untrusted input. Defenses are layered: authorization files, validation, sandboxing, independent measurement and audits. Since participants also compete, information shared for cooperation, such as winning prices, can be used against others.",
    k: ["Trust by default with after-the-fact audits vs verification before each transaction: audits are cheap and find fraud late; verification is safe and adds latency and rejects honest traffic.", "Independent third-party measurement vs each party's own: third-party is trusted by both and adds cost; own measurement is free and self-serving."],
    p: ["A defense known to fraudsters is evaded within days unless it keeps changing.", "Trusting a field because it is in the standard format ignores that the sender wrote it."],
    v: "Run a red-team exercise that tries spoofed domains, forged beacons, malicious creatives and price manipulation. Record each attempt's detection time and impact, and confirm each is stopped or flagged.",
    dep: ["invalid-traffic-filter", "creative-scanning", "domain-spoofing-detection"]
  },
  "auction-incentives": {
    s: "Choosing auction and market rules, such as price type, floors and information shared, with an eye to how buyers and sellers will change their behavior in response.",
    d: "Rules decide what strategy is best for each party. Second price makes truthful bidding best if the seller is trusted; first price makes shading necessary. Floors raise revenue per sale and reduce sales. Publishing winning prices helps buyers learn and affects their later bids. Any change causes a transition: buyers adapt over weeks, models retrain, and prices settle somewhere new. Measuring the effect requires experiments that account for responses, and not a simple before-and-after comparison.",
    k: ["Transparent rules vs rules that exploit buyer mistakes: transparent rules keep long-run trust and lower short-run revenue; exploiting mistakes raises revenue now and drives buyers away.", "Frequent rule changes vs stable rules: changes tune the market and keep buyers' models stale; stable rules let everyone optimize."],
    p: ["A change in auction type evaluated after one day shows a revenue drop that reverses a month later.", "Rules that favor the exchange's own demand over others are discovered by buyers and cost trust."],
    v: "Run a controlled experiment on a share of traffic for a full buyer adaptation period. Compare revenue, buyer spend and fill rate against control, and report the result after the learning period, not just at the start.",
    dep: ["first-price-clearing", "second-price-clearing", "floor-pricing", "bid-shading"]
  },
});
