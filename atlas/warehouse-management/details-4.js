// Details for the warehouse management plate, part 4: inventory tracking, locations and slotting, labor management.
ATLAS.details("warehouse-management", {
  "inventory-ledger": {
    s: "The record of what stock exists, by item, quantity, location, container, lot and status, changed only by logged transactions.",
    d: "Balances are kept per item and location or container, and every receipt, move, pick, adjustment and shipment writes a transaction with who, when, why and the before and after quantities. Balances can be derived from the transactions or kept as running totals alongside them. Every function reads the ledger to decide what can be promised or picked. It is hard because it must be exact under heavy concurrency, and because physical reality drifts from it through errors the system never sees.",
    k: ["Balances maintained alongside transactions vs derived by summing: stored balances read fast and can drift; derived are always consistent and costly to read.", "Single global ledger vs per-site ledgers: global gives one view, per-site isolates load and failures."],
    p: ["Updating balances without writing the transaction row leaves quantities no one can explain.", "Negative balances allowed for speed hide errors until a count."],
    v: "Replay all transactions for one item from a known start and confirm the sum equals the current balance at every location, and that no balance is negative.",
    dep: ["transactional-store","inventory-locking","audit-trail"]
  },
  "inventory-status-model": {
    s: "The set of states stock can be in, such as available, allocated, quarantined, damaged or in transit, and the rules for which functions may touch which.",
    d: "Each unit or container carries a status that determines whether it can be allocated, picked, counted or shipped. Transitions are allowed only along defined paths, such as received to inspected to available, and each transition is logged with a reason. Holds layer on top for customer, lot or regulatory reasons. It is hard because statuses multiply with business needs, and every function that reads stock must apply the same meaning of available.",
    k: ["Status as a field on the stock record vs separate locations per status: a field is flexible and easy to miss in a query; separate locations make state physical and visible.", "Few coarse states vs many fine ones: coarse is simple, fine states give control and complicate every query."],
    p: ["A query that forgets to filter by status allocates quarantined stock.", "Holds applied directly to stock without a reason code never get released."],
    v: "Put a lot on hold and confirm allocation, picking and the availability feed all exclude it, then release the hold and confirm all three include it again.",
    dep: ["inventory-ledger","configuration-rules","audit-trail"]
  },
  "lot-serial-expiry": {
    s: "Tracks batch identifiers, individual serial numbers and expiry dates so stock can be traced, rotated and recalled.",
    d: "Items flagged as lot-controlled or serial-controlled require capture of the number at receipt, and carry it through every movement to shipment. Expiry dates drive allocation order (first expiring first out) and shelf-life limits for customers. Trace queries answer which customers received a lot. It is hard because capture adds a scan at every step, data entry errors break traceability, and mixing lots in a location needs a rule.",
    k: ["Track at lot level vs individual serial: lot is cheap and groups, serial gives exact history and requires scanning every unit.", "Allow mixed lots in one location vs one lot per location: mixing saves space and complicates picking by expiry."],
    p: ["A mistyped lot number makes a recall miss part of the affected stock.", "Expiry captured at case level while pieces are repacked loses the date."],
    v: "Receive 3 lots, ship across them, and run a trace for one lot: the query lists every location, shipment and customer that handled it, and the totals reconcile.",
    dep: ["inventory-ledger","item-master","receipt-against-asn"]
  },
  "adjustments-reason-codes": {
    s: "The controlled way to correct inventory: a transaction with a reason code, approval for large changes, and a visible record of who changed what.",
    d: "Adjustments add or remove quantity, change status or move stock without a physical task. Each has a reason such as damage, count correction, theft or found stock, and is routed for approval above a value or quantity limit. They post to the ledger and can feed financial write-offs in the host. It is hard because adjustments are the main way errors enter the ledger, and reason codes are only useful if people choose them honestly and consistently.",
    k: ["Approval above a threshold vs allow all with review later: approval prevents abuse and slows legitimate corrections, review is fast and finds problems late.", "Many specific reason codes vs a few broad ones: specific supports analysis, broad is easier to pick correctly."],
    p: ["A generic reason like other hides patterns of loss.", "Adjustments applied directly in the database skip approvals and audit."],
    v: "Attempt an adjustment over the approval limit: it stays pending, the ledger is unchanged until approved, and the approved change shows reason, user and approver in the audit trail.",
    dep: ["inventory-ledger","access-control","audit-trail"]
  },
  "cycle-counting": {
    s: "Counts a few locations every day instead of closing for a full stocktake, choosing locations by risk, activity and time since last count.",
    d: "The planner selects counts by rules: items by value or velocity, locations after a short pick, zero-balance locations, or time since last count. Counters scan the location and enter what they find, ideally blind, without seeing the system quantity. Variances beyond a tolerance trigger a recount and review. It is hard because counting moving stock needs care, since a pick during a count creates false variances, and because counters must be assigned work that does not collide with the pick flow.",
    k: ["Blind counts vs showing the system quantity: blind finds real errors and costs extra recounts, showing is fast and invites confirming the wrong number.", "Count by risk-based selection vs fixed calendar: risk-based finds problems sooner, calendar is simple and predictable."],
    p: ["Counting a location while it is being picked produces variances that are not real.", "Recounts skipped for small variances let systematic errors accumulate."],
    v: "Plant a 2-unit error in a location and run its count: the blind count reports the difference, a recount confirms it, and the adjustment appears with the counter and reason.",
    dep: ["inventory-ledger","task-engine","count-variance-review"]
  },
  "count-variance-review": {
    s: "Looks at counting differences, decides which are real, finds root causes, and approves the adjustment.",
    d: "Variances over tolerance are held for review with the location's recent history: moves, picks, receipts, and prior counts. A reviewer checks for timing issues, misplaced stock in neighboring locations, or unit-of-measure mistakes before approving. Results feed accuracy metrics. It is hard because the cause is often invisible, and because adjusting quickly makes numbers clean while hiding the process failure behind them.",
    k: ["Approve small variances automatically vs review all: automatic saves effort and lets small drift go, review all finds causes at higher cost.", "Adjust now vs investigate first: adjusting keeps allocation correct, investigating preserves evidence."],
    p: ["Approving variances in bulk to clean up the report teaches the floor that errors do not matter.", "No history shown to the reviewer, so every variance looks like a mystery."],
    v: "Create a variance caused by a mislocated pallet: the review screen shows the neighboring location's matching surplus and one linked correction fixes both without a write-off.",
    dep: ["cycle-counting","adjustments-reason-codes","inventory-ledger"]
  },
  "inventory-reconciliation": {
    s: "Periodically compares the warehouse's stock to the host's record, explaining differences and agreeing a single set of numbers.",
    d: "At regular intervals the system sends balances by item and status to the host and compares the host's view. Differences are listed with transactions in flight, such as shipped but not confirmed, and reviewed. It catches lost messages and mismatched units. It is hard because both sides are moving, so a snapshot must be taken at a consistent moment, and explanations of the differences need to be mechanical rather than manual.",
    k: ["Compare full snapshots vs net changes since last match: snapshots catch everything and are heavy, net changes are light and miss drift.", "Warehouse is the source of truth vs host is: warehouse truth reflects the physical, host truth keeps the books consistent."],
    p: ["A snapshot taken mid-batch shows large differences that disappear an hour later.", "Differences explained away repeatedly without fixing the lost-message cause."],
    v: "Drop one ship-confirmation message in a test, run reconciliation and confirm the difference lists that shipment as the cause and clears when the message is resent.",
    dep: ["inventory-ledger","host-order-interface","event-outbox"]
  },
  "multi-owner-inventory": {
    s: "Keeps stock of several owners, such as clients of a third-party logistics provider, separate in the same building, with their own rules and billing.",
    d: "Every ledger row and order carries an owner. Rules, item masters, cutoffs, labeling and service levels can differ per owner, and stock cannot cross owners. Storage and handling activities are metered for billing. It is hard because the building is shared, so slotting and labor serve many owners at once, while data and reports stay strictly separate, and any leak is a contract problem.",
    k: ["Owner as a key on every table vs separate databases per owner: keys are efficient and a missed filter leaks data; separate databases isolate strongly and multiply operations.", "Shared locations across owners vs dedicated zones: sharing uses space well and complicates counting and billing."],
    p: ["A query without an owner filter shows one client's stock to another.", "Billing activities recorded without the owner cannot be charged."],
    v: "Create the same item for two owners with different stock and confirm allocation, reports and the feed for one never include the other, and billing events carry the correct owner.",
    dep: ["multi-site-tenancy","inventory-ledger","access-control"]
  },
  "location-master": {
    s: "The registry of every storage place in the building with its address, type, dimensions, coordinates, status and rules.",
    d: "Each location has an identifier following the aisle, bay, level and position pattern, a type such as pallet rack, shelf, floor or dock door, a size and weight limit, and coordinates used for routing. Locations can be blocked, empty, or reserved. It is the base for putaway, picking and counting. It is hard because it must match the physical building exactly, changes with layout changes, and the labels on shelves have to match the data, or every function is wrong.",
    k: ["Structured address scheme vs opaque identifiers: structured helps people and routing, opaque survives layout changes.", "Model every pick face as a location vs model aisles only: every face gives accuracy and large volume of data."],
    p: ["A location renamed in the system but not on the shelf sends workers to the wrong place.", "Blocked locations still receiving putaway tasks."],
    v: "Walk one aisle scanning each location label and confirm every scan resolves to the expected address, type and coordinates, with no unknown labels and no system locations without labels.",
    dep: ["zone-structure","transactional-store","location-labeling"]
  },
  "zone-structure": {
    s: "Groups locations into zones and areas, such as reserve, forward pick, cold, hazardous or packing, to which rules and workers are attached.",
    d: "A hierarchy of site, building, area, zone and aisle gives meaning to locations. Rules attach at each level: which items are stored where, which equipment can enter, which workers are assigned, and what temperature is kept. Zones also define picking regions and replenishment paths. It is hard because zone boundaries influence labor balance and travel, and changing them touches slotting, picking, putaway and reports at once.",
    k: ["Zones by physical layout vs by item characteristics: physical simplifies travel, characteristics enforce storage requirements.", "A single hierarchy vs multiple overlapping groupings: single is simple, overlapping serves different uses and complicates rules."],
    p: ["A hazardous item put in a general zone because the zone rule was missing.", "Zone changes made mid-day leave tasks pointing to the old structure."],
    v: "Move an aisle into a new zone and confirm putaway, picking region and labor assignment for items in it follow the new zone while historical transactions keep their original zone.",
    dep: ["location-master","configuration-rules"]
  },
  "location-capacity-rules": {
    s: "Rules for how much and what a location can hold: volume, weight, container count, mixing of items or lots and compatibility.",
    d: "Capacity is defined by units, cube or weight and checked at putaway and replenishment. Mixing rules prohibit combining incompatible items such as chemicals, or different lots in one slot. The system tracks used capacity as stock moves. It is hard because capacity is only as good as item dimensions, and because physical capacity is fuzzy: pallets are stacked unevenly and nominal capacity is not reached or is exceeded.",
    k: ["Capacity by cube calculation vs by count of containers: cube uses space well and depends on dimension data, count is simple and wastes space.", "Strict enforcement vs warning only: strict avoids overflow and halts work, warning keeps flow and accepts messiness."],
    p: ["Capacity counted before a putaway is completed double-books slots.", "Item master cubes in the wrong unit make every location look empty."],
    v: "Attempt putaway of 3 pallets into a 2-pallet location: the third is directed elsewhere, used capacity is 2 of 2, and removing one pallet frees one space immediately.",
    dep: ["location-master","item-master","dimension-capture"]
  },
  "item-master": {
    s: "The catalog of products with identifiers, descriptions, units of measure, dimensions, weights, handling attributes and storage requirements.",
    d: "Each item has barcodes at each pack level (each, inner, case, pallet), conversion factors between them, dimensions and weight, tracking requirements such as lot or serial, hazard class, and shelf life. Every function reads it: allocation, cartonization, putaway, shipping. It usually syncs from the host. It is hard because wrong data fails everywhere: a case quantity mistake multiplies through receiving, picking and billing.",
    k: ["Host owns the item master vs warehouse maintains its own attributes: host ownership avoids duplicates, local attributes capture dimensions and handling the host does not know.", "Barcodes unique per item vs reused across pack levels: unique is safe, reused saves labels and needs explicit level selection at scan."],
    p: ["A case size changed at the supplier without updating conversions makes receipts wrong.", "Duplicate barcodes on two items cause the wrong item to be picked."],
    v: "Scan the case and each barcode of an item: each resolves to the same item with the correct quantity per level, and a barcode shared by two items is rejected on entry.",
    dep: ["master-data-cache","transactional-store","dimension-capture"]
  },
  "dimension-capture": {
    s: "Measures the real size and weight of items and cases, usually at receiving, and corrects the item master.",
    d: "A measuring station with a scale and dimensioner records length, width, height and weight, and often an image, compared against the master. Differences update the master or raise a review. Accurate data makes cartonization, putaway capacity and freight cost trustworthy. It is hard because hand-entered data is unreliable and measuring each item costs time, so many sites measure only new items or samples.",
    k: ["Measure every new item vs trust supplier data: measuring costs labor and yields reliable data, trusting is cheap and propagates errors.", "Automatic update of the master vs approved review: automatic keeps data fresh and lets a bad measurement overwrite good data."],
    p: ["A single mismeasured sample overwrites a correct master value.", "Measurements in inconsistent units mix inches and centimeters."],
    v: "Measure ten new items and confirm each master dimension now equals the measured value within the stated tolerance, and that a measurement 50 percent off is held for review rather than saved.",
    dep: ["item-master","device-connectivity","receipt-against-asn"]
  },
  "slotting-analysis": {
    s: "Analyzes item velocity, size and affinity to propose which items belong in which locations so that fast movers sit close and pick efficiently.",
    d: "The analysis uses order history to rank items by pick frequency and units, and by cube and weight. It proposes assignments of items to pick-face types and zones: fast, heavy items at waist height near the dock, slow items high or far, items often ordered together nearby. It simulates travel for alternatives. It is hard because demand changes with season and promotions, and a good plan has a cost, since every move is labor.",
    k: ["Rank by pick frequency vs by units moved: frequency lowers visits to the aisle, units moved reduces replenishment.", "Re-slot continuously vs seasonally: continuous adapts and costs constant moves, seasonal is stable and lags demand."],
    p: ["Slotting on last year's demand puts this season's best sellers in the back.", "A plan ignoring item cube proposes slots too small, and replenishment explodes."],
    v: "Run the analysis on 12 months of orders and replay a sample week on both layouts: the proposed layout must have measurably lower total travel distance.",
    dep: ["location-master","item-master","reporting-and-kpis"]
  },
  "slot-move-generation": {
    s: "Converts a slotting plan into move tasks that carry stock from old to new locations with minimal disruption to picking.",
    d: "The generator compares current and target locations, sequences moves so that targets are free when needed, groups moves by area and schedules them in quiet periods. Each move is a normal inventory transaction, so counts and allocations stay correct. It is hard because a move in progress leaves stock in transit, picks in flight use old locations, and swaps need temporary space.",
    k: ["Move during live operation vs in a maintenance window: live avoids downtime and risks collisions with picks, a window is safe and costs a pause.", "Move all at once vs phased by value: all at once finishes quickly, phased limits disruption and delays the benefit."],
    p: ["Moving stock without updating allocations strands tasks pointing at the old location.", "A swap with no temporary space deadlocks in the middle."],
    v: "Execute a plan swapping two items between locations while picks continue: every pick during the move succeeds from the right location, and final ledger locations match the plan.",
    dep: ["slotting-analysis","task-engine","inventory-ledger"]
  },
  "location-labeling": {
    s: "Produces and maintains the physical labels on racks, shelves and floors that let workers and scanners identify a location.",
    d: "Labels carry a barcode and readable address, sized and positioned for scanning from the aisle or from a lift truck. They are printed from the location master in batches, and updated when the layout changes. Check digits can help voice systems. It is hard because labels wear and fall off, and the physical task of keeping them current across thousands of locations lags every layout change.",
    k: ["Label every location vs only pick faces: all gives complete scan confirmation, pick faces only is cheaper and leaves reserve unscanned.", "Large high-contrast labels vs compact ones: large scan reliably from a truck, compact fit on small shelves."],
    p: ["Labels printed before a relayout are applied to the wrong racks.", "Faded labels cause misreads that workers bypass by typing."],
    v: "Scan every label in a sample aisle from the normal working position, and confirm no label fails to read in three attempts and all match the master.",
    dep: ["location-master","print-management"]
  },
  "labor-standards": {
    s: "Engineered time allowances for tasks, such as walking, reaching, scanning and picking, used to set targets and judge performance.",
    d: "Standards break work into elements with times by distance, weight, height and quantity, and compute an expected time for each task. They may come from time studies or measured history. The system compares actual to standard and uses the result for staffing and incentive plans. It is hard because standards must be fair and current: a standard that ignores congestion, equipment or layout changes will be disputed and ignored.",
    k: ["Engineered standards vs historical averages: engineered are defensible and expensive to build, averages are cheap and bake in current inefficiency.", "Standards per task type vs per task detail: per type is simple, detailed is fairer to heavy tasks and complex to maintain."],
    p: ["Out-of-date standards after a layout change make good workers look slow.", "Standards that ignore wait time for equipment penalize the wrong people."],
    v: "Time 30 observed picks against the computed standard, and confirm the average ratio is within the agreed band and no task type is consistently above or below it.",
    dep: ["task-time-capture","location-master","task-engine"]
  },
  "task-time-capture": {
    s: "Records when each worker started and finished each task, from scan events, so work can be measured.",
    d: "Every task start and completion has a timestamp and a worker identifier, captured as a side effect of scanning. The system derives durations, gaps between tasks, and idle time. It attributes time to the right activity, direct work, indirect work or waiting. It is hard because scans mark boundaries, not effort: gaps between tasks are ambiguous, shared devices attribute work to the wrong person, and clocks must agree across devices.",
    k: ["Derive time from scan events vs explicit start and stop buttons: scans cost nothing extra but blur gaps, buttons are precise and add taps.", "Assign gaps to the next task vs to an unclassified bucket: assigning is simple and unfair, a bucket is accurate and needs follow-up."],
    p: ["Workers sharing a login produce times that belong to nobody.", "Device clock drift makes tasks appear to overlap."],
    v: "Have a worker perform 10 timed tasks with a stopwatch and compare the recorded durations; they must agree within the scan-interval resolution, and idle gaps must be recorded separately.",
    dep: ["task-engine","handheld-scan-app","device-connectivity"]
  },
  "performance-scoring": {
    s: "Compares actual to standard time for each worker, team and area and reports rates, utilization and trends.",
    d: "The system computes performance as standard time earned divided by time worked, rolls it up by day, shift and area, and shows it to supervisors and, often, workers. It supports coaching, scheduling and, where used, pay. It is hard because a number is only as good as the data under it, and because workers adapt to what is measured: a metric rewarding speed produces shortcuts that cause errors.",
    k: ["Show individual scores vs team scores: individual drives accountability and can encourage speed over quality, team scores encourage cooperation and hide weak performance.", "Include quality in the score vs track it separately: combined resists gaming, separate is simpler to explain."],
    p: ["Ranking workers on pick rate alone leads to rushed picks and more errors.", "Scores shown without context penalize workers given the hardest tasks."],
    v: "Compute the score for one shift by hand from raw tasks and standards, and confirm the system's figure matches, including treatment of indirect time.",
    dep: ["labor-standards","task-time-capture","reporting-and-kpis"]
  },
  "task-assignment": {
    s: "Decides which worker gets which task next, based on priority, skills, equipment, location and workload.",
    d: "Workers log in with their equipment and skills, and the system offers the best next task from the queue: nearest, most urgent, matching certification. Supervisors can reserve or reprioritize work. Assignment may be pull, where workers ask, or push, where the system sends. It is hard because local choices for travel conflict with global priorities for cutoffs, and fairness and safety rules, such as forklift certification, must hold.",
    k: ["Push assignment by system vs pull by worker choice: push balances globally and removes autonomy, pull is flexible and can cherry-pick.", "Strict priority order vs nearest first: priority protects cutoffs, nearest saves travel."],
    p: ["Workers cherry-picking easy tasks leave the hardest ones aging.", "An uncertified worker assigned equipment work breaks a safety rule."],
    v: "Queue tasks of mixed priority and skill with one certified and one uncertified worker; verify each worker receives only eligible tasks and urgent ones are offered before older low-priority ones.",
    dep: ["task-engine","configuration-rules","access-control"]
  },
  "indirect-activity": {
    s: "Records time spent on work that is not a system task, such as cleaning, meetings, training and equipment maintenance.",
    d: "Workers or supervisors log indirect codes through a device or screen, with start and end times. The data completes the picture of paid time and allows true utilization and cost per unit. Codes are limited to keep them meaningful. It is hard because indirect time is easily ignored or mislabeled, and because without it direct work seems artificially efficient.",
    k: ["Log by worker action vs assume by shift schedule: logging is accurate and burdensome, schedules are free and inaccurate.", "Few codes vs detailed: few are quick to use, detailed support analysis and are skipped."],
    p: ["Time not logged as indirect lands in task gaps and lowers performance scores unfairly.", "A catch-all code absorbs most hours."],
    v: "Log 15 minutes of cleaning for one worker and confirm the hours show as indirect in the shift summary and utilization excludes them from direct time.",
    dep: ["task-time-capture","workstation-screens","performance-scoring"]
  },
  "labor-forecasting": {
    s: "Predicts the work to be done and the labor hours needed by area and time from orders, receipts and standards, so staffing can be planned.",
    d: "The forecast takes expected orders and inbound, converts them to task counts and standard hours by area, and compares with scheduled people. It outputs shortfalls and surpluses by shift and suggests overtime, temporary staff or moving workers. Within the day, it drives release pacing. It is hard because order volume is volatile and the conversion to hours rests on standards and mix assumptions that change with promotions.",
    k: ["Forecast from open orders vs from historical patterns: open orders are accurate and short-range, history gives longer lead time and misses events.", "Plan to peak vs to average with flex: peak is safe and expensive, average with flex needs available temporary labor."],
    p: ["Forecast ignoring inbound workload leaves the dock understaffed on the same day.", "A promotion unknown to the planners doubles volume without notice."],
    v: "Compare last month's forecast hours with actual hours worked by area and shift; the error must fall within a stated range and trend over time.",
    dep: ["labor-standards","order-intake","wave-planning"]
  },
  "incentive-reporting": {
    s: "Prepares data on worker output and performance for incentive pay, awards or payroll, with a record of how each figure was made.",
    d: "Rolls up performance and attendance by worker and period using agreed rules, applies caps and quality gates, and exports to payroll. It produces a statement that workers can read and dispute. It is hard because pay makes every error contentious: the rules must be transparent, reproducible and frozen for the period, and corrections after the close need a controlled path.",
    k: ["Pay on individual output vs team: individual rewards effort and can erode cooperation, team output builds cooperation and rewards free riders.", "Compute at period close vs continuously: close is simple and auditable, continuous shows workers progress and complicates corrections."],
    p: ["Calculation rules edited mid-period change figures workers had already seen.", "A missing scan period gives a worker zero credit for a full shift."],
    v: "Recompute one worker's weekly incentive by hand from raw tasks and rules and confirm it matches the exported figure exactly, and that a disputed task can be corrected with a logged adjustment.",
    dep: ["performance-scoring","audit-trail","access-control"]
  },
});
