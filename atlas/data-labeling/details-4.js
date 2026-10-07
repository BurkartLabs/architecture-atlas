// Details for the data labeling plate, part 4: task routing, workforce management, data ingestion and storage.
ATLAS.details("data-labeling", {
  "task-batching": {
    s: "Grouping items into batches that move through the workflow together, with a stated size, composition and release time, so progress, quality and cost can be managed per batch.",
    d: "A batch is a unit of release: a set of items chosen by filters or samplers, bound to a task template and a guideline version. Batches are small enough to review and fix quickly and large enough to keep workers busy. Each has its own status, budget, audit and deadline. Composition may mix easy and hard items, or items grouped by type so workers stay in one context. The difficulty is size: large batches hide problems until late, tiny ones multiply overhead.",
    k: ["Small batches vs large batches: small batches give fast feedback and cheap correction, while large ones lower overhead and delay the discovery of a bad guideline.", "Grouping similar items vs mixing: grouping speeds workers through context and invites boredom and bias, while mixing keeps attention and costs switching."],
    p: ["A million-item batch is released with an unreviewed guideline error, and the problem surfaces at the end.", "A batch is released before its assets finish preprocessing, and workers hit blank tasks."],
    v: "Release a test batch and confirm that its items, guideline version, template and budget are fixed at release, that progress and quality are reported per batch, and that a recalled batch stops serving tasks within a stated time.",
    dep: ["data-selection-filters", "task-templates", "queue-manager", "budget-controls"]
  },
  "queue-manager": {
    s: "The component that holds waiting tasks, orders them by priority and eligibility, and hands the next suitable task to a worker quickly and fairly.",
    d: "Tasks sit in queues by project, stage and skill requirement. When a worker asks for work, the manager filters eligible tasks, applies priority and the assignment policy, takes a lease and returns one. It tracks depth, wait time and in-flight work, and emits signals when a queue is starving or overflowing. It is hard because it is a high-contention hot spot: thousands of workers ask at once, assignment must be exactly once per lease, and fairness across projects and workers has to hold under load.",
    k: ["Pull model where workers request tasks vs push assignment: pull is simple and self-balancing, while push lets the system plan for skills and deadlines and requires worker availability knowledge.", "A database table as a queue vs a dedicated queue service: a table is simple and transactional, and a queue service scales further and splits the state across systems."],
    p: ["Two workers receive the same task because the claim and the lease were not atomic.", "A busy project's tasks crowd out all others, and smaller projects starve."],
    v: "Run a few hundred simulated workers requesting from a shared queue, and confirm that no task is leased to two workers at once, that wait time stays within bounds, and that priorities are respected.",
    dep: ["assignment-policy", "task-leases", "priority-and-deadlines", "job-queue"]
  },
  "assignment-policy": {
    s: "The rules that decide which eligible worker gets which task: skill match, trust tier, language, load balancing, redundancy needs and fairness.",
    d: "Policy combines hard filters, such as qualification, language, clearance and exclusions, with soft ranking, such as reliability on this class, recent workload and the task's urgency. It enforces redundancy needs, giving each item to different workers, and may reserve difficult items for senior workers. Policies are configured per project. The hard part is competing goals: sending hard items to the best workers raises quality and overloads them, while spreading them evenly dilutes quality.",
    k: ["Best-skilled worker first vs random among qualified: best-skilled maximizes quality and burns out and overloads the few, while random is fair and spreads errors.", "Strict skill filters vs open access with later review: strict filters cut errors and shrink the pool, and open access is fast and puts review under pressure."],
    p: ["All hard items go to the same ten workers, who then slow down and burn out.", "Filters on a qualification that nobody holds leave a queue empty of eligible workers."],
    v: "Simulate a pool with known skills and a mix of easy and hard items, and confirm that tasks go to eligible workers only, that load is spread within stated bounds, and that no item reaches the same worker twice.",
    dep: ["skill-and-trust-profiles", "worker-item-exclusion", "redundancy-policy", "capacity-and-shifts"]
  },
  "task-leases": {
    s: "Time-limited reservations that hold a task for one worker while they work, released on submit, skip or expiry so tasks are neither duplicated nor stuck.",
    d: "When a worker receives a task the queue takes a lease with an expiry sized to the task's expected time plus a margin. Heartbeats from the interface extend it while the worker is active. On submit the lease completes the task, on skip or expiry it returns the task to the queue. Late submissions after expiry are accepted or rejected by rule. It is hard because expiry races with submission, and because lease length trades hoarding against interrupting slow, careful work.",
    k: ["Short leases with heartbeat vs long fixed leases: short leases free abandoned tasks quickly and need reliable heartbeats, while long ones are simple and let abandoned tasks sit.", "Accept late submissions vs discard them: accepting wastes no work and risks duplicate answers, while discarding is clean and wastes paid effort."],
    p: ["A worker's browser sleeps, the lease expires, a second worker takes the task, and both submit.", "Leases are never released after a crash, and the queue shows items in progress that nobody is working on."],
    v: "Start a task, then stop heartbeats and confirm the task returns to the queue after the stated time, and that a late submission is handled according to the documented rule without producing two accepted answers.",
    dep: ["queue-manager", "annotation-ui-framework"]
  },
  "priority-and-deadlines": {
    s: "Ordering of work by urgency and importance, so deadline-bound batches and blocking stages are served first without starving ordinary work.",
    d: "Each batch carries a deadline and priority; items inherit them, and aging raises the priority of waiting items. The queue orders by a combined score. Downstream demand also matters: an adjudication queue that blocks dataset delivery gets raised. Managers can expedite a batch, at a stated cost in worker bonus or reviewer time. It is hard because expediting everything means nothing is expedited, and because a fixed order starves low-priority work indefinitely.",
    k: ["Strict priority classes vs weighted scoring with aging: strict classes are predictable and can starve low classes, while aging ensures progress at the cost of exact guarantees.", "Deadline-based ordering vs value-based ordering: deadlines are easy to state, and value-based ordering uses the budget on data that improves the model most."],
    p: ["Everything is marked urgent, and the order degenerates to arrival time.", "Low-priority batches never complete, and the project's final dataset waits on them."],
    v: "Fill queues with mixed priorities and ages, and confirm that urgent items are served first, that the oldest low-priority item is served within the aging bound, and that expedited batches report their extra cost.",
    dep: ["queue-manager", "throughput-forecasting"]
  },
  "reassignment-and-timeouts": {
    s: "Rules for returning stalled, skipped or rejected tasks to the queue, with limits on retries and escalation of items nobody can complete.",
    d: "Tasks come back when a worker skips, a lease expires, review rejects the work, or the worker is removed. The platform counts attempts, excludes workers who already failed the item, and escalates after a limit to a more skilled queue or to an owner for a decision, since repeated skips usually mean the item or guideline is flawed. It is hard because skip is information: items skipped by many workers are broken, ambiguous or distressing, and treating skips as errors hides that.",
    k: ["Unlimited retries vs cap with escalation: retries eventually complete everything and may loop on bad items, while a cap exposes problems and needs someone to handle escalations.", "Penalizing skips vs allowing them freely: penalties stop cherry-picking and push workers to guess at bad items."],
    p: ["A corrupted item cycles through every worker, wasting hours of attempts.", "Workers skip hard tasks to keep their rate high, and the hard items accumulate at the end of the queue."],
    v: "Plant an unlabelable item in a batch and confirm that after the retry limit it leaves the queue, is escalated with its skip reasons visible, and that the skip rate per item is reported to the guideline owner.",
    dep: ["queue-manager", "worker-item-exclusion", "adjudication-queue"]
  },
  "worker-item-exclusion": {
    s: "Constraints that prevent a worker from seeing the same item twice, from reviewing their own work, or from seeing items conflicting with their role or relationships.",
    d: "The platform records which workers have handled each item and which relations exist: same team, same vendor, same household, reviewer and author. Assignment checks these before giving a task. Exclusion sets are applied to redundancy, gold, review and adjudication. It is hard at scale: checking membership across many items and workers on every request must be fast, and exclusions that are too wide shrink the eligible pool until the queue stalls.",
    k: ["Excluding by team and vendor vs by individual only: team-level exclusion reduces collusion and copying, and cuts the pool and makes small teams unusable for redundancy.", "Checking at assignment vs auditing afterward: assignment checks prevent violations, while audits are cheap and find them only after they have been paid."],
    p: ["A reviewer receives their own submission because author and reviewer ids come from different systems.", "Over-broad exclusions leave a queue with no eligible worker."],
    v: "Attempt to assign an item to a worker who has handled it, to a reviewer who authored it, and to a member of an excluded team, and confirm that each is refused and logged while eligible workers still receive the item.",
    dep: ["team-and-vendor-management", "annotation-history"]
  },
  "worker-onboarding": {
    s: "The path from sign-up to first paid task: identity checks, agreements, training on the guidelines, practice tasks and a qualification decision.",
    d: "New workers verify identity and eligibility, accept terms and confidentiality agreements, read the guidelines and complete practice tasks with feedback. Their results on a qualification set decide entry and starting tier. Onboarding is staged, with small first batches under heavy gold and review. It is hard because training time is unpaid or costly, drop-off is high, and rushing it moves errors into production where they cost far more.",
    k: ["Paid training vs unpaid screening: paid training attracts and retains good workers and costs money for those who leave, while unpaid screening is free and filters for the desperate or the committed.", "One central onboarding vs per-project onboarding: central onboarding is efficient, and per-project onboarding teaches the specifics that decide quality."],
    p: ["Workers pass a qualification by memorizing its fixed questions and fail real tasks.", "Identity checks are skipped to speed growth, and a single person operates many accounts."],
    v: "Follow a test worker from sign-up through qualification, and confirm each step is recorded, that a failing candidate receives feedback and a retry rule, and that a passing worker starts at the stated tier with elevated gold rate.",
    dep: ["qualification-tests", "instruction-guidelines", "identity-and-sso", "consent-and-retention"]
  },
  "qualification-tests": {
    s: "Test sets that decide whether a worker may do a task type, scored against known answers, with pass thresholds, retries and retirement of leaked items.",
    d: "A qualification contains items drawn from gold and example libraries, covering each class and the hard distinctions, delivered in the real interface. Scores per class give a decision to admit, admit with limits, or refuse, and give feedback. Tests are refreshed because items leak. They are hard to calibrate: a threshold too high excludes workers who would have been fine after practice, too low admits those who guess, and the test measures test-taking as much as real skill.",
    k: ["A fixed test vs a randomly drawn one: fixed tests allow comparing across time and leak quickly, while drawn tests resist sharing and vary in difficulty.", "A single overall pass mark vs per-class minimums: per-class minimums find specific gaps and exclude many otherwise good workers."],
    p: ["A worker passes by sharing answers in a forum with friends, and a whole group enters unqualified.", "The test is easy and the real data is hard, so qualification predicts nothing."],
    v: "Compare qualification scores with later accuracy on gold in production for a cohort, and confirm the correlation is positive and above a stated level, that retired items are replaced, and that retries follow policy.",
    dep: ["gold-questions", "example-libraries", "skill-and-trust-profiles"]
  },
  "skill-and-trust-profiles": {
    s: "A record per worker of skills, languages, domains, tier, accuracy history and standing, used by routing, review targeting and pay.",
    d: "Profiles combine declared skills, qualification results, reliability estimates per task type and class, volume, tenure and standing such as warnings. Tiers grant access to harder or better-paid work. Profiles update continuously as evidence arrives, with time decay. Access is limited since profiles are personal data. It is hard because estimates from few observations are noisy, skills are specific and not transferable, and a profile that follows people everywhere can lock them into a low tier.",
    k: ["Tiered access with promotion rules vs continuous scores: tiers are easy to understand and create cliffs, while continuous scores are precise and hard to explain to workers.", "Declared skills vs measured skills: declared skills help early routing and are unreliable, while measured skills need evidence that new workers lack."],
    p: ["A worker with a bad first week is stuck on low tiers because decay and promotion rules never revisit them.", "Profiles are visible to other workers or vendors, and become a source of discrimination."],
    v: "Feed a worker's logged outcomes through the profile logic and confirm that tier changes follow the published rules, that estimates carry intervals, and that the worker can see their own standing and the reasons for changes.",
    dep: ["annotator-reliability-models", "qualification-tests", "access-control"]
  },
  "team-and-vendor-management": {
    s: "Organization of workers into teams and outside vendors with leads, contracts, quotas and scoped access, so groups can be managed and measured as units.",
    d: "Workers belong to teams under a lead, and teams to vendors or internal groups. Leads see their team's throughput and quality and handle coaching. Vendors have contracts with volumes, prices and service levels. The platform scopes data access by team, applies team-level exclusions and reports per team. It is hard because incentives differ: vendors want volume and workers want pay, and the platform's metrics become the contract, so any measurement flaw becomes a dispute.",
    k: ["Vendor-managed workforce vs direct workforce: vendors scale fast and hide the workers and their conditions, while direct workers give control and carry hiring and management cost.", "Team-level quality accountability vs individual: team accountability makes leads coach, and individual accountability is fairer to individuals and ignores team culture."],
    p: ["A vendor lead shares answers across the team to hit a quality bonus, and the independent judgments are not independent.", "Vendor access scopes are too broad, and one vendor's workers see another customer's data."],
    v: "Create a vendor with two teams and confirm that each lead sees only their team, that team-level reports reconcile to individual records, and that a worker cannot open tasks outside the vendor's scope.",
    dep: ["access-control", "identity-and-sso", "multi-tenancy"]
  },
  "capacity-and-shifts": {
    s: "Planning and tracking of how many workers are available when, by skill and time zone, matched to expected queue demand.",
    d: "Workers declare availability or are scheduled in shifts. The platform compares expected demand, from queue sizes and deadlines, with the available skills, and shows gaps by hour. Managers invite workers, release more work to a team or shift deadlines. Timezone coverage matters for expert review and support. It is hard because crowd availability is unpredictable, specialists are few, and overloading volunteers during a crunch produces fatigue and errors.",
    k: ["Scheduled shifts vs on-demand availability: shifts give predictable capacity and cost, while on-demand fits irregular workers and makes capacity uncertain.", "Capacity buffers for expert review vs lean staffing: buffers keep the pipeline flowing and sit idle, while lean staffing makes experts the bottleneck."],
    p: ["Demand peaks at a time when no reviewer is online, and the whole queue waits overnight.", "Workers accept overtime to meet a deadline, and quality falls in the final hours."],
    v: "Compare planned and actual capacity by hour and skill for a week, and confirm that the platform shows the gap before it occurs, and that an expert-review shortfall is raised with its estimated delay.",
    dep: ["skill-and-trust-profiles", "queue-manager", "notification-service"]
  },
  "payments-and-payouts": {
    s: "Calculation and delivery of worker pay: rates, bonuses, adjustments for rejections and disputes, taxes and compliance, paid on a stated schedule.",
    d: "Approved work accrues earnings by task rate, time and bonus rules. Rejections and appeals adjust them. Payouts run on a schedule through payment providers across currencies and countries, with the tax and identity forms each requires. Every amount has a trail back to tasks. It is hard because it is money and law: errors destroy trust quickly, rules differ by country, and delayed pay while review lags is a serious burden on workers.",
    k: ["Pay on submission vs pay after review: pay on submission is trusted by workers and exposes the platform to bad work, while pay after review aligns incentives and delays pay.", "Weekly payouts vs on-demand: frequent payouts attract workers and raise fees and fraud exposure."],
    p: ["A bug in a bonus rule overpays thousands of workers, and clawing back damages trust.", "Rejected work is unpaid with no reason shown, and workers cannot tell what to fix."],
    v: "Run a pay cycle on a test cohort and reconcile each payout to its task records and rate rules to the cent, confirming rejections, appeals and bonuses are itemized and that failed transfers are retried and reported.",
    dep: ["rate-setting", "annotation-history", "quality-gates", "audit-log"]
  },
  "worker-feedback-and-support": {
    s: "Channels through which workers see results, ask questions and report problems: score feedback, a help desk, forums and guideline questions answered quickly.",
    d: "Workers need to know why work was rejected, what their scores mean and how to improve. The platform shows per-task feedback, gives a place to ask about unclear items, and routes questions to guideline owners and experts. Answers become rulings. Support handles pay, access and technical problems. It is hard because feedback scales poorly and unanswered questions block work, while open forums leak gold and spread unofficial interpretations.",
    k: ["Automated feedback on each error vs periodic summaries: per-error feedback teaches fast and is expensive to review, while summaries are cheap and teach slowly.", "Official question channel vs open forum: an official channel keeps answers consistent and slow, while forums are fast and spread wrong rules."],
    p: ["Questions sit unanswered for days, and workers guess and then get penalized.", "Feedback explains a rejection by a rule that conflicts with the guideline."],
    v: "Submit a test question about an unclear item, and confirm it reaches an owner, the answer arrives within the stated time, is shown to others as a ruling if general, and that rejected tasks show their reasons.",
    dep: ["edge-case-rulebook", "dispute-and-appeal", "notification-service"]
  },
  "offboarding-and-bans": {
    s: "Rules and process for removing workers: low quality, fraud, policy violation or leaving, with warning steps, evidence, appeal and cleanup of their access and open work.",
    d: "Removal follows evidence such as repeated gold failures, copied answers, multiple accounts or privacy breaches. A staged process warns, restricts, then removes, with the evidence preserved and an appeal route. On exit the platform revokes access, reassigns open tasks, finalizes pay, and decides what happens to their past labels: kept, re-reviewed or discarded. It is hard because fraud detection signals are noisy, wrongful bans harm real people, and a removed worker's earlier labels may be tainted.",
    k: ["Automated bans from thresholds vs human review of each case: automation is consistent and fast and mistakes at scale, while human review is fair and slow.", "Discard a banned worker's past labels vs re-review a sample: discarding is safe and costly, while sampling saves money and may leave tainted data."],
    p: ["A genuine worker is banned by a fraud heuristic and loses unpaid earnings with no explanation.", "A fraudster's earlier labels remain in the dataset because nobody traced them."],
    v: "Offboard a test worker and confirm that access ends immediately, open tasks return to the queue, past labels are flagged for the chosen treatment with a count, and the evidence and appeal route are recorded.",
    dep: ["skill-and-trust-profiles", "dispute-and-appeal", "annotation-history", "access-control"]
  },
  "data-connectors": {
    s: "Adapters that read data from customers' storage buckets, databases, warehouses and streams, and keep a reference to the source so assets can be refreshed or traced.",
    d: "A connector authenticates to the source with scoped credentials, lists or queries items, and returns references and metadata, optionally copying the data. It supports incremental sync using markers such as modification times. Credentials are stored encrypted and scoped read-only. It is hard because sources are inconsistent: listings are huge and slow, items change under the platform, permissions are fragile, and a platform that copies everything duplicates storage and legal exposure.",
    k: ["Reference in place vs copy into platform storage: references avoid duplication and rely on the source remaining available and unchanged, while copies are stable and cost storage and compliance scope.", "Pull on schedule vs event-driven notification: scheduled pulls are simple, and events are timely and require source support."],
    p: ["The source object is overwritten after labeling, and the annotation no longer matches the asset.", "A connector lists a billion objects on every sync and runs for days."],
    v: "Connect a test bucket, sync, change one object and delete another, then sync again, and confirm the platform detects both, keeps the old version referenced by existing annotations, and uses read-only credentials.",
    dep: ["asset-ingestion", "encryption", "access-control", "job-queue"]
  },
  "asset-ingestion": {
    s: "The pipeline that registers new items: validates the format, extracts metadata, assigns stable ids, records checksums and creates records ready for batching.",
    d: "Each incoming item is checked for readability and format, hashed, given an id independent of its location, and stored or referenced with its metadata such as dimensions, duration, language and source. Failures go to a quarantine list with reasons. Ingestion triggers deduplication, preprocessing and indexing. It is hard because input quality is uneven, volume arrives in bursts, and every later layer depends on the id and checksum being right and permanent.",
    k: ["Content-hash ids vs assigned ids: hashes make deduplication and integrity checks natural and change when content is re-encoded, while assigned ids are stable and need separate integrity data.", "Reject bad items at ingestion vs accept and flag: rejecting protects the queue and loses data silently, while flagging keeps everything and adds states."],
    p: ["A corrupt file passes ingestion and shows blank in thousands of paid tasks.", "Re-ingestion of the same source creates duplicate records with new ids, and labels are split between them."],
    v: "Ingest a set containing valid, corrupt, truncated and duplicate files, and confirm that each lands in the correct state with a reason, that ids are stable across a repeat ingestion, and that checksums match the source.",
    dep: ["data-connectors", "asset-storage", "metadata-index", "deduplication"]
  },
  "deduplication": {
    s: "Detection of identical and near-identical items so the same content is not labeled twice and does not leak between training and evaluation splits.",
    d: "Exact duplicates are found by content hash. Near duplicates are found by perceptual hashes, text shingles or embedding similarity with a threshold, then grouped. The platform keeps one representative, links the rest, or ensures a group stays on one side of a split. It is hard because similarity is a judgment: crops, re-encodings and paraphrases are duplicates for some purposes and distinct data for others, and comparing every pair is quadratic without indexing.",
    k: ["Remove near duplicates vs keep and group them: removal saves labeling cost and loses natural frequency, while grouping preserves data and requires the split logic to respect groups.", "A strict similarity threshold vs a loose one: strict misses variants that leak across splits, and loose merges items that are genuinely different."],
    p: ["Near duplicates are split between training and test sets, and the evaluation overstates accuracy.", "A loose threshold merges distinct rare examples and removes the very cases the model needs."],
    v: "Insert known copies, crops and re-encodings of items into a dataset, and confirm that the platform groups them at the documented threshold, that grouped items stay in one split, and that distinct items are not merged.",
    dep: ["asset-ingestion", "metadata-index", "splits-and-sampling"]
  },
  "preprocessing-and-proxies": {
    s: "Preparing assets for display: thumbnails, resized images, transcoded video, audio waveforms, text normalization and tiling, so tasks load fast and consistently.",
    d: "After ingestion, jobs create derived assets: smaller proxies for fast loading, tiled pyramids for huge images, transcoded streams, peaks for waveforms, normalized text with an offset map back to the original, and OCR layers. Annotations are stored relative to a stated canonical asset so proxies never change the coordinates. It is hard because derivations multiply storage, because coordinates must map exactly between proxy and original, and because a normalization change invalidates every stored offset.",
    k: ["Annotating on proxies vs on originals: proxies load fast, and labels must be scaled back exactly, while originals avoid mapping and are heavy.", "Eager preprocessing vs on demand: eager makes tasks instant and wastes work on items never labeled, while on demand saves compute and delays the first view."],
    p: ["A resized proxy has a different aspect ratio, and every exported box is shifted.", "Text normalization is updated, and previously stored span offsets no longer match."],
    v: "Annotate on a proxy, export in original coordinates, and confirm that the regions overlay correctly on the original image with sub-pixel error within the stated tolerance, and that regenerating a proxy leaves existing annotations valid.",
    dep: ["asset-ingestion", "asset-storage", "job-queue"]
  },
  "metadata-index": {
    s: "A searchable index of item attributes, source, model predictions, labeling status and history, which supports selection, sampling and exploring the data.",
    d: "The index stores structured fields such as source, date, size and class counts, derived fields like embeddings and model scores, and labeling state. It supports filters, faceting, similarity search and counts, powers samplers and data selection, and is updated as items change state. It is hard because it combines transactional state, which changes with every task, with analytical queries over billions of items, and because stale index entries select items that are already labeled or removed.",
    k: ["A single store for state and search vs a separate search index: a single store is consistent and slower on large queries, while a separate index is fast and eventually consistent.", "Precomputed embeddings vs computed on demand: precomputed embeddings give instant similarity search and storage cost, while on-demand computation is flexible and slow."],
    p: ["The index lags labeling state, and a sampler releases items that were just completed.", "Embeddings from an older model are mixed with new ones, and similarity results are meaningless."],
    v: "Change an item's state and confirm that a filter query reflects it within the stated lag, that counts by class match the annotation store, and that a similarity query returns the known near neighbors of a test item.",
    dep: ["asset-ingestion", "annotation-store"]
  },
  "asset-storage": {
    s: "Durable storage for original and derived assets, laid out and replicated so large volumes can be read quickly by interfaces, exports and training jobs.",
    d: "Assets live in object storage under immutable keys derived from content or ids, with lifecycle rules that move cold data to cheaper tiers, replicate for durability and delete on retention expiry. A cache or content delivery layer serves interface reads. Versions are retained so annotations always resolve. It is hard because volume is large, egress costs real money, read patterns are bursty when a batch opens, and deletion obligations must reach every derived copy.",
    k: ["Immutable objects with new keys on change vs overwrite in place: immutability keeps annotations valid and uses more storage, while overwriting saves space and breaks references.", "Regional storage near workers vs one central store: regional copies make tasks load fast and multiply storage and compliance scope."],
    p: ["A retention deletion removes the original but not the proxies and thumbnails.", "A batch opens, and thousands of workers read cold storage at once, so tasks load slowly."],
    v: "Ingest an asset, derive proxies, then run a deletion request and confirm every copy and derivative is removed within the stated time, while a repeat read of a retained asset returns identical bytes.",
    dep: ["encryption", "data-residency"]
  },
  "signed-url-access": {
    s: "Short-lived, scoped links by which interfaces and consumers fetch assets directly from storage, so the platform checks permission without proxying every byte.",
    d: "When a worker opens a task, the platform checks their assignment and issues links valid for minutes, restricted to the specific objects and read-only. The browser then downloads straight from storage or a delivery layer. Links are logged. It is hard because links are bearer credentials: anyone who has one can use it until it expires, so lifetime and scope must be small, while a task left open for an hour must not break when its links expire.",
    k: ["Short links with refresh vs long-lived links: short links limit leakage and require the interface to refresh them transparently, while long links are simple and stay valid after a worker's access ends.", "Direct storage access vs a proxy that checks each request: direct access scales cheaply, and a proxy can enforce per-request policy at much higher cost."],
    p: ["A link pasted into a chat remains valid for a day and exposes private data outside the platform.", "Links expire mid-task, and the image goes blank while the worker is drawing."],
    v: "Open a task, wait past the link lifetime and confirm that the interface refreshes links without losing work, that an expired or foreign link is refused, and that issuance is logged against the worker and task.",
    dep: ["asset-storage", "access-control", "audit-log"]
  },
  "data-selection-filters": {
    s: "Query tools for choosing which items to label, by metadata, model output, similarity or previous labels, saved as named, reproducible selections.",
    d: "Project owners build filters over the metadata index, such as source, date, model confidence, class presence and region, combine them with samplers, and save the result as a named, versioned selection from which batches are created. Selections can be exact lists or live queries frozen at release. It is hard because the choice of data decides what the model can learn, and because an informal, unrecorded selection cannot be reproduced when someone asks why a class is under-represented.",
    k: ["Frozen selection lists vs live queries: frozen lists are reproducible and go stale, while live queries stay current and change what a batch contains without notice.", "Selection by model confidence vs by random sample: confidence selection targets value and biases the data, while random sampling is unbiased and wasteful."],
    p: ["A filter on a metadata field that is missing for older items quietly excludes them all.", "A selection built in a scratch session is not saved, and nobody can say how the batch was chosen."],
    v: "Save a selection, run it twice a week apart with new data arriving, and confirm the frozen version returns the same item list, that the live version reports the difference, and that a batch records the selection id.",
    dep: ["metadata-index", "task-batching"]
  }
});
