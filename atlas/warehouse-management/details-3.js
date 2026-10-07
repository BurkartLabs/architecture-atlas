// Details for the warehouse management plate, part 3: picking, packing and shipping, returns.
ATLAS.details("warehouse-management", {
  "task-generation": {
    s: "Turns allocated order lines into pick tasks: from-location, item, quantity and destination container, grouped by the chosen strategy.",
    d: "At release, the generator reads allocations and creates tasks, one per location and item, grouped into pick lists according to rules for batch size, zone, weight, and container capacity. Each task carries priority, a destination such as a tote or a pallet, and the order or batch it serves. Tasks are stored in the task queue for assignment. It is hard because the grouping choices drive travel, sorting and ergonomics, and must be recalculated when stock moves or an order changes.",
    k: ["Generate all tasks at release vs generate lazily as workers become free: up front gives visibility and planning, lazily reacts to changes and uses fresher data.", "Fixed pick list size vs limit by container cube and weight: fixed is simple, cube limits prevent overfilled totes and extra trips."],
    p: ["Tasks created for locations later emptied by a count send pickers to shortages that were avoidable.", "Overweight lists put heavy items on top of fragile ones."],
    v: "Release 20 orders and confirm every allocated line has exactly one task, no list exceeds configured cube or weight, and cancelling one order removes only its tasks.",
    dep: ["inventory-allocation","task-engine","item-master","location-master"]
  },
  "discrete-picking": {
    s: "A worker picks one order at a time from start to finish, walking the pick path and placing goods directly into that order's container.",
    d: "The simplest strategy: the picker takes one order's lines in path order, and no sorting is needed afterward. It suits large orders, pallet picks and low volume. Travel per unit is high when orders are small. The system sends the list in sequence and confirms each pick by scan. It is hard to scale: as order counts grow, workers walk the same aisles over and over, which is why most high-volume sites move to batch or zone methods.",
    k: ["One order per trip vs multiple orders per trip: discrete needs no sort and is simple to error-proof but wastes walking on small orders.", "Pick into the shipping carton vs into a tote then pack: direct saves a handling step, tote lets the order be verified at pack."],
    p: ["Short orders of one or two lines make travel the dominant cost.", "A picker interrupted mid-order leaves a half-filled container with unclear state."],
    v: "Pick a 10-line order by following the system's path and confirm travel distance, the number of scans and the final container contents match the order exactly.",
    dep: ["task-generation","pick-path-optimization","handheld-scan-app"]
  },
  "batch-picking": {
    s: "A worker picks the same items for many orders in one trip, then the goods are sorted to orders afterward.",
    d: "Orders are grouped by item overlap or zone and a picker collects the total quantity of each item, placing it in a cart, tote or conveyor. Sorting to orders happens at a put wall or sorter, adding a step. Travel drops sharply on small orders. The system must track the batch quantity, the sort assignments and which units belong to which order. It is hard because errors surface late: a mis-sorted unit is only found at pack, and a short pick affects several orders at once.",
    k: ["Batch with downstream sort vs pick-to-order: batching cuts travel and needs sort capacity; pick-to-order avoids sorting.", "Large batches vs small ones: larger batches give more travel reduction, but delay the first completed order and strain the sort area."],
    p: ["Sort capacity smaller than batch output causes goods to pile at the sorter.", "One short pick in a batch delays every order that shared it."],
    v: "Run a 12-order batch of 30 total picks: units sorted to put wall slots match each order exactly, and a forced short on one item is attributed to specific orders.",
    dep: ["task-generation","sortation","order-grouping"]
  },
  "zone-picking": {
    s: "The building is divided into zones with a picker for each; orders pass between zones, each picker taking only that zone's lines.",
    d: "An order's lines are split by zone, and its tote moves by conveyor or cart from zone to zone, either in sequence (pick and pass) or at once (zone with merge). Each picker learns the short aisles of a zone and walks little. The system tracks which zones have completed each order and releases a tote on to the next zone. It is hard because the slowest zone sets the pace and workload is uneven, and incomplete orders wait on one zone.",
    k: ["Sequential pick-and-pass vs parallel zones with a merge: sequential needs no merge but is slow for multi-zone orders; parallel is faster and needs a consolidation step.", "Fixed zone boundaries vs dynamic reassignment: fixed gives familiarity, dynamic balances workload but confuses pickers."],
    p: ["One overloaded zone becomes a bottleneck while neighbors are idle.", "A tote that skips a zone with open lines is discovered only at pack."],
    v: "Send an order with lines in three zones and confirm each zone sees its lines, the tote is routed on only after each zone's confirm, and the order is complete only after all three.",
    dep: ["task-generation","zone-structure","task-assignment","order-grouping"]
  },
  "cluster-picking": {
    s: "A worker picks several orders at once on one cart with separate containers, putting each item directly into the right order's container.",
    d: "The picker walks the combined path of 4 to 20 orders, and the system tells them which container position to place each item in, confirmed by scan or light. It combines the travel savings of batching with sorting at the point of pick, so no later sort. The cart layout and container labeling must match the screen. It is hard because the picker handles several orders at once, so mis-placement errors are easy; strong scan confirmation at each placement is the control.",
    k: ["Sort at pick time on the cart vs sort later at a put wall: cart sorting removes a step but slows each pick and limits cluster size.", "Large clusters vs small: more orders per trip cut travel; bigger carts are slow in narrow aisles."],
    p: ["Placing an item in the wrong tote without a scan check ships the wrong goods to two customers.", "Cart tote labels that do not match screen positions confuse the picker."],
    v: "Pick a 6-order cluster and confirm every placement requires a container scan and the totes contain exactly their order's items afterward.",
    dep: ["task-generation","handheld-scan-app","pick-path-optimization"]
  },
  "pick-path-optimization": {
    s: "Orders the stops on a pick list to minimize walking, using the layout of aisles, one-way rules and congestion.",
    d: "Given a set of locations, the optimizer sequences them with a route heuristic, such as serpentine through aisles, or by exact solving for small lists. It uses the location master's coordinates, aisle direction and blocked areas. Sequence can also respect weight, putting heavy items first, and fragile items last. It is hard because the best path depends on a model of the building that must match the real floor, and because many pickers at once cause congestion that single-picker routes ignore.",
    k: ["Simple serpentine routing vs optimal route solving: serpentine is quick and predictable; optimal saves little on short lists and costs computation on large ones.", "Distance-only vs including weight and fragility: constraints improve quality and lengthen the walk."],
    p: ["Outdated location coordinates make the path send pickers back and forth.", "All pickers following the same optimal route cluster in one aisle."],
    v: "Compare the walked distance of 50 pick lists using the optimizer against a naive location-order sort; the optimizer's total must be lower and every list must still include each location once.",
    dep: ["location-master","zone-structure","task-generation"]
  },
  "replenishment": {
    s: "Moves stock from reserve storage to forward pick locations so pickers do not find them empty.",
    d: "Triggers include min and max levels, demand-based projections of what the next wave needs, and an empty-location scan during a pick. The system creates a task to move a pallet or case from reserve to the pick face, with quantity chosen to fill the slot. Priority depends on urgency: a pick waiting is an emergency. It is hard because replenishing too early wastes space and labor, too late stops picking, and moves of the same stock interact with allocation and counts.",
    k: ["Min-max triggers vs demand-based projection: min-max is simple and reactive; projection avoids stockouts but needs forecast accuracy.", "Replenish during picking vs between waves: concurrent keeps work flowing, between waves avoids collisions in the aisle."],
    p: ["Slots that run empty mid-wave stop pickers and cause short picks.", "Replenishment to a slot that was just re-slotted puts stock in the old location."],
    v: "Pick a forward slot below its minimum and confirm a replenishment task appears for the right quantity, the ledger moves reserve stock to the pick face, and a subsequent pick succeeds.",
    dep: ["inventory-ledger","location-capacity-rules","task-engine","slotting-analysis"]
  },
  "short-pick-handling": {
    s: "Deals with a pick where the shelf has less than the system said, by recording the shortage, trying another location and flagging a recount.",
    d: "When a picker reports a short, the system records the actual quantity, reduces or zeroes the location, and tries to reallocate the missing quantity from another location. If none exists, the line is shorted and backorder rules apply. It also triggers a cycle count of that location because the shortage indicates an inventory error. It is hard to do fast: a short blocks a picker unless the system immediately gives an alternative, and its cause, theft, misplacement or miscount, is rarely known.",
    k: ["Reallocate automatically vs ask a supervisor: automatic keeps pickers moving, supervisor review catches suspicious patterns.", "Adjust the location to the picked count immediately vs wait for a recount: immediate keeps allocation honest but writes off possibly misplaced stock."],
    p: ["Zeroing a location on one worker's report hides stock that is simply on the floor nearby.", "Repeated shorts at the same location are treated as separate events and never counted."],
    v: "Report a short of 3 units on a pick of 5: the line is reallocated from another location for 3, a count task is created for the first location, and available quantity reflects the new count.",
    dep: ["inventory-allocation","cycle-counting","backorder-handling","adjustments-reason-codes"]
  },
  "task-interleaving": {
    s: "Combines different kinds of work, such as a putaway followed by a nearby pick, in one trip so equipment and workers do not travel empty.",
    d: "When a worker completes a task, the system looks for another nearby task of a compatible type that fits the equipment, and offers it before sending the worker back empty. Common combinations are putaway then replenishment or pick. It reduces empty travel on forklifts and reach trucks. It is hard because it requires a live view of all open tasks, their locations and priorities, and a rule that balances savings against letting urgent work wait.",
    k: ["Interleave when the combined trip saves distance vs strictly by priority: interleaving raises throughput but can delay a high-priority task.", "Equipment-specific rules vs one general rule: specific rules respect the real constraints but multiply configuration."],
    p: ["A forklift sent to a pick task it cannot do because the rule ignored equipment type.", "Interleaving shifts workload to areas with only combined tasks and starves others."],
    v: "Complete a putaway in aisle 12 with an open pick in aisle 13 and confirm the worker is offered that pick next, with total empty travel lower than returning to the dock first.",
    dep: ["task-engine","directed-putaway","task-assignment","location-master"]
  },
  "cartonization": {
    s: "Chooses the shipping containers and decides which items go in which, from item dimensions, weight and fragility, before or during packing.",
    d: "The algorithm takes an order's items with dimensions and weights and a list of available cartons, and tries to fit them into the fewest or cheapest set, respecting stacking and fragility. The result predicts parcel count, weight and cost, and can be computed at release to plan or at pack to guide. It is hard because it solves a bin-packing problem approximately, with data that is often wrong: items with wrong dimensions produce cartons that are too small or wasteful.",
    k: ["Predict cartons before picking vs choose at the pack station: prediction lets packing material be prepared and rates be estimated, choosing at pack uses what actually arrived.", "Optimize for fewest cartons vs lowest shipping cost: fewest is simple, lowest cost accounts for dimensional pricing and can use more boxes."],
    p: ["Bad item dimensions give predicted cartons that do not fit the goods and packers override every time.", "Predictions ignore that items arrive in different totes and cannot all be packed together."],
    v: "Run 100 historical orders through cartonization and compare predicted carton to what packers used; the system must disagree on a measured, small percentage and each recommendation must hold the items' total volume.",
    dep: ["item-master","dimension-capture","carrier-rate-shopping"]
  },
  "pack-stations": {
    s: "The workstations where picked goods are checked, put in cartons with fill and documents, sealed, weighed and labeled.",
    d: "A station has a scanner, scale, printer and screen. The packer scans the tote or order, the screen shows items and suggests a carton, each item is scanned into the box, and the system prints documents and the carrier label after the weight check. Stations may be specialized by order type. It is hard because the pack step is the last chance to catch errors, and also a bottleneck: each scan and screen must be quick while enforcing completeness.",
    k: ["Scan every unit vs verify by weight: scanning is exact and slow, weight is fast and misses small differences.", "Dedicated stations by order type vs general stations: dedicated stations are efficient and can idle, general ones are flexible and need more setup."],
    p: ["Packers skipping scans under pressure ship incomplete orders that nobody can trace.", "A scale out of calibration rejects good parcels or accepts wrong ones."],
    v: "Pack a three-item order at a station: every scan is checked, the label prints only after all items are confirmed and weight is within tolerance, and one missing scan blocks completion.",
    dep: ["pack-verification","cartonization","carrier-label-generation","workstation-screens"]
  },
  "pack-verification": {
    s: "Checks a packed order against its lines using scans, weight, images or sorter data before it is sealed and shipped.",
    d: "Verification confirms that every line, quantity, lot and serial required by the order is in the parcel, and that nothing extra is. Methods include scanning each unit, comparing parcel weight to expected weight within tolerance, vision checks, and serial capture for regulated goods. The result is stored per parcel as evidence. It is hard because strictness trades speed for accuracy, and because the controls themselves have blind spots, such as weight checks missing a swapped item of equal weight.",
    k: ["Full unit scan vs weight check alone: full scan gives evidence and costs time, weight alone is fast and misses substitutions.", "Block on mismatch vs warn and allow override: blocking prevents errors, overrides keep the line moving but need accountability."],
    p: ["Weight tolerance set so wide that missing small items pass.", "Overrides without reason codes make later error analysis impossible."],
    v: "Remove one small item from a packed parcel and attempt to complete it: the system must stop completion, name the missing line, and record the stop; adding it back clears the block.",
    dep: ["pack-stations","item-master","audit-trail"]
  },
  "sortation": {
    s: "Separates a mixed stream of picked goods into order or destination positions, at put walls, by conveyor sorters or by robots.",
    d: "After batch picking, units are scanned and directed to a slot for the order or destination. Put walls use lights to show the slot; conveyor sorters divert parcels to chutes based on a destination code. The system maps each scan to a slot, tracks slot occupancy, and signals when an order is complete for packing. It is hard because throughput is high, a mistake is instantly buried, and slots and chutes fill up, blocking the whole sorter.",
    k: ["Fixed slot per order vs dynamic slot assignment: fixed is easy to understand, dynamic uses fewer slots and needs live tracking.", "Sort at item level vs carton level: items give flexible orders and need many scans, cartons are fast and need a prior pack."],
    p: ["Full chutes back up the line and stop the pick flow behind them.", "A scan with no slot for the order leaves units orphaned at the wall."],
    v: "Sort 200 units for 40 orders and verify each slot's contents match its order, no unit remains at the wall after completion, and a unit for a cancelled order is routed to an exception lane.",
    dep: ["light-directed-stations","conveyor-control","order-grouping","batch-picking"]
  },
  "shipping-staging": {
    s: "Holds packed parcels and pallets in marked lanes by carrier, route or truck until loading, and consolidates partial shipments.",
    d: "Lanes are defined in the location model and assigned to loads. Packed units are scanned into a lane, which moves them to a staging status; consolidation waits for all pieces of a shipment before it is released for loading. The system can show what is in each lane, what is missing, and what is late for a cutoff. It is hard because physical lanes overflow, and goods staged in the wrong lane miss the truck.",
    k: ["Pre-assign lanes by load vs assign when staged: pre-assign gives clear zones and wastes space on late loads, dynamic is efficient and needs clear signage.", "Scan on entry only vs scan again on loading: one scan is quick, a second proves nothing was left behind."],
    p: ["Parcels staged in the wrong lane are loaded on the wrong truck.", "Staging without a scan leaves goods that the system thinks are still at pack."],
    v: "Stage 30 parcels for two trucks: the lane list matches physical content, a deliberately misplaced parcel is flagged on loading, and the missing-pieces report is empty after complete staging.",
    dep: ["location-master","load-and-route-planning","pack-stations"]
  },
  "load-building": {
    s: "Loads parcels and pallets onto the truck in the planned sequence, scanning each into the trailer and checking the load against the shipment list.",
    d: "At the door, loaders scan each unit onto the load; the system checks it belongs to this shipment and sequence and warns of mismatches. Loading weight and seal numbers are recorded, and the bill of lading is generated. At completion, the load is closed and the trailer departs. It is hard because it is the point of no return, goods that miss the truck miss a day, and loading speed under truck time pressure encourages skipped scans.",
    k: ["Scan every unit onto the truck vs count pallets: scanning proves what left and costs time, counting is fast and cannot find which item is missing.", "Enforce load sequence vs allow free loading: sequence supports multi-stop delivery, free loading is faster and may need rework at stops."],
    p: ["A parcel loaded on the wrong truck is shown shipped on the right one.", "A bill of lading printed before the final scan has wrong counts."],
    v: "Load a 20-pallet trailer by scan, then add one wrong pallet: the system flags it, the final bill of lading lists exactly the 20 scanned pallets with a seal number, and weights add up.",
    dep: ["shipping-staging","load-and-route-planning","manifesting-and-close-out","handheld-scan-app"]
  },
  "ship-confirmation": {
    s: "The final transaction that marks goods as shipped, removes them from inventory and tells the host and customer, with tracking and quantities.",
    d: "On departure or manifest close, the system posts shipment of each parcel: the ledger deducts the stock from the staged status, the order lines are marked shipped with quantities and lots, and an outbound message goes to the host and channels with tracking numbers. Billing or invoicing in the host system depends on it. It is hard because it must be exactly once and match reality: a confirmation sent too early shows shipped orders that are still on the dock.",
    k: ["Confirm at pack vs at loading vs at carrier pickup: later confirmation is closer to truth and delays notice, earlier is timely and sometimes wrong.", "One confirmation per order vs per parcel: per parcel reports partial shipments precisely and multiplies messages."],
    p: ["Duplicate confirmation messages double-deduct inventory in the host.", "Ship confirmation posted for goods that stayed behind causes customer complaints and phantom stock."],
    v: "Ship an order of 2 parcels and confirm exactly 2 ledger deductions, a host message with 2 tracking numbers, and an unchanged on-hand quantity if the message is resent.",
    dep: ["inventory-ledger","load-building","host-order-interface","event-outbox"]
  },
  "value-added-services": {
    s: "Work performed between storage and shipping that changes the product or its packaging: kitting, labeling, bundling, gift wrap and light assembly.",
    d: "A work order defines components and the finished product, quantities and instructions. Tasks pull components from stock, record the work, and put the finished goods back as a new item, consuming the components. Customer-specific instructions may attach to orders, such as price tickets or special packaging. It is hard because it blurs inventory identity: the ledger must convert components into a new item with correct cost and lot lineage, and workstations need clear instructions that differ per customer.",
    k: ["Pre-build kits to stock vs assemble to order: pre-built is fast to ship but ties up stock in one configuration, assemble-to-order is flexible and slower.", "Bill of materials in the warehouse system vs host-owned: local control runs smoothly, host ownership keeps cost accounting consistent."],
    p: ["Component stock consumed without a matching finished-goods receipt makes both counts wrong.", "Customer instructions that live in paper binders are missed on the busy day."],
    v: "Build 10 kits from a bill of materials of 3 components: component quantities decrease by the right multiples, 10 kits appear in stock with lot lineage, and a shortage of one component stops the work order.",
    dep: ["inventory-ledger","workflow-engine","task-engine","lot-serial-expiry"]
  },
  "rma-intake": {
    s: "Registers an expected return with the reason, item and condition claimed, so it can be matched when it arrives.",
    d: "Hosts or customer portals send return authorizations that list items, reason codes and disposition preferences. The warehouse creates an expected return and a return label or instruction. Authorizations control what is accepted: unauthorized returns are refused or held. It is hard because the facts claimed at authorization often differ from what arrives, and because returns bypass the carefully planned inbound flow and arrive as a stream of small parcels.",
    k: ["Require authorization before receipt vs accept anything: requiring controls fraud and refusal handling, accepting is customer-friendly and floods the dock with unknowns.", "Reason codes from a fixed list vs free text: fixed supports analysis, free text captures nuance."],
    p: ["Returns arriving with no matching authorization sit unprocessed, and customers wait for refunds.", "Reason codes mapped wrongly send sellable goods to scrap."],
    v: "Create an authorization for 2 items, receive one authorized and one unauthorized parcel and confirm the first matches and the second is held with an unmatched flag.",
    dep: ["host-order-interface","exception-queue","configuration-rules"]
  },
  "return-receiving": {
    s: "Receives returned parcels, identifies the item and order they came from, and records what was actually in the box.",
    d: "Returns are scanned by tracking number or return label, matched to the authorization, opened, and each item identified and counted. Photos and notes capture condition. Items without a label are identified by scanning the product. The system records received quantity and sends the result to the next step, grading. It is hard because returned packages hold the wrong item, extra items, or nothing, and receivers must decide quickly with incomplete information.",
    k: ["Open and process at the first touch vs pre-sort by return type: processing at once is simple, pre-sorting lets specialists handle categories.", "Photograph every return vs only exceptions: all gives evidence and costs time."],
    p: ["Returns put aside unopened for weeks age beyond refund windows.", "An item received without matching its authorization cannot be credited."],
    v: "Scan a return label for a 3-item return and receive 2 items plus 1 wrong item: the receipt records the mismatch with photos and the authorization shows 2 of 3 received.",
    dep: ["rma-intake","receipt-against-asn","license-plating"]
  },
  "grading-and-disposition": {
    s: "Assigns each returned item a condition grade and a destination: restock, refurbish, liquidate, scrap or return to vendor.",
    d: "An inspector checks the item against grading criteria for the product class and picks a grade. Rules map grade, item value and policy to a disposition, which creates the matching move task and sets the inventory status. Data feeds supplier claims and quality analysis. It is hard because grading is subjective, differs between inspectors, and drives real money: a wrong grade sells a damaged item as new or scraps one that was fine.",
    k: ["Rule-based disposition vs inspector decision: rules are consistent and fast, inspectors handle odd cases.", "Grade by photo evidence vs physical test: photos allow remote review, tests catch faults photos cannot."],
    p: ["Inspectors applying grades inconsistently lead to sellable stock being scrapped.", "Dispositions not tied to a location leave items in the return area indefinitely."],
    v: "Grade 20 test returns with a known set of conditions and confirm each lands in the correct status and location, with a consistent grade for identical items.",
    dep: ["return-receiving","inventory-status-model","configuration-rules"]
  },
  "restock-and-quarantine": {
    s: "Moves graded returns back into sellable stock or into a held area, updating status and availability.",
    d: "Items graded as sellable are put away like a receipt, and become available. Others go to quarantine, outlet, refurbishment or recycling areas with their own statuses and locations. Serial-numbered goods keep history across the return. It is hard because returned stock re-enters the flow with uncertain history, and speed matters: goods held in the returns area are capital not available for sale.",
    k: ["Return to the original location vs putaway as new stock: original is simple, new putaway uses current slotting.", "Immediate availability for sale vs hold for a recheck: immediate speeds resale, hold avoids shipping a bad item."],
    p: ["Restocking before status change makes unsellable goods available for allocation.", "Serial numbers of returned items are lost, and warranty history breaks."],
    v: "Restock a returned serial item: it reappears available at its location with its history, while a quarantined item cannot be allocated to any order.",
    dep: ["grading-and-disposition","directed-putaway","inventory-status-model"]
  },
  "return-to-vendor": {
    s: "Sends defective, excess or recalled stock back to the supplier with the authorization, documents and credit tracking.",
    d: "A return-to-vendor order selects stock, which is picked, packed with the supplier's authorization number, and shipped, using the outbound flow. The system tracks the expected credit and the supplier's response. Recalls use lot traceability to find all affected stock and customers. It is hard because suppliers refuse returns without proof and paperwork, and the stock sits in limbo until credit is confirmed.",
    k: ["Use the standard outbound flow vs a dedicated flow: standard reuses tested processes, dedicated handles supplier paperwork and credit tracking.", "Ship quickly vs wait for authorization: quick clears space, waiting avoids refusal."],
    p: ["Shipping without the vendor's authorization number makes the supplier refuse delivery.", "Credits that never arrive are not chased because nothing tracks the expectation."],
    v: "Create a return-to-vendor order for a recalled lot and confirm every unit in that lot across all locations is found and picked, and that an expected credit is recorded against it.",
    dep: ["lot-serial-expiry","inventory-allocation","ship-confirmation"]
  },
  "refund-trigger": {
    s: "Tells the host or storefront that a return has been received and accepted, so the customer can be credited.",
    d: "After receipt and grading, the system sends an event with the authorization, items, quantities and condition. The host applies policy to refund, replace or deny. Timing matters to customers; some sellers refund on the carrier's scan, others only after inspection. It is hard because the warehouse has facts but not policy, and the message must carry enough detail for the host to decide, without the warehouse deciding money.",
    k: ["Send on receipt vs after grading: early is fast for customers and risks refunding bad returns, after grading is accurate and slower.", "Warehouse proposes disposition and credit vs host decides: proposing saves host work, deciding keeps money rules in one place."],
    p: ["A message sent before grading triggers a full refund for damaged goods.", "A lost message leaves the customer waiting with no retry."],
    v: "Receive and grade a return and confirm exactly one refund-trigger message reaches the host with quantities and grade, and that a failed delivery is retried until acknowledged.",
    dep: ["grading-and-disposition","event-outbox","host-order-interface"]
  },
});
