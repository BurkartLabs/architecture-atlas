// Details for the warehouse management plate, part 1: operator interfaces, integration and carriers.
ATLAS.details("warehouse-management", {
  "handheld-scan-app": {
    s: "The screen-and-scanner program workers carry, which tells them one task at a time and checks every barcode they scan against what the system expects.",
    d: "The app runs on a rugged handheld and talks to the server over the site wireless network. It shows the next instruction, such as go to this location, pick this quantity, and accepts a scan of the location, item and container as confirmation. Each scan is validated on the server, which replies with the next step. Screens are designed for gloves and one hand. The hard part is latency and connectivity: a half-second delay per scan costs hours of labor across a shift, and a dropped connection mid-task must not lose or duplicate a movement.",
    k: ["Thin client that asks the server on every scan vs thick client with local rules: thin keeps logic in one place but depends on the network; thick tolerates dropouts but risks stale rules.", "Scan-to-confirm on location and item vs trusting the worker's keyed quantity: scans catch wrong picks at the cost of extra seconds per task."],
    p: ["Dead zones in the wireless coverage produce frozen screens, and workers re-scan and double-post movements.", "Free-text entry of quantities invites typos that become inventory errors found only at the next count."],
    v: "Walk a handheld through a full pick including a deliberate wrong-location scan: the app must reject the wrong scan, accept the right one, and the ledger must show exactly one movement after a forced mid-task network drop and reconnect.",
    dep: ["task-engine","device-connectivity","workflow-engine"]
  },
  "voice-picking-client": {
    s: "A hands-free interface where a worker wearing a headset hears instructions and speaks confirmations such as check digits, keeping eyes and hands on the goods.",
    d: "A wearable device runs speech recognition locally, trained to each worker's voice, and exchanges short messages with the server. The server issues prompts like aisle, slot and quantity; the worker says a check digit printed at the location and then the quantity. Because recognition is local, latency is low and noise tolerance depends on training. It is harder than screens because prompts must be short and unambiguous, dialogs must handle corrections and shorts by voice alone, and the vocabulary must work in several languages.",
    k: ["Check digit spoken at each location vs scanning the location label: voice avoids occupying a hand but gives weaker proof the worker was at the right place.", "Speaker-dependent training vs speaker-independent recognition: training raises accuracy in noisy aisles but adds onboarding time and breaks when workers share devices."],
    p: ["Loud equipment or a changed headset degrades recognition and workers fall back to guessing numbers.", "Long prompts slow every pick, so verbose dialogs designed for accuracy end up costing more than they save."],
    v: "In a noisy aisle, issue ten consecutive picks by voice and confirm each logged quantity matches what was said, and that a wrong check digit is rejected with a repeat prompt.",
    dep: ["task-engine","device-connectivity","workflow-engine"]
  },
  "light-directed-stations": {
    s: "Racks or stations with lights and displays that show which bin to take from or place into and how many, replacing reading and walking decisions with a lit signal.",
    d: "Each bin, shelf face or put-wall slot has an indicator with a display and a confirm button. The system lights the target and shows the quantity; the worker acts and presses confirm, which posts the movement. Controllers on the local network drive many indicators, and a failed light must not stall a wave. It is hard because lighting must follow task state exactly: a stale light sends a worker to a bin that is already done, and a missed press leaves a stuck task.",
    k: ["Light-guided vs scanner-guided: lights are very fast on dense stations and need no scanning, but fixed hardware per slot raises cost and limits flexibility.", "Confirm button alone vs scan plus button: a button is faster but cannot catch a wrong item; the scan closes that gap at lower throughput."],
    p: ["A controller reboot drops indicator state and strands lit slots that no longer match open tasks.", "Pressing confirm without taking the item posts phantom movements that surface as count errors."],
    v: "Release a four-order batch to a station and confirm that only slots with open quantity are lit, each confirm clears exactly its light, and no light remains once the batch is complete.",
    dep: ["equipment-gateway","task-engine","sortation"]
  },
  "workstation-screens": {
    s: "Fixed screens at receiving docks, pack stations and offices where users search, review and edit data with a keyboard and mouse.",
    d: "These screens cover work that is heavier than a handheld task: order lookup, receipt entry, inventory queries, location edits and configuration. They are served by the same back end as the handhelds and apply the same permission checks. Query screens must return results from large tables quickly, and edits must go through the same validation as device transactions so a clerk cannot create states a scanner could not. The challenge is breadth: hundreds of screens with different roles, each needing filtering and export without becoming a second, unchecked way to change inventory.",
    k: ["Browser-based screens vs installed desktop clients: browsers simplify deployment across sites but need care for fast keyboard-driven data entry and local device access.", "Direct inventory edit screens vs adjustments only through transactions: direct edits are convenient but bypass the ledger and its audit."],
    p: ["Ad hoc search screens without row limits can lock or slow the transactional store during a busy wave.", "A screen that edits quantities directly creates a back door that corrupts the ledger and its audit trail."],
    v: "Edit an item dimension from a workstation and confirm the audit trail records user and time, and that attempting to change an on-hand quantity from the same screen creates a ledger adjustment with a reason code rather than overwriting.",
    dep: ["access-control","audit-trail","transactional-store"]
  },
  "supervisor-dashboard": {
    s: "A live view of work in progress: orders released and shipped against cutoff, tasks waiting, workers and queues by area, and what is late or blocked.",
    d: "The dashboard reads task, order and labor data and computes progress against deadlines such as carrier cutoffs. It highlights areas where work is piling up and orders at risk of missing a ship time. Supervisors use it to move people between zones or trigger releases. It is hard because it must be fresh without slowing the transactional work: heavy aggregate queries on live tables compete with scans, so many systems read from a replica or maintained summary at the cost of some staleness.",
    k: ["Query live tables vs read maintained summaries: live is exact but contends with floor transactions; summaries are cheap and slightly stale.", "Progress by order count vs by estimated work minutes: counts are simple but mislead when order sizes vary widely."],
    p: ["A figure computed from stale summaries shows green while a carrier cutoff is quietly being missed.", "Too many metrics bury the one blocked queue the supervisor needs to see."],
    v: "Hold back all tasks in one zone and confirm the dashboard flags that zone and the affected orders as at risk within its stated refresh interval, with a count matching the task table.",
    dep: ["reporting-and-kpis","task-engine","exception-queue"]
  },
  "exception-queue": {
    s: "A worklist of things that need a person's decision: damaged goods, short picks, address errors, blocked orders and failed integration messages.",
    d: "Whenever automatic handling cannot proceed, the system records an exception with a type, owner, related order or item, age and suggested actions, and places it in a queue. Rules route exceptions to roles, and escalate when they age. Resolving one triggers the follow-up: re-allocate, re-pick, cancel or release. The difficulty is closure: an exception raised in one subsystem must be tied to the work it paused, and resolved exceptions must resume that work rather than leaving orders stuck in limbo.",
    k: ["One shared queue with filters vs separate queues per subsystem: shared gives one view and consistent aging, separate fits each team's tooling and permissions.", "Auto-resolve on retry vs always require a person: auto-resolve clears noise but can hide a recurring defect."],
    p: ["Exceptions raised without a link to the paused task leave orders stuck with no one watching them.", "A queue nobody owns grows quietly until a customer complaint exposes it."],
    v: "Create a short pick and confirm an exception appears with the order linked, is routed to the inventory role, and that resolving it by reallocation resumes the order without manual status edits.",
    dep: ["workflow-engine","task-engine","configuration-rules"]
  },
  "print-management": {
    s: "Chooses the right printer for each label or document, formats it for that device and tracks that it printed, including reprints.",
    d: "Container labels, location labels, pick lists, packing slips and carrier labels all print through one service that maps a document type and station to a printer, applies the template and sends the job over the network. Label printers speak their own command language, so templates exist per device class. The service tracks job state and supports reprint. It is hard because paper and ribbon run out mid-wave, printers drop off the network, and a missing label stops a pallet at the dock; routing must fail visibly and retry on another device.",
    k: ["Server-side rendering of label images vs sending device commands from templates: images are uniform but heavy and blurry at small sizes; commands are sharp and fast but need a template per device.", "Print on demand at the station vs batch-print up front: on demand prevents stale labels but waits on the printer; batch is fast but stock changes between print and use."],
    p: ["A printer that silently fails leaves the job marked sent, and a pallet cannot be shipped until someone notices.", "Reprinting an LPN label without voiding the old one creates two physical labels for one container."],
    v: "Unplug the label printer at a pack station, submit a carrier label and confirm the job shows failed, is offered on the backup printer, and the printed barcode scans to the right shipment.",
    dep: ["device-connectivity","configuration-rules","carrier-label-generation"]
  },
  "host-order-interface": {
    s: "The agreed contract through which an upstream business system sends orders, item changes and receipts to the warehouse and receives confirmations back.",
    d: "Orders arrive as files or messages in an agreed schema; the interface parses, validates and maps them to internal orders, and returns acknowledgments, shipment confirmations and inventory changes. Each host has its own field meanings, so mapping is configuration per partner. It is hard because the interface is a contract between two systems that change independently: duplicate or out-of-order messages, partial updates, and cancellations that arrive after picking started all need defined behavior.",
    k: ["Push messages with acknowledgments vs periodic file pickup: messages are timely and traceable, files are simpler to produce and replay but delay the data.", "Warehouse owns order status after release vs host overwrites at will: warehouse ownership protects work in progress but needs a cancellation protocol."],
    p: ["Processing the same order message twice without an idempotency key creates duplicate shipments.", "A cancellation arriving after packing is silently dropped, and the customer is charged for goods that ship anyway."],
    v: "Send the same order message twice and then a cancellation after pick start: exactly one order exists, the cancellation produces an explicit rejected or reversed state, and both outcomes are acknowledged to the host.",
    dep: ["message-queue","configuration-rules","order-intake"]
  },
  "advance-ship-notices": {
    s: "Electronic notices from suppliers or other sites announcing what is on an inbound shipment, in what containers, before it arrives.",
    d: "An advance ship notice lists purchase order lines, quantities, lots, container identifiers and expected arrival. The system stores it as an expected receipt and uses it to plan dock time, labor and putaway space, and to match scans at receiving. Containers can be pre-labeled so receiving is a scan rather than a count. The hard part is trust: notices are often wrong, late or missing, so receiving must reconcile real scans against the notice and handle mismatches without blocking the dock.",
    k: ["Receive by trusting the notice vs verifying every unit: trust is fast but passes supplier errors into inventory; verification catches them at labor cost.", "Match by container identifier vs by item and quantity: identifier matching is quick when labels are right, item matching survives bad labels but needs more scans."],
    p: ["Notices that never arrive force blind receiving at the busiest hour.", "A notice reused or amended after goods are partly received leaves two inconsistent expectations."],
    v: "Load a notice for 3 pallets, receive 2 and confirm the expected receipt shows one outstanding pallet, and that an unlisted container scan produces a discrepancy rather than being silently accepted.",
    dep: ["edi-gateway","receipt-against-asn","message-queue"]
  },
  "edi-gateway": {
    s: "Translates standard business documents and flat files from trading partners into internal messages, and the reverse, with validation and retry.",
    d: "Partners send documents in standard formats such as orders, notices and invoices, over file transfer or messaging links. The gateway authenticates the sender, checks structure, maps fields to the internal model, and produces acknowledgments. Outbound documents follow the same path in reverse. Each partner mapping differs, so most work is configuration and testing. The difficulty is the long tail: format variations, code lists, and partners who send corrections as new documents rather than updates.",
    k: ["Central translation in the gateway vs partner-specific code in each function: central keeps functions clean but concentrates risk in one component.", "Reject whole files on one bad line vs accept the good lines: rejecting is safe and simple, accepting keeps flow moving but needs partial-failure reporting."],
    p: ["A silent mapping change at a partner shifts a field and bad data flows for days before anyone notices.", "Failed documents with no alert sit in an error folder while orders go unshipped."],
    v: "Send one valid and one malformed order file: the valid one produces an order and an acknowledgment, the malformed one lands in an error list with the failing line and an alert, and nothing partial reaches the order table.",
    dep: ["message-queue","configuration-rules","audit-trail"]
  },
  "marketplace-order-sync": {
    s: "Pulls orders from online storefronts and marketplaces and pushes back tracking and stock status, in near real time.",
    d: "Storefronts expose their order feeds through web interfaces or notifications. The sync service polls or receives them, normalizes address, item and shipping method, and creates warehouse orders; later it posts shipment tracking and cancellations back. Rate limits, retries and differing item identifiers add work. It is hard because marketplaces impose strict service levels on ship time and tracking upload, and because the same stock is sold on several channels and overselling shows up as cancellations.",
    k: ["Polling with a cursor vs notification callbacks: polling is simple and recoverable, callbacks are faster but need a way to catch missed events.", "Warehouse maps channel items to internal ones vs channel supplies internal ids: mapping tolerates messy catalogs but needs upkeep and error handling."],
    p: ["Unmapped item identifiers create orders that can never be allocated and quietly age.", "Missed tracking uploads breach marketplace deadlines even when the parcel shipped on time."],
    v: "Place a test order on a connected storefront and confirm it appears in the warehouse within the stated interval with mapped items, and that its tracking number appears on the storefront after ship confirmation.",
    dep: ["message-queue","order-intake","tracking-event-ingest"]
  },
  "inventory-publish": {
    s: "Sends available-to-sell quantities to sales channels and business systems so they do not sell stock the warehouse does not have.",
    d: "The service computes available quantity as on hand less allocated, held, damaged and safety stock, optionally split by channel, and publishes changes as events or periodic snapshots. Consumers use it to show stock and accept orders. It is hard because the number moves constantly, and publishing every change floods consumers, while batching causes overselling windows. The definition of available also differs by business: inbound stock may count as future availability or not.",
    k: ["Publish every change vs periodic snapshots: events reduce overselling but create load and ordering problems; snapshots are simple but stale between runs.", "Safety buffers per channel vs one shared pool: buffers protect priority channels but strand stock that other channels could sell."],
    p: ["A counting adjustment publishes a transient zero, and a channel delists a product that was in stock.", "Out-of-order events leave the channel with an older, wrong quantity after a newer one."],
    v: "Allocate 5 of 20 units, place a 3-unit hold and confirm the feed reports 12 available within its interval, then release the hold and confirm it returns to 15.",
    dep: ["inventory-ledger","inventory-status-model","event-outbox"]
  },
  "carrier-rate-shopping": {
    s: "Compares price and transit time across carriers and services for each shipment, then selects one using business rules such as cost, speed and customer promises.",
    d: "Given the packed dimensions, weight, origin, destination and promised delivery, the service asks each carrier's rating interface for quotes, filters by service availability and cutoff, and applies rules to pick the cheapest option that meets the promise. Contracted rates may be held locally and calculated. It is hard because rate calls add latency inside the pack step, carrier networks time out, and rates depend on details such as surcharges, zones and dimensional weight that must be computed the way the carrier does.",
    k: ["Live rate calls at pack time vs rates computed locally from tables: live is accurate but slow and fragile; local is fast but drifts when carriers change.", "Select cheapest meeting the promise vs a fixed routing guide: dynamic saves money, a fixed guide is predictable and simpler to audit."],
    p: ["A rate service timeout at pack time blocks the station unless a default carrier is defined.", "Ignoring dimensional weight understates cost, and the carrier invoice later disagrees with the quote."],
    v: "Pack a parcel with known dimensions and compare the selected rate against the carrier's own quote for the same inputs; then block the rating service and confirm the station falls back to the configured default carrier.",
    dep: ["cartonization","configuration-rules","carrier-label-generation"]
  },
  "carrier-label-generation": {
    s: "Requests a shipping label and tracking number from the chosen carrier for a packed parcel and sends it to the printer.",
    d: "After pack, the service builds a shipment request with addresses, weight, service level and references, sends it to the carrier's interface, and receives a label in a printer-ready format together with a tracking number. The label and number are stored with the shipment. Address validation and customs data are included for international parcels. It is hard because it sits on the pack station's critical path: carrier outages stop packing, address errors surface late, and a voided or reprinted label must not leave a billable ghost shipment.",
    k: ["Generate the label before packing completes vs after weight confirmation: early is faster but may need a void if weight differs; late is accurate but adds a wait.", "Store the carrier's label image vs regenerate on reprint: storing guarantees the same barcode, regenerating can create a duplicate shipment."],
    p: ["Cancelling a pack without voiding the label bills the shipper for a parcel that never ships.", "An unvalidated address creates a label that the carrier later rejects or surcharges."],
    v: "Pack a parcel, print its label and scan it with a carrier tool to confirm the tracking number matches the stored one; then void the shipment and confirm the carrier shows it voided.",
    dep: ["carrier-rate-shopping","print-management","pack-stations"]
  },
  "manifesting-and-close-out": {
    s: "Groups the day's parcels by carrier into manifests and transmits them, producing the handover record that proves what each carrier took.",
    d: "At close-out the system collects every labeled parcel for a carrier, produces a manifest with counts and tracking numbers, sends the electronic manifest to the carrier, and records pickup. Scans at the truck can be reconciled against the manifest to find missing parcels. It is hard because it is a daily deadline with money attached: parcels not manifested are not picked up or are billed late, and a parcel added after close-out needs a defined path.",
    k: ["Close out per carrier at a cutoff time vs continuously as parcels pack: cutoffs are simple and match pickups, continuous gives earlier proof but more transmissions.", "Reconcile with a scan at the truck vs trust the manifest: scanning catches left-behind parcels at the cost of loading time."],
    p: ["Parcels packed after cutoff stay off the manifest and sit for a day unless flagged.", "A manifest sent before a late void includes a parcel that does not exist."],
    v: "Close out a carrier with 50 parcels, scan 49 onto the truck and confirm the reconciliation lists the missing parcel by tracking number before the truck leaves.",
    dep: ["carrier-label-generation","ship-confirmation","load-building"]
  },
  "tracking-event-ingest": {
    s: "Receives carrier scan events such as picked up, in transit and delivered, and attaches them to shipments and orders.",
    d: "Carriers send events by callback or the system polls their tracking interfaces using the tracking number. Events are stored with timestamps and mapped to internal shipment states, then forwarded to hosts and channels. They drive exception handling for lost or delayed parcels and delivery confirmation. It is hard because carriers disagree on event vocabularies and timing, send events out of order or twice, and some report only at hub scans, so shipment state must be derived rather than copied.",
    k: ["Callbacks vs polling: callbacks are timely and cheap, polling is robust against missed notifications but wastes calls and delays updates.", "Normalize events to a small internal set vs keep carrier codes: normalization simplifies downstream logic and loses detail unless the raw event is kept too."],
    p: ["Out-of-order events regress a delivered parcel to in transit.", "Duplicate events trigger duplicate customer notifications."],
    v: "Replay a recorded set of carrier events in scrambled order and with duplicates and confirm the shipment ends in the correct final state with one delivery notification.",
    dep: ["message-queue","carrier-label-generation","event-outbox"]
  },
});
