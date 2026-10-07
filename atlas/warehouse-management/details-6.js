// Details for the warehouse management plate, part 6: cross-cutting concerns.
ATLAS.details("warehouse-management", {
  "inventory-accuracy-and-concurrency": {
    s: "How the system keeps stock counts true when many workers, machines and messages change them at once, and when the physical world drifts from the record.",
    d: "Accuracy is a chain: every physical move must be scanned, every scan must post once, every posting must be consistent under concurrent access, and counts must find what slipped through. Decisions here include which transactions lock which rows, how holds and allocations are represented, and how often counts run. It touches allocation, picking, receiving, adjustments and the data layer, and no layer can compensate for a gap in another.",
    k: ["Scan-everything discipline vs trusting workers on low-value goods: scanning keeps records tight and costs seconds per move, trust is fast and drifts.", "Strong consistency on hot stock rows vs eventual consistency with reconciliation: strong is correct and contended, eventual scales and allows overselling windows."],
    p: ["Moves made without scanning, such as forklift shuffles, make the ledger wrong in ways only counts can find.", "A design that is correct in tests collapses under peak contention on the fastest items."],
    v: "Run a peak-load test with random concurrent picks, moves and receipts and a final physical count: system and physical quantities agree for every item, and the ledger replays to the same balances.",
    dep: ["inventory-ledger","inventory-locking","cycle-counting","task-engine"]
  },
  "real-time-versus-batch": {
    s: "The choice, per function, between acting immediately on each event and processing in scheduled batches, which shapes timing, cost and how well the floor flows.",
    d: "Order release, allocation, replenishment, label printing, host feeds and reports can each run per event or in batches. Real time keeps the floor smooth and reacts to change but costs constant processing and complexity; batches are simple and predictable but create waves, delays and stale views. Warehouses often mix them: wave releases with real-time confirmations, batch reconciliation with real-time scans.",
    k: ["Wave release in batches vs continuous streaming: batches balance load and cutoffs, streaming improves flow and removes natural checkpoints.", "Real-time host feeds vs periodic files: real time keeps channels accurate and needs resilient messaging, files are simple and leave stale windows."],
    p: ["Batch jobs that run late silently delay every step after them.", "Real-time everything without backpressure collapses under a spike of orders."],
    v: "For each function, state the maximum tolerated lag and measure it under peak load; the real lag from event to visible effect must stay under that limit.",
    dep: ["wave-planning","continuous-order-streaming","job-scheduler","message-queue"]
  },
  "exception-handling-and-recovery": {
    s: "How the system treats the many things that go wrong on a normal day: shortages, damage, errors, failed messages and broken machines, and gets work flowing again.",
    d: "Every function has a happy path and several exits: short pick, over-receipt, address error, jam, failed message. Design decisions include which exceptions are automatic and which need people, how work paused by an exception resumes, and how long things may wait before escalating. Exceptions are common and often a large share of labor, so treating them as an afterthought leaves orders stuck in states nobody owns.",
    k: ["Automatic resolution rules vs human review for each exception type: automatic keeps flow and can hide root causes, review finds causes and takes time.", "Central exception queue vs handling inside each function: central gives one view, local keeps the context where the data is."],
    p: ["Exceptions raised without a link to the paused work leave orders in limbo.", "Retries without limits turn a bad message into an endless loop."],
    v: "Inject each exception type in a test environment and confirm each lands with an owner, shows its age, and that resolving it resumes the paused order with no manual status edits.",
    dep: ["exception-queue","short-pick-handling","receipt-discrepancies","equipment-fault-handling"]
  },
  "configurability-per-site-and-owner": {
    s: "How far behavior is shaped by settings and rules per building, client and item class, rather than by code, and how that variation is kept safe.",
    d: "Sites differ in layout, equipment and process, and owners differ in contracts, labels and cutoffs. The more is configurable, the fewer special builds are needed and the more combinations must be tested. Decisions include where rules live, how they are scoped and inherited, who may change them and how changes are staged and rolled back. Heavy configurability moves risk from developers to configurers.",
    k: ["Rich configuration vs a few standard processes: rich fits every customer and creates untestable combinations, standard is predictable and turns customers away.", "Extension points for custom code vs configuration only: extensions handle unique cases and make upgrades harder."],
    p: ["Configuration spread across many screens, so nobody knows why the system behaved as it did.", "A per-owner exception becomes permanent and unrecorded."],
    v: "Export the full configuration of two sites and diff them: every difference is explained by a documented reason, and a change can be rolled back to a previous version with identical behavior.",
    dep: ["configuration-rules","multi-site-tenancy","workflow-engine","multi-owner-inventory"]
  },
  "peak-season-scalability": {
    s: "How the system and the building cope when order volume multiplies for a few weeks, with extra temporary labor, more devices and heavy contention on popular items.",
    d: "Peaks stress the weakest link: the database on hot rows, the wireless network, label printing, carrier APIs, the pack stations and the exception queue. Design decisions include capacity headroom, load shedding, simplified peak-time processes, and throttled integrations. Testing at peak volumes before the season is the only way to find the limits, since normal-day tests show nothing.",
    k: ["Provision for peak all year vs scale up temporarily: all year is simple and costly, temporary saves money and needs reliable scaling and rehearsal.", "Degrade features at peak vs keep full function: degrading protects core flow and removes niceties, full function risks slowdowns across the board."],
    p: ["Peak tests run with clean data miss problems caused by the messy real mix of orders.", "New temporary workers overload exception handling because they make more errors."],
    v: "Replay a recorded peak day at 1.5 times volume in a staging copy and confirm scan response times, pick rates and queue depths stay within limits, and note which component hit its limit first.",
    dep: ["transactional-store","inventory-locking","message-queue","device-connectivity"]
  },
  "degraded-and-offline-operation": {
    s: "How work continues when the network, a server, a device or a machine fails, and how the system catches up and reconciles afterward.",
    d: "Floors cannot stop for an outage. Options include local caching on devices, a local server per site, paper fallbacks, and manual modes for automation. Each has a cost in complexity and in the risk of conflicting updates when the connection returns. Decisions include which functions work offline, how long they may, and how conflicts are resolved. Most outages are short, and the design should make them boring.",
    k: ["Site-local server vs central service only: local keeps the floor working through WAN loss and adds sync work, central is simple and stops with the link.", "Devices that queue work offline vs devices that stop: queuing keeps flowing and risks conflicting changes, stopping is safe and idles workers."],
    p: ["Offline scans replayed in the wrong order after reconnect produce negative balances.", "A fallback procedure that has never been rehearsed fails during the real outage."],
    v: "Cut the site's network link for 30 minutes during a controlled shift: defined functions continue, queued work posts without duplicates on reconnect, and a post-outage count shows no unexplained variance.",
    dep: ["device-connectivity","manual-fallback","message-queue","multi-site-tenancy"]
  },
});
