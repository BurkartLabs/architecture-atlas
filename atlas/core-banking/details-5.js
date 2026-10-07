// Details for the core banking plate, part 5: availability, storage, migration.
ATLAS.details("core-banking", {
  "transactional-store": {
    s: "The durable database that holds accounts, balances and entries and provides the atomic, isolated transactions every posting depends on.",
    d: "A relational or ledger-oriented store with full atomicity, durability and strong isolation on the posting path. Writes go to a write-ahead log flushed to disk, with synchronous copies to a second location. Schema covers accounts, balances, entries, journals and reference data. Indexes serve the hot paths of posting and inquiry. The difficulty is that every requirement meets here: consistency, latency, volume, availability, retention, and the need to change schema in a system that never stops.",
    k: ["Relational store with strong transactions versus a distributed log-based store: familiar guarantees and simple reasoning, but vertical scaling limits; distributed designs scale out but need careful handling of cross-partition atomicity.", "Synchronous durable commit versus relaxed durability: no committed posting is lost, but each write pays a disk and network round trip."],
    p: ["A schema change that locks a hot table stalls all postings during the day.", "Storage latency spikes under checkpoint or backup activity and posting times out."],
    v: "Pull the power on the primary during a write-heavy test and confirm after recovery every acknowledged posting is present, no partial postings exist, and balances reconcile to entries.",
    dep: []
  },
  "partitioning-sharding": {
    s: "Splits accounts and entries across partitions or nodes by key so that capacity grows with load, while keeping each posting within as few partitions as possible.",
    d: "Data is partitioned usually by account or customer identifier, and history by date. A posting between accounts in different partitions needs coordination, so designs try to keep related accounts together, or use sagas or two-phase protocols for transfers across partitions. Routing layers find the right partition. Rebalancing moves data while live. The difficulty is hot spots and cross-partition operations: a few internal accounts take huge volume, and every cross-shard transfer costs more and risks partial failure.",
    k: ["Partition by customer versus by account: customer-level operations stay local, but a business with millions of accounts leads to very uneven shards.", "Two-phase commit across shards versus saga with compensation: atomic transfers, but lock holding and coordinator failure; sagas are available but expose intermediate states."],
    p: ["A hot internal account on one shard limits the throughput of the entire bank.", "Resharding drops or duplicates rows because routing and data movement were not switched atomically."],
    v: "Run a test load with realistic skew, including transfers across shards and a rebalance while live, and confirm throughput scales with nodes and no entry is lost or duplicated, checked by control totals.",
    dep: ["transactional-store", "account-master"]
  },
  "high-availability-failover": {
    s: "Keeps the core running through the failure of a server, node or zone by running redundant instances and switching to a healthy one without losing committed postings.",
    d: "Within a site the database has a synchronous replica and automatic or orchestrated promotion; application tiers are stateless and load balanced. Health checks, fencing and quorum prevent two nodes from believing they are primary. Clients retry safely thanks to idempotency. It is hard because the failure modes are subtle: slow nodes, network partitions and half-completed switches are harder than clean crashes, and failover tests may be avoided because they are risky.",
    k: ["Automatic promotion versus operator-approved failover: short outages, but wrong decisions in ambiguous situations may cause split-brain.", "Active-passive versus active-active: simple correctness, versus capacity use and lower recovery time at the cost of conflict handling for writes."],
    p: ["Both nodes accept writes after a network partition and balances diverge.", "Applications cache the old primary's address and keep failing after the switch."],
    v: "Terminate the primary during peak test traffic and confirm promotion within the target time, clients recover through retries, no committed postings are lost, and no split-brain is detected.",
    dep: ["transactional-store", "idempotency-dedup", "monitoring-alerting"]
  },
  "disaster-recovery": {
    s: "Maintains the ability to restore the core at another site after the loss of a data center, to defined recovery time and data loss objectives, and proves it with tests.",
    d: "A secondary site holds a replicated copy, kept current by synchronous or asynchronous replication, plus backups in separate storage. Runbooks, automation and network switchover define how the secondary takes over, including payment scheme connections and external certificates. Regular exercises restore real data and run real transactions. The difficulty is everything around the database: connections to schemes, keys, configuration and the people and procedures, any of which can be missing when needed.",
    k: ["Synchronous replication to a nearby site versus asynchronous to a distant one: zero data loss, but distance limits and write latency; distant sites tolerate regional disasters but may lose recent postings.", "Warm standby versus cold restore: faster recovery, but ongoing cost and risk of configuration drift."],
    p: ["The DR site lacks a firewall rule to the payment scheme and cannot send payments.", "Backups are never test-restored and prove unreadable when needed."],
    v: "Conduct a full failover exercise to the secondary site, run a business day of transactions including scheme payments, fail back, and confirm recovery times, zero lost postings and clean reconciliation.",
    dep: ["transactional-store", "encryption-key-management", "clearing-settlement-interface"]
  },
  "message-bus": {
    s: "The durable messaging backbone that carries events and commands between the core and surrounding systems with ordering, retries and replay.",
    d: "Producers publish events to topics or queues, and consumers read them at their own pace, with acknowledgment and redelivery on failure. Ordering is typically guaranteed per key, such as an account. Messages are retained for replay so a new consumer can rebuild its state. Dead-letter handling isolates poison messages. The challenge is guarantees: delivery is at least once, so consumers must be idempotent, ordering across keys does not exist, and a stalled consumer or a full broker can back up and slow the producer.",
    k: ["At-least-once delivery with idempotent consumers versus exactly-once claims: robust and simple to operate, but every consumer must handle duplicates.", "Per-account ordering only versus global ordering: scalable, but a consumer needing cross-account order must reconstruct it."],
    p: ["A poison message blocks a partition and all later events for those accounts wait.", "Retention too short means a consumer outage longer than a few days loses events permanently."],
    v: "Stop a consumer for an hour under load, restart it, and confirm it receives every event in per-account order with no gaps, and that duplicates injected by the broker produce no double effect.",
    dep: ["transactional-store"]
  },
  "reporting-replicas": {
    s: "Read-only copies of core data, kept nearly current, that serve inquiries, reports and extracts so they never compete with posting for resources.",
    d: "Replication streams changes from the primary to replicas with a small lag. Queries from channels, analytics, regulatory extracts and operations go there. Some replicas are shaped differently, such as denormalized for balances and recent history. The core's writes are unaffected by heavy reads. It is hard because lag is real and variable: a customer just posted a payment, and the replica says otherwise, and long queries on a replica can stall replication.",
    k: ["Asynchronous replicas versus synchronous: no impact on posting latency, but readers see slightly stale data and must be told or routed to the primary when freshness matters.", "Reshaped read stores versus plain replicas: much faster queries, but another pipeline to build and reconcile."],
    p: ["A long analytical query blocks replication, and every reader sees data hours old.", "Read-after-write is broken for the customer's own transaction because the app reads from a replica."],
    v: "Measure replication lag under peak load against its target, make a payment and confirm a read directed to the replica reflects it within the target or routes to the primary, and totals match the primary at a point in time.",
    dep: ["transactional-store", "message-bus"]
  },
  "capacity-performance": {
    s: "Plans, tests and tunes the system's throughput and latency against peak demands such as salary days, month end, promotions and batch windows.",
    d: "Performance targets are stated per operation, such as authorization under two hundred milliseconds and postings per second at peak, and tested with realistic volumes and data skew. Teams model growth, run load tests before releases and watch headroom in production. Bottlenecks usually sit in hot accounts, locks, indexes and batch windows. It is hard because the worst day is rare but decisive, test data rarely matches production skew, and fixes may require data model changes.",
    k: ["Test at production volume and skew versus synthetic uniform load: finds real hot spots, but needs a costly production-sized environment.", "Provision for peak versus scale elastically: reliable on the worst day, but wasteful the rest; elastic saves cost but scaling a stateful core is slow."],
    p: ["Tests with evenly distributed accounts miss the one merchant account that carries thousands of postings a second.", "Month-end batch grows year by year until it no longer fits its window."],
    v: "Run a load test with a replay of the busiest past day at one and a half times volume and confirm latency and error targets hold, and that the batch completes within its window with spare headroom.",
    dep: ["transactional-store", "partitioning-sharding", "batch-job-framework"]
  },
  "monitoring-alerting": {
    s: "Watches business and technical health, from payment success rates and reconciliation breaks to queue depth and latency, and alerts the right people before customers notice.",
    d: "Technical metrics cover resources, latency, errors and replication lag; business metrics cover postings per minute, payment rejection rates, suspense balances, batch progress and balance-to-ledger differences. Alerts are tied to runbooks and on-call rotations, with correlation ids to trace one transaction across components. The difficulty is signal: too many alerts are ignored, and some failures, such as quietly missing events, produce no error at all and are found only by checking business invariants.",
    k: ["Business invariant checks versus infrastructure metrics alone: catches silent correctness failures, but needs deliberate design of each check.", "Alert on symptoms customers feel versus on causes: fewer false alarms, but diagnosis is slower without cause-level data."],
    p: ["A stuck event consumer produces no errors, and downstream systems are stale for hours.", "Alert fatigue leads on-call staff to silence the one alarm that matters."],
    v: "Inject a fault that silently stops events or delays a batch, and confirm an alert fires within minutes naming the symptom, with a runbook link and enough trace data to locate the failing step.",
    dep: ["reconciliation-engine", "message-bus", "audit-trail"]
  },
  "legacy-coexistence": {
    s: "Runs the new core alongside the old one for an extended period, dividing products, customers or functions between them while presenting one bank to customers.",
    d: "Few banks cut over in one step. For months or years some accounts live in the legacy core and some in the new, and services must route requests to whichever holds the account, give one view across both and keep the general ledger consistent. Interfaces such as payments and statements must work for both. The difficulty is that the bank temporarily has two systems of record, with duplicated operations, risk of inconsistency, and costs that run until the last account moves.",
    k: ["Route by account ownership versus replicate data both ways: clear single master for each account, but cross-core transfers and views need integration.", "Long coexistence versus short and big: less risk per step, but prolonged cost and complexity of dual running."],
    p: ["A customer with accounts on both cores sees inconsistent totals because one feed is delayed.", "Interface changes are made only in the new core, and the legacy side breaks."],
    v: "Using test customers split across both cores, perform transfers between them, view balances and obtain statements, and confirm the sum of both ledgers' control accounts stays consistent with the consolidated ledger.",
    dep: ["anti-corruption-layer", "channel-orchestration", "subledger-gl-mapping"]
  },
  "anti-corruption-layer": {
    s: "A translation layer that maps the old core's concepts, formats and quirks to the new core's model so new components do not inherit the legacy design.",
    d: "It exposes clean interfaces to channels and new services, and converts calls and data to what the legacy core expects, and back. It absorbs oddities such as fixed-width records, unusual codes and different date or balance semantics. Over time, functions move behind it to the new core without callers changing. It is hard because the mapping is full of implicit rules that are not documented, and because it can become permanent technical debt if never retired.",
    k: ["Dedicated translation layer versus modifying consumers to speak both languages: new code stays clean and migration is invisible to callers, but the layer must be built and eventually removed.", "Synchronous calls to legacy versus replicated read data: fresh answers, but legacy availability and speed limit the new system."],
    p: ["The layer encodes legacy bugs as intended behavior and carries them into the new core.", "It becomes a permanent dependency no one has the knowledge to remove."],
    v: "Run a recorded set of production-like requests through the layer to both cores and compare outcomes field by field, and confirm differences are only those in a documented list.",
    dep: ["api-gateway", "extraction-mapping"]
  },
  "extraction-mapping": {
    s: "Pulls data out of the legacy core and transforms it into the new core's structures, with explicit rules for each field, code and status.",
    d: "Extraction reads accounts, customers, balances, schedules, mandates and history from the old system, cleans and maps them using documented rules, and loads them in a staging area for validation before load. Product and code mappings link old types to new products and ledger accounts. Rehearsals run repeatedly against production copies. It is difficult because legacy data is inconsistent after decades, fields are reused for different meanings, and quality issues appear only when the new system strictly validates them.",
    k: ["Migrate full history versus balances and recent history: complete audit continuity, but long extractions and larger risk; partial history is quicker, with the old system kept for archived queries.", "Clean the data in the old system first versus during mapping: the source is fixed once, but the legacy team must make changes they would normally avoid."],
    p: ["A legacy field with several meanings is mapped to only one, and thousands of loans carry wrong terms.", "Extraction runs against a live system and captures a state that never existed."],
    v: "Run a full rehearsal on a production copy and confirm account counts, balances per product, loan schedules and customer counts match the legacy source, with every rejected record explained.",
    dep: ["product-catalog", "account-master", "customer-master"]
  },
  "migration-reconciliation": {
    s: "Proves that every customer, account, balance and schedule arrived intact by comparing the old and new systems at several levels before and after cutover.",
    d: "Checks run at multiple levels: counts of customers and accounts, balances by account, totals by ledger account, interest accrued, loan schedules and their next due amounts, and statement continuity. Differences are classified as expected, such as rounding, or defects. Sampled customers are compared in detail. Reconciliation is repeated through rehearsals and on the final cutover. It is hard because exact equality across systems with different rounding and semantics requires agreed rules and a long tail of explained exceptions.",
    k: ["Full comparison of every account versus sampling: full proof, but heavy to run within the cutover window; sampling is quick but can miss a systematic error in a small segment.", "Automated rule-based comparison versus manual review of breaks: scales to millions of accounts, but rules must be agreed with finance and audit in advance."],
    p: ["Totals reconcile because errors offset, while individual balances are wrong.", "Exceptions are accepted under time pressure with no sign-off."],
    v: "Compare all migrated account balances and loan next-due amounts to the legacy values at the cutoff, and confirm zero unexplained differences, with the total difference per ledger account equal to the documented rounding.",
    dep: ["reconciliation-engine", "extraction-mapping", "trial-balance"]
  },
  "parallel-run": {
    s: "Processes the same transactions in both old and new cores for a period and compares results daily, to find differences before customers depend on the new system.",
    d: "Production traffic or a copy is fed to the new core as shadow processing. At end of day, balances, interest, fees and ledger results are compared with the legacy core's. Differences are investigated until they are explained or fixed. Parallel running exercises batch jobs, month-end and unusual events. It is expensive and exposes issues rehearsals do not. The challenge is isolating side effects, so the shadow system never sends real payments or notices, and handling differences from legitimate rule changes.",
    k: ["Full parallel run for a month-end cycle versus shorter tests: finds period-end and rare-case defects, but doubles operational work for weeks.", "Shadow with no side effects versus live in both: safe, but doesn't test integration with external schemes."],
    p: ["The shadow system sends real notices or payments because an outbound connection was left enabled.", "Differences are suppressed as known without understanding them, and later cause real errors."],
    v: "Run two month-end cycles in parallel, and confirm that daily balances, interest and ledger postings from both cores agree for all accounts except those on a documented exception list.",
    dep: ["migration-reconciliation", "eod-orchestrator", "event-publication"]
  },
  "incremental-migration": {
    s: "Moves customers or products to the new core in waves, starting with low-risk segments, instead of all at once.",
    d: "Waves are chosen by product, branch or customer segment: new accounts first, then simple deposits, then complex products such as loans and corporate accounts. Each wave has entry criteria, a rehearsal, a cutover weekend, and a stabilization period before the next. Routing tables direct traffic. Lessons feed the next wave. The difficulty is that segments are not independent: customers hold products across waves, shared mandates cross boundaries, and a bad wave must be able to pause the program.",
    k: ["Wave by product versus by customer: product waves simplify rules, but customers see a mixed experience; customer waves are coherent but need all products ready first.", "Small first waves versus larger early ones: low risk and fast learning, but slower overall and the cost of dual running grows."],
    p: ["A cross-wave dependency such as a joint account is overlooked and the customer loses access.", "Pressure to hit dates compresses stabilization and defects carry into the next wave."],
    v: "After each wave, confirm migrated customers' balances, payments, statements and notifications work in the new core for a full cycle, and the next wave starts only when exit criteria and open-defect limits are met.",
    dep: ["legacy-coexistence", "migration-reconciliation", "cutover-rollback"]
  },
  "cutover-rollback": {
    s: "The rehearsed plan for the moment of switching over, with a timeline, go or no-go checks, and a defined way back if the new core fails after switching.",
    d: "Cutover freezes the legacy core, extracts final balances, loads and reconciles them, reconnects channels and payment schemes to the new core, and opens for business. Each step has an owner, a time and a check. A go or no-go decision happens at set points. Rollback is easy before real transactions occur and very hard afterward, since activity on the new core would have to be replayed into the old. The challenge is coordination across hundreds of people and external parties in a short window.",
    k: ["Rollback point before first live transaction versus ability to roll back later: simple and certain, but after that the only way is forward; later rollback needs replay tooling.", "Weekend big-bang switch for a wave versus gradual traffic shift: short disruption and clear state, but concentrated risk."],
    p: ["The rehearsal never included the payment scheme's real connection, which fails on cutover day.", "The rollback plan assumes legacy data is unchanged, but batch jobs already ran."],
    v: "Rehearse the cutover end to end at least three times on production-sized data, and confirm each step's timing, the reconciliation and a rollback drill all finish within the allowed window.",
    dep: ["extraction-mapping", "migration-reconciliation", "disaster-recovery"]
  },
  "release-configuration-management": {
    s: "Controls how code and configuration changes are built, tested, approved and deployed to the core, with the ability to prove what is running and revert it.",
    d: "Changes move through environments with automated tests, including regression suites on known balances and interest, and approval gates. Configuration, such as product parameters, is versioned and promoted the same way as code. Releases are scheduled around month end and peak days, with feature flags to separate deployment from activation. Environments carry masked production-like data. The challenge is keeping test environments faithful and database changes safe, because the core cannot simply be taken down and a bad release can post wrong money at scale.",
    k: ["Frequent small releases versus infrequent large ones: lower risk per change and quick fixes, but needs strong automation; large releases are easier to schedule but harder to diagnose.", "Feature flags for new behavior versus branch deployment: rollback without redeploying, but flag combinations multiply test cases."],
    p: ["Configuration is edited directly in production and differs from every test environment.", "A release is deployed on the last day of the month and a defect distorts month-end results."],
    v: "Promote a change through all environments, confirm automated regression suites reproduce known balances and interest to the cent, the deployed version and configuration are identifiable, and revert it in a drill within the stated time.",
    dep: ["product-parameters", "maker-checker", "audit-trail"]
  },
});
