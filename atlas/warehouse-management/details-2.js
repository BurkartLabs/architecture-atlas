// Details for the warehouse management plate, part 2: order release and waves, receiving and putaway.
ATLAS.details("warehouse-management", {
  "order-intake": {
    s: "Accepts orders from every source, normalizes them into one internal order with lines, ship-to, service level and deadlines, and stores them ready for allocation.",
    d: "Orders arrive from hosts, storefronts, and manual entry. Intake maps item identifiers, units of measure, addresses and shipping methods to the internal model, assigns a priority and a ship-by time, and stores header and lines. It rejects or flags malformed orders and handles updates and cancellations to orders not yet released. The hard part is that order meaning varies: the same field can mean requested or promised date, and updates may arrive after release, when changing the order means undoing work on the floor.",
    k: ["Accept orders with problems and hold them vs reject at the door: holding keeps them visible for repair, rejecting pushes the fix back to the sender but loses context.", "Immutable order lines after release vs editable with change tracking: immutability is simple, editing satisfies customers but must unwind allocations and tasks."],
    p: ["Orders with unmapped items silently wait forever because nothing reports them as stuck.", "A late address change after label generation ships the parcel to the old address."],
    v: "Submit orders with a valid item, an unknown item and a past ship-by date: the first is accepted with a priority, the others appear in the hold list with a clear reason.",
    dep: ["host-order-interface","item-master","transactional-store"]
  },
  "order-validation-and-holds": {
    s: "Checks each order against rules such as credit status, address validity and item restrictions, and places holds that keep it from releasing until cleared.",
    d: "Validation runs on intake and again before release. Rules are configured per owner and include address checks, restricted-item or destination limits, payment or credit flags from the host, and required documents. A failed rule sets a hold with a reason code and owner; clearing the hold returns the order to the flow. Holds are visible in the exception queue. It is hard because holds multiply, and stacked holds with different owners need clear rules about what releases when.",
    k: ["Validate at intake only vs re-validate before release: single check is cheap, rechecking catches changes such as a credit hold added in the meantime.", "Hold reasons as a fixed list vs free text: a fixed list supports routing and reporting, free text captures odd cases but cannot be acted on automatically."],
    p: ["A hold with no assigned owner never clears and the order silently misses its date.", "Clearing one of two holds releases the order early because only the latest hold was checked."],
    v: "Place two holds on one order, clear one and confirm the order stays unreleased; clear the second and confirm it enters allocation without manual status edits.",
    dep: ["configuration-rules","exception-queue","order-intake"]
  },
  "inventory-allocation": {
    s: "Reserves specific stock for each order line according to rules such as oldest first, expiry first, nearest location and customer-specific restrictions.",
    d: "Allocation searches the ledger for eligible stock by item, owner, status, lot and shelf life, picks quantities by a configured sequence, and writes reservations against particular locations or containers. Soft allocation reserves quantity only; hard allocation binds to a location and creates pick tasks. It must be atomic against concurrent allocations, since two orders cannot take the same units. It is difficult because rules conflict and stock is scarce: shortages force decisions about which order is served and whether partial shipment is allowed.",
    k: ["Allocate at release time vs at order entry: later allocation uses fresher stock and fewer cancellations to unwind; earlier allocation promises stock sooner but fragments it.", "Bind to locations immediately vs allocate quantity and choose a location at pick time: binding makes tasks efficient, late binding survives movement and count changes."],
    p: ["Concurrent allocations without row-level locks reserve the same units twice, and one order is short at the shelf.", "A strict first-expiry rule empties a deep reserve location slowly and leaves broken cases scattered."],
    v: "Fire two orders for the last 10 units simultaneously: exactly one is allocated, the other is short, and available quantity in the ledger never goes negative.",
    dep: ["inventory-ledger","inventory-locking","configuration-rules","inventory-status-model"]
  },
  "release-rules": {
    s: "The configured conditions that decide when an allocated order is released to the floor: priority, carrier cutoff, destination, capacity and readiness.",
    d: "Each owner or site defines criteria with sorting keys, filters and limits: release by carrier cutoff, by customer tier, by zone workload, or when a full truck's worth is ready. The engine evaluates allocated orders, selects those that satisfy the rules and hands them to wave planning or streaming. It is hard because rules must be understandable and testable: a mistaken priority rule can starve low-priority orders for days or flood the floor with more work than can be done.",
    k: ["Rules as data edited by planners vs rules in code: data lets operations tune without a release, but unchecked edits can break the flow.", "Release by deadline vs release by capacity: deadline protects service, capacity protects efficiency; a mix needs an explicit precedence."],
    p: ["Low-priority orders starve behind a constant stream of urgent ones.", "A rule edit made mid-shift releases the whole backlog at once and overloads the floor."],
    v: "Load a rule release by cutoff and capacity: with 500 eligible orders and capacity for 200, confirm the earliest-cutoff 200 are released and the rest stay waiting with a reason.",
    dep: ["configuration-rules","inventory-allocation","order-validation-and-holds"]
  },
  "wave-planning": {
    s: "Groups released orders into waves, timed batches that are released to the floor together to balance workload across areas and meet carrier cutoffs.",
    d: "A wave collects orders by criteria such as carrier, route, zone or time and generates pick tasks all at once. Planners see forecast workload by area and adjust the wave size. Waves make work predictable and let packing and loading be timed. They also create peaks, and tasks sit unfinished at the wave's end. It is hard because the best wave size depends on labor, packing capacity and sorter throughput at that moment, and a wave that starts too late cannot be recovered.",
    k: ["Large scheduled waves vs small frequent waves: large waves optimize batching and travel, small waves reduce idle time and respond faster to changes.", "Manual wave building by planners vs automatic by rules: manual uses judgment about today's conditions, automatic is consistent and faster."],
    p: ["A wave released with insufficient pack capacity piles picked goods in staging and delays the cutoff anyway.", "Wave completion waits on a few stuck lines that block downstream release."],
    v: "Build a wave for a carrier cutoff and confirm that its estimated work hours match labor available per area, that all selected orders get tasks, and that the last pick finishes before the packing deadline in a timed run.",
    dep: ["release-rules","task-generation","labor-forecasting"]
  },
  "continuous-order-streaming": {
    s: "Releases orders to the floor one by one or in small groups as capacity frees up, instead of in fixed waves.",
    d: "A release loop watches queue depth in each area and pulls the next eligible orders when workload falls below a threshold, so pickers rarely wait and nothing sits unfinished. Orders can be grouped on the fly by zone or carrier. This suits e-commerce with constant arrivals and tight cutoffs. It is hard because there is no natural end point to sync packing and loading, so staging and truck load need their own timing, and the loop must adapt to changing speeds without oscillating.",
    k: ["Pull-based release by queue depth vs push waves: pull keeps work flowing and shortens cycle times, but lacks the natural batching of a wave.", "Short look-ahead of a few minutes vs long: short is reactive but may miss grouping opportunities; long finds batches but delays urgent orders."],
    p: ["A threshold set too low lets pickers run dry between releases; too high rebuilds the backlog it was meant to remove.", "Orders for the same truck trickle out over hours and make load building hard."],
    v: "Feed a steady stream of orders and confirm queue depth in each area stays within the configured band and that no picker is idle for more than the stated seconds during the run.",
    dep: ["release-rules","task-generation","task-engine"]
  },
  "order-grouping": {
    s: "Combines orders that can share work, such as the same destination or the same items, or consolidates lines picked in different areas into one shipment.",
    d: "Grouping happens at release or later. Release groups bring orders with overlapping items together for batch picking, or orders for the same customer into one parcel to save freight. Consolidation tracks partial lines picked in different zones and holds them until the order is complete. The system keeps the mapping from picks to orders so goods can be divided later. It is hard because grouping creates dependencies: a group is only complete when every member is, and one shortage can block everything.",
    k: ["Ship complete vs ship partial as ready: complete saves freight and customer confusion, partial improves speed but multiplies parcels.", "Group at release vs regroup at sort: early grouping reduces travel, late grouping adapts to what was actually picked but needs a sort step."],
    p: ["An order waiting for a single missing line blocks a whole consolidation position.", "Groups bigger than the sorter's slots force splits that make the savings disappear."],
    v: "Release three orders for one customer picked in two zones and confirm they converge at one consolidation position, and one parcel is created only when all lines have arrived.",
    dep: ["wave-planning","sortation","shipping-staging"]
  },
  "backorder-handling": {
    s: "Handles lines that cannot be fully allocated: records the shortage, applies partial-shipment rules, and re-allocates when stock arrives.",
    d: "When allocation finds insufficient stock, rules choose between holding the whole order, shipping what exists, or cancelling the short quantity. The shortage is stored as a backorder with a priority and linked to the original order; incoming receipts trigger re-allocation in order of priority. Hosts are informed so customers can be told. It is hard because backorders compete with new orders for new stock, and a fair policy must be defined: oldest first, highest priority first, or by customer terms.",
    k: ["Backorders get first claim on new stock vs compete with new orders: first claim honors earlier promises, competition may serve higher-value orders.", "Auto-ship partial vs wait for the full order: partial speeds delivery and raises freight cost."],
    p: ["New stock allocated to fresh orders leaves old backorders waiting indefinitely.", "Backorders not reported to the host leave customers believing the order shipped complete."],
    v: "Short an order by 5 units, receive 10 units and confirm the backorder allocates before newer orders, ships the missing 5 and the host receives a shortage notice and a later fill confirmation.",
    dep: ["inventory-allocation","receipt-against-asn","host-order-interface"]
  },
  "load-and-route-planning": {
    s: "Assigns shipments to trucks and routes, sets load sequence and checks weight and volume limits, so outbound pallets are built in the order they will be delivered.",
    d: "For pallet and truckload freight, planning groups shipments by destination, checks capacity, orders stops, and produces a load plan used by staging and loading. It may connect with a transport system or rely on carrier-supplied routes. The output sets loading order, so last stop is loaded first. It is hard because late orders change the plan, weight limits and mixed stackability add constraints, and pallets built before the plan settles must be rebuilt.",
    k: ["Plan loads before picking vs after packing: before lets pallets be built by destination from the start, after uses real weights and cubes but gives little time.", "Optimize for fewest trucks vs for service: fewer trucks save cost, but may delay orders until a truck fills."],
    p: ["Planning on item master weights that are wrong produces overweight trucks found at the scale.", "A late high-priority order forces unloading a built pallet to change the stop sequence."],
    v: "Plan a load of 24 pallets over 4 stops and confirm total weight is under the truck limit and that physical loading in the planned sequence puts stop 4 pallets on first.",
    dep: ["order-grouping","shipping-staging","load-building"]
  },
  "dock-appointments": {
    s: "Schedules inbound and outbound truck arrivals into dock doors and time slots, so labor and doors are available when carriers arrive.",
    d: "Carriers or planners book slots by door, time and load type. The scheduler enforces door capacity, equipment suitability such as refrigerated or lift-gate, and labor availability, and tracks arrival, check-in and departure. Check-in assigns a door and triggers receiving or loading work. It is hard because trucks arrive early or late, loads take longer than predicted, and a missed slot cascades through the day, so the schedule must be adjusted in real time.",
    k: ["Fixed-length slots vs slots by expected unload time: fixed is simple, load-based reflects reality and needs good estimates.", "Strict appointment enforcement vs allow unscheduled arrivals: strict smooths labor but turns away trucks and pushes delay to carriers."],
    p: ["Overbooked doors create a line of trucks and detention charges from carriers.", "Appointments not linked to expected receipts leave the dock team with no inbound plan."],
    v: "Book a 2-hour slot at door 5, check in the truck 30 minutes late and confirm the door is assigned, the following slot is flagged, and the linked ASN opens as the receiving work.",
    dep: ["yard-management","advance-ship-notices","labor-forecasting"]
  },
  "yard-management": {
    s: "Tracks trailers and containers on the lot: where they are parked, whether loaded or empty, and which door they should go to next.",
    d: "Gate check-in records trailer identity, carrier, seal and contents; the system assigns parking spots, and directs yard drivers to move trailers to doors when they are ready. It tracks dwell time and equipment pools. This is optional for small sites and critical for large ones where hundreds of trailers wait. The difficulty is physical truth: a trailer in the wrong spot is invisible to the system, and data entered by gate staff and drivers often lags reality.",
    k: ["Manual location entry by gate staff vs automatic tracking by reads at gates and tags: manual is cheap but error-prone, automatic is accurate and costs hardware.", "Yard moves dispatched by system vs by driver judgment: dispatch reduces idle time but needs accurate door readiness."],
    p: ["A trailer recorded in the wrong spot is lost for hours when its door is ready.", "Detention starts silently because dwell time is not tracked against free time."],
    v: "Check in a trailer, park it in a spot and confirm a search by trailer number returns that spot, then dispatch it to a door and verify dwell time stops accruing on arrival.",
    dep: ["dock-appointments","device-connectivity","transactional-store"]
  },
  "receipt-against-asn": {
    s: "Receives goods by scanning containers or items and matching them to an expected notice, recording quantities, lots and condition.",
    d: "Receivers scan the container or item, and the system finds the matching line on the notice or purchase order, prompts for quantity, lot, expiry and condition, and posts a receipt to the ledger in a receiving status. Overage, shortage and unexpected items are flagged at once. Receipt can be per container, per pallet or per item depending on how much the supplier labeling can be trusted. The difficulty is speed against accuracy at the dock, where trucks are waiting.",
    k: ["Receive at pallet level vs item level: pallet is fast and relies on supplier labels, item level is accurate and slow.", "Receive directly to available vs to a staging status pending checks: direct speeds availability, staging protects against bad stock but delays sales."],
    p: ["Receiving to the wrong purchase order line leaves one line over-received and another apparently missing.", "Accepting a supplier's quantities without count makes shortages impossible to claim later."],
    v: "Receive a notice for 100 units by scanning 10 cartons of 10: ledger shows 100 in receiving status linked to the notice, and scanning an eleventh carton raises an over-receipt exception.",
    dep: ["advance-ship-notices","inventory-ledger","license-plating","receipt-discrepancies"]
  },
  "blind-receiving": {
    s: "Receives goods with no prior notice or against an unconfirmed document, by identifying and counting what is physically on the dock.",
    d: "Used when no notice exists or the notice cannot be trusted, receivers scan items, enter counts and lots, and the system creates the receipt from what was found. It then tries to match it to an open purchase order, or leaves it for review. Items without barcodes or unknown items need a creation or lookup step. It is hard because there is nothing to check against: the system relies on the receiver's count, and unplanned goods have no designated location or owner.",
    k: ["Allow blind receipt vs require a notice: allowing handles reality but sacrifices matching; requiring improves control but leaves goods stranded on the dock.", "Count twice by two people vs once: double count catches errors at a doubled labor cost, used for high-value goods only."],
    p: ["Goods received blind and never matched are inventory with no owner and no invoice.", "Unknown items created on the fly pollute the item master with duplicates."],
    v: "Receive a pallet with no notice: the system creates a receipt, flags it unmatched, and after a purchase order is linked the receipt reconciles with correct owner and cost.",
    dep: ["inventory-ledger","item-master","license-plating"]
  },
  "receiving-inspection": {
    s: "Checks received goods for damage, quantity, expiry and quality against sampling or full-inspection rules before they become available.",
    d: "Rules by item, supplier or lot decide whether and how a receipt is inspected: visual check, sample, measurement, or lab test. Inspection results move stock from a quarantine status to available, or to rejected, and capture photos and notes for supplier claims. Regulated goods may require documented release. It is hard because inspection stalls the dock and delays availability, so rules should apply scrutiny only where risk is high.",
    k: ["Inspect everything vs sample by supplier history: full inspection catches more at high labor cost, sampling trusts a good record.", "Quarantine stock until inspected vs make available at once and recall later: quarantine is safe and slow, immediate speeds sales but can ship defects."],
    p: ["Quarantined stock released by mistake ships goods that failed inspection.", "No photos are captured, so a supplier claim for transit damage is rejected."],
    v: "Receive a lot flagged for inspection and confirm it cannot be allocated until a pass result is entered, and that a fail moves it to rejected with the photos attached to the receipt.",
    dep: ["inventory-status-model","receipt-against-asn","lot-serial-expiry"]
  },
  "license-plating": {
    s: "Gives every pallet, carton or tote a unique barcode identifier, the license plate, so the system tracks the container and everything in it by a single scan.",
    d: "A license plate number identifies a physical container, and the system records its contents, status and location. Moving the container moves its contents in one transaction. Plates are printed at receiving or generated by suppliers, and are the unit of putaway and inventory. Nested plates, such as cartons on a pallet, extend the model. It is hard because physical and system truth must stay linked: breaking down a pallet, mixing, or consolidating must update the plates or contents drift.",
    k: ["Track by container plate vs by item and location only: plates make moves fast and traceable, item-and-location is simpler but needs a scan per unit.", "Supplier-assigned plates vs warehouse-assigned: supplier plates save labeling but may collide or be unreliable."],
    p: ["Items taken from a pallet without updating its plate leave a plate whose contents no longer match.", "Reused plate numbers make history ambiguous."],
    v: "Receive a pallet under one plate, break two cartons out onto a new plate and confirm contents totals per plate are correct and the combined quantity at the original location is unchanged.",
    dep: ["inventory-ledger","print-management","location-master"]
  },
  "directed-putaway": {
    s: "Chooses a storage location for received goods using rules about item, size, velocity, zone, capacity and compatibility, and directs the worker to it.",
    d: "Rules rank candidate locations: forward pick locations first if they need stock, then reserve locations by cube fit, nearest to the dock, matching temperature or hazard class, or consolidating with the same item. The system reserves capacity and creates a putaway task; the worker scans the container and the location. If the location is full or blocked, the worker overrides with a reason. It is hard because it must be quick, and good rules need correct capacity and item dimension data.",
    k: ["System-directed locations vs worker-chosen: directed gives organized storage and fast picking, worker-chosen is faster to start but scatters stock.", "Reserve capacity at task creation vs at scan: early reservation prevents collisions, late is more flexible but sends two workers to one slot."],
    p: ["Wrong item dimensions send pallets to slots they do not fit and tasks are overridden.", "Stock put away to a location with the wrong zone type cannot be found by its picking logic."],
    v: "Put away 20 pallets with mixed sizes: every scan lands in a location with enough free capacity, no location exceeds its limit, and the ledger location of each plate matches the physical shelf label.",
    dep: ["location-capacity-rules","license-plating","task-engine","inventory-ledger"]
  },
  "cross-docking": {
    s: "Moves received goods directly to outbound staging for waiting orders, skipping storage entirely.",
    d: "On receipt, the system checks open orders or planned transfers that need the item and, if one matches, creates a task to move the goods straight to the outbound dock or sorter. Planned cross-docking uses an advance match of supplier lines to customers; opportunistic uses current unfilled demand. It saves handling and storage time. It is hard because it needs inbound and outbound to line up in time, and an order that is cancelled mid-flight leaves goods in a staging lane with no owner.",
    k: ["Planned matching in advance vs opportunistic at receipt: planned is predictable and needs reliable supplier data, opportunistic uses whatever arrives but is less predictable.", "Skip the ledger and treat as pass-through vs record a full receipt: skipping is fast, recording keeps traceability and costs a few more scans."],
    p: ["Goods staged for an order that is cancelled sit unnoticed in a lane.", "Mismatched timing means crossed goods wait for the outbound truck and block the door."],
    v: "Receive an item with an open order awaiting it: the receipt triggers a move to the outbound lane, the order's allocation reflects it, and the item never appears in a storage location.",
    dep: ["receipt-against-asn","inventory-allocation","shipping-staging"]
  },
  "receipt-discrepancies": {
    s: "Detects and records differences between what was expected and what was received: shortages, overages, damage and wrong items, and drives the resolution.",
    d: "On each receipt the system compares scanned quantities and items to the notice, flags variances against tolerance rules, and opens a discrepancy with evidence such as photos and counts. Resolution paths include accept, return, claim, or reconcile with the purchase order. The record goes to purchasing and the supplier. It is hard because tolerance and responsibility vary by supplier contract, and the evidence has to be captured at the dock, when the truck is still there.",
    k: ["Accept within a tolerance percentage vs strict counts: tolerance saves effort on low-value goods, strict suits expensive or regulated items.", "Resolve on the spot vs after review: on the spot clears the dock, review gives accurate claims but leaves stock in limbo."],
    p: ["A discrepancy raised after the driver left cannot be disputed.", "Overages accepted silently inflate inventory the business never paid for."],
    v: "Receive 95 of 100 units with a tolerance of 2 percent: a discrepancy is created with expected, actual and difference, routed to purchasing, and the host is told of the shortage.",
    dep: ["receipt-against-asn","exception-queue","host-order-interface"]
  },
});
