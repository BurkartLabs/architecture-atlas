// Details for the point-of-sale plate, part 3: payments, shift and cash management, peripherals.
ATLAS.details("point-of-sale", {
  "tender-manager": {
    s: "Coordinates every form of payment on a sale: tracks the amount due, applies each tender in turn, calculates change and decides when the sale is fully paid.",
    d: "Each tender type, such as cash, card, voucher, gift card and account, implements a common interface: validate, take, reverse. The manager keeps the remaining balance, orders tenders, enforces limits such as maximum cash or card-only items, and computes change. It records each tender in the journal as it succeeds. It is hard because tenders fail independently: the second card of a split may decline after the first has been charged, and the manager must leave the sale in a state the cashier can finish or unwind.",
    k: ["Common tender interface versus per-tender code paths: a common interface makes new payment types cheap to add, but hides differences such as reversibility and offline behavior that matter.", "Complete the sale at last tender versus confirm after the receipt is printed: completing at the tender is atomic, while later confirmation allows recovery but leaves a longer window for inconsistency."],
    p: ["Change calculated from a rounded total instead of the cash tendered gives wrong change at the margin.", "A declined second tender leaves the first charged with no clear next step for the cashier."],
    v: "Pay a 50.00 sale with 20.00 cash and a card that is then declined, and confirm the sale stays open with 30.00 due, the cash is recorded, and finishing with a second card completes it with correct tenders.",
    dep: ["transaction-state-machine", "card-terminal-integration", "cash-drawer-control", "rounding-and-totals"]
  },
  "split-tender-handling": {
    s: "Allows one sale to be paid with several tenders, by amount or by item share, and handles refunds and reversals back across them.",
    d: "The cashier or customer chooses an amount for each tender, with the rest remaining. Each tender is applied and recorded against the transaction, including its authorization reference. A later refund must decide how to distribute money across the original tenders, usually back in reverse order or proportionally. Rules cap cash back and gift card use. It is hard because partial failure leaves money in motion: an approved card for part of a sale where the remaining part is abandoned must be reversed reliably.",
    k: ["Cashier-allocated amounts versus automatic splitting: manual allocation fits what customers ask for, while automatic splits avoid keying errors and fit group payments poorly.", "Refund proportionally versus to the last tender used: proportional matches the original, while last-first is simple and may violate card network rules for original-tender refunds."],
    p: ["Abandoning a split sale after one card was approved leaves a hold on the customer's account for days.", "A refund after a split sale sends all the money to one card that only paid part."],
    v: "Split a 100.00 sale across two cards and cash, return the whole sale, and confirm each tender is refunded its original amount, each with its own reference, and the totals net to zero.",
    dep: ["tender-manager", "reversals-and-timeouts", "returns-and-exchanges"]
  },
  "card-terminal-integration": {
    s: "Links the register to a certified card terminal through a defined message protocol, sending the amount and receiving the approval result without ever seeing card numbers.",
    d: "The register sends a payment request with amount, currency and a reference over a serial, USB, network or cloud connection. The terminal reads the card, handles PIN and the issuer exchange through its acquirer, and returns approved, declined or error with a masked card number, a token and a receipt reference. The register shows prompts forwarded from the terminal. It is hard because of the two-system problem: the terminal may approve while the register loses the response, and connection loss mid-payment needs a way to ask what happened.",
    k: ["Integrated terminal controlled by the register versus standalone terminal keyed by hand: integration prevents amount mismatches and speeds checkout, but needs a protocol and certification work.", "Terminal on the local network versus cloud-connected: local is fast and works without internet to the register, while cloud lets the terminal move and be managed remotely."],
    p: ["The register times out and asks again while the terminal had already approved, which charges the customer twice.", "A mismatch between the amount sent to the terminal and the amount on the receipt arises from an edit after the request."],
    v: "Pay with a test card, unplug the network between approval and response, and confirm the register queries the terminal by reference, finds the approved payment once, and does not charge again.",
    dep: ["tender-manager", "device-abstraction-layer", "payment-scope-reduction", "reversals-and-timeouts"]
  },
  "chip-and-contactless-flow": {
    s: "The sequence a terminal runs with a card or phone: select application, read data, verify the cardholder, authorize with the issuer, and finish with a cryptogram.",
    d: "Inside a certified kernel, the terminal and the chip negotiate an application and exchange data. Risk rules decide whether to go online. The cardholder is verified by PIN, signature or device unlock. The chip generates a cryptogram that proves this card authorized this amount. Contactless adds limits and a tap-time budget. The register never runs this; it receives the result. It is hard because the details are strict and brand-specific: each card network has its own rules and any variation fails certification.",
    k: ["Online authorization on every sale versus offline approval below limits: always online reduces risk, while offline approval is faster and survives outages but accepts risk.", "Terminal-managed card selection versus register-managed: terminal-managed keeps card logic out of the register, while register-managed offers more control and expands certification scope."],
    p: ["Removing the card early during the exchange creates an unknown outcome that must be resolved with a reversal.", "Fallback to the magnetic stripe when the chip fails moves liability for fraud to the merchant."],
    v: "Run a test card on each network's certification scripts, including a chip decline and an early card removal, and confirm each yields the specified outcome and a cleanly resolved transaction.",
    dep: ["card-terminal-integration", "pin-entry-isolation"]
  },
  "pin-entry-isolation": {
    s: "Keeps PIN entry inside tamper-resistant hardware so the register, its software and the network never see the digits.",
    d: "The PIN is typed on a secured keypad that encrypts it immediately under keys held only in the device and the issuer's systems. Even a compromised register cannot read it. Keypads are certified for tamper detection, with seals and inspections. Software PIN entry on a phone follows a separate certification. It is hard because the physical device is the attack surface: skimmers, swapped devices and cameras target the pad, so retailers inspect and log device serial numbers.",
    k: ["Dedicated certified keypad versus software PIN on a commercial phone: dedicated hardware is the proven path, while phone entry cuts hardware cost and has a narrower acceptance.", "Combined terminal and register versus separate keypad: combined is compact, while separate keeps the register out of the security scope."],
    p: ["A swapped pad that looks identical but records PINs goes unnoticed without serial checks.", "Routing PIN entry through the register's own keyboard brings the whole system into the card-security scope."],
    v: "Inspect each pad's serial against the device registry, and confirm using a test harness that traffic captured between pad and register contains only encrypted PIN blocks and no digits.",
    dep: ["card-terminal-integration", "device-enrollment"]
  },
  "payment-tokens": {
    s: "Replaces card numbers with opaque tokens issued by the payment provider, so the register and database can reference a card for refunds and repeat use without storing it.",
    d: "After a payment, the processor returns a token that stands for the card in this merchant's context. The register stores the token, last four digits and brand on the transaction. Refunds, tips adjustments, and card-on-file purchases use the token. A token is useless to a thief outside that merchant. It is hard because tokens are tied to the provider: switching providers means migrating or losing them, and tokens for a customer must be matched to the right account.",
    k: ["Provider tokens versus a self-run vault: provider tokens keep the vault out of scope, while a self-run vault gives portability and a huge compliance burden.", "Single-use versus reusable tokens: single-use limits misuse, while reusable tokens enable returns and subscriptions but need stronger access control."],
    p: ["Logging the full payment response, including the unmasked number, defeats tokenization.", "Tokens stored without brand and expiry make later refunds to a replaced card fail with no explanation."],
    v: "Complete a card sale and search the register's database, logs and uploaded data for the card number, and confirm only a token, last four digits and brand exist.",
    dep: ["card-terminal-integration", "payment-scope-reduction"]
  },
  "authorization-and-capture": {
    s: "Splits a card payment into reserving funds and collecting them, so a sale can be authorized first and captured at completion, or adjusted for tips and extras.",
    d: "An authorization asks the issuer to hold an amount; a capture later instructs the processor to collect the final amount, which can be equal to or less than the hold. Retail often does both at once, while hospitality and fuel authorize before the final amount is known. Unused authorizations expire. It is hard because unmatched holds tie up the customer's funds, and captures above the authorization are limited or refused by the network.",
    k: ["Authorize and capture together versus separately: together is simple and fast, while separate steps allow adjusting the final amount at the cost of tracking open authorizations.", "Capture at sale time versus in a batch later: immediate capture shows consistent state, while batching reduces fees and delays failures to the settlement."],
    p: ["An authorization never captured or released leaves a hold on the customer's account for a week.", "Capturing more than the authorized amount after an edit is declined after the goods have left."],
    v: "Authorize 50.00, capture 47.50 after removing an item, and confirm the processor report shows one capture of 47.50 and the remaining 2.50 hold released.",
    dep: ["card-terminal-integration", "payment-tokens", "settlement-and-reconciliation"]
  },
  "reversals-and-timeouts": {
    s: "Detects payments in an unknown state and resolves them by querying or reversing automatically, so no customer is charged without a sale and no sale goes unpaid.",
    d: "Before sending a request, the register records an intent with a unique reference. If the response does not arrive, it queries the terminal or processor by that reference. If a payment exists and the sale was abandoned, it is reversed; if the sale completed, it is kept. A reversal queue retries until confirmed. It is hard because the cashier and customer are waiting: every ambiguous state has a human consequence, and the fastest safe action must be taken without guessing.",
    k: ["Automatic reversal on timeout versus ask the cashier: automatic is fast and consistent, while asking uses judgment and risks forgetting the reversal.", "Reversal versus refund for a failed sale: a reversal is faster and cheaper because the funds never move, but works only before settlement."],
    p: ["Reversal queued locally and lost in a crash leaves a charge with no sale.", "Retrying a payment without the original reference creates a second charge instead of recovering the first."],
    v: "Drop the connection after the terminal approves, abandon the sale, and confirm the register finds the payment by reference, reverses it, and the processor's report shows approval and reversal with a net of zero.",
    dep: ["card-terminal-integration", "idempotency-and-dedupe", "store-and-forward-queue"]
  },
  "settlement-and-reconciliation": {
    s: "Closes the card batch, sends totals to the acquirer and compares what the processor will deposit with what the registers recorded, flagging differences.",
    d: "At the end of the day, terminals or the processor close a batch, and the acquirer settles the net, less fees, to the bank account days later. The retailer's records by tender, card brand and store are matched against processor reports line by line. Differences arise from timing, chargebacks, fees and failed captures. It is hard because three records must agree: the register journal, the processor's batch and the bank deposit, each with its own cutoff time.",
    k: ["Match line by line versus by batch totals: line matching finds the precise failure, while totals are quick and show only that something is off.", "Auto-close batch on a schedule versus manual close: scheduled closing is reliable, but ignores a store that is still trading after the cutoff."],
    p: ["Transactions straddling the batch cutoff appear in the register's day but the processor's next one, producing a daily false difference.", "A batch that fails to close silently delays all the deposits until someone notices."],
    v: "Run a day of test card sales including a reversal and a refund, close the batch, and confirm the processor report and register journal match line by line with zero unexplained differences.",
    dep: ["authorization-and-capture", "transaction-journal", "end-of-day-close"]
  },
  "tips-and-surcharges": {
    s: "Adds amounts after the sale total: gratuity entered by the customer or added by rule, and card surcharges, with tax, reporting and adjustment rules.",
    d: "A tip can be chosen on the terminal or customer display before the card is charged, or added afterward by adjusting the authorization. Tips are recorded separately from sales, tracked per employee and sometimes pooled. Surcharges are fees where allowed by law, with disclosure. It is hard because rules are local and money is owed to staff: tips on cards must be paid out, tax treatment varies, and an adjusted amount must be capturable within network limits.",
    k: ["Tip before the charge versus adjust afterward: before is a single clean charge, while afterward fits table service and needs adjustment support and limits.", "Pooled tips versus per-employee tracking: pooling is simple for staff, while per-employee tracking is needed for tax reporting and fair payout."],
    p: ["A tip adjusted above the allowed percentage of the authorization is declined after the customer has left.", "Tips recorded as sales inflate revenue and tax and break the till reconciliation."],
    v: "Add a 15 percent tip to a card sale before the charge and another by later adjustment, and confirm the receipts, the processor amounts and the tip report show the same amounts and the till is unaffected.",
    dep: ["tender-manager", "authorization-and-capture", "customer-facing-display"]
  },
  "shift-open-and-close": {
    s: "Starts and ends a cashier's period of responsibility for a drawer, tying every sale, tender and cash movement to one person and one time range.",
    d: "At open, the cashier signs in, takes a drawer with a recorded starting float, and the system starts a shift record. All transactions cite it. At close, the cashier counts the drawer, the system compares it with expected, and the shift is finalized into totals by tender. Shifts can be suspended for breaks and handed over. It is hard because accountability needs a clean boundary: shared drawers, forgotten sign-outs and mid-shift handovers all blur who owns the cash.",
    k: ["One drawer per cashier versus shared drawers: one drawer gives clear accountability, while sharing fits busy peaks and loses it.", "Close with expected shown versus blind: showing expected speeds reconciliation, while blind forces an honest count."],
    p: ["A shift left open overnight collects the next morning's sales under the wrong person and date.", "Handing a drawer over without a count makes a shortage unassignable."],
    v: "Open a shift with a 100.00 float, ring cash sales, close and count, and confirm the shift report totals cash sales, float and counted cash, and every sale cites that shift.",
    dep: ["cashier-sign-in", "till-float-and-assignment", "transaction-journal"]
  },
  "till-float-and-assignment": {
    s: "Records the starting cash given to each drawer and which cashier holds it, so expected cash at any moment can be computed.",
    d: "A float is issued from the safe to a drawer in a counted amount, often in set denominations. The system links drawer, cashier and register and stores the opening amount. Expected cash is opening float plus cash sales, plus paid-ins, minus change, refunds, payouts and drops. In multi-currency stores each currency has a float. It is hard because the float is physical: it must be counted into and out of the safe, and any unrecorded movement breaks the expected figure.",
    k: ["Fixed standard float versus variable per shift: a standard float is quick and consistent, while a variable float fits unequal demand and needs more counting.", "Drawers tied to registers versus to cashiers: tying to a register is simple, while tying to a cashier travels with the person and needs portable drawers."],
    p: ["A float handed over without recording it makes the next cashier appear short by that amount.", "Using the same drawer on two registers breaks the expected-cash calculation for both."],
    v: "Issue a 150.00 float, confirm the system shows it against the cashier and register, and then compute expected cash after a known sequence of sales and a drop, matching a manual calculation.",
    dep: ["shift-open-and-close", "cash-drawer-control"]
  },
  "paid-in-paid-out": {
    s: "Records cash that enters or leaves the drawer outside a sale: petty cash, a supplier payment, change fund top-ups, with a reason and approval.",
    d: "The cashier selects the type, enters the amount and reason, and a manager approves where limits apply. The system records a non-sale cash movement and opens the drawer. These entries adjust expected cash and are reported by reason. A receipt or voucher is attached to the physical paperwork. It is hard because every one of these is a hole in the till: an unrecorded payout looks like a shortage, and a fictitious payout hides theft.",
    k: ["Approval on every payout versus above a limit: universal approval is safe and slow, while limits let small amounts through and may be sliced to avoid review.", "Free-form reason versus categories: categories enable analysis, while free text captures the unusual cases that categories omit."],
    p: ["A payout with no supporting voucher is accepted and later cannot be audited.", "Splitting a large payout into several small ones avoids the approval limit."],
    v: "Record a 20.00 supplier payout with a reason and approver, and confirm expected cash drops by 20.00, the entry appears in the payout report with the voucher number and the drawer opens.",
    dep: ["till-float-and-assignment", "manager-override-prompts", "audit-trail"]
  },
  "safe-drops-and-pickups": {
    s: "Moves excess cash from a drawer into the safe during the shift, and later out of the safe for deposit, each step counted and recorded.",
    d: "When a drawer exceeds a threshold, the cashier removes a counted amount, seals it in an envelope or deposits it into a drop safe, and records a drop with an envelope number. Expected cash in the drawer falls. Pickups by a manager or a carrier are recorded by envelope with a signature. It is hard because custody changes hands: every transfer needs two people or a sealed container, and envelope contents are not verified until counted later.",
    k: ["Drop to a time-delay safe versus a manual safe: time-delay safes reduce robbery value and hold access, while manual safes are quicker for managers.", "Count the envelope at drop versus later: counting at drop is certain, while later counting is faster and moves shortages out of sight."],
    p: ["An envelope recorded for 500.00 that holds 400.00 is found only at the bank, when custody is unclear.", "A drop not entered in the system leaves the drawer apparently short."],
    v: "Drop 300.00 into an envelope, confirm expected drawer cash falls by 300.00, then pick up and count the envelope next day and confirm the count equals the recorded drop with both signatures.",
    dep: ["till-float-and-assignment", "paid-in-paid-out", "blind-cash-count"]
  },
  "blind-cash-count": {
    s: "Has the cashier count the drawer by denomination without being shown the expected amount, so the count reflects what is physically there.",
    d: "At close, the cashier enters the number of each note and coin. The system computes the total, compares it with expected cash and records the variance, only revealing the expected figure afterward, if at all. Managers may recount. Counts are stored by denomination for bank preparation. It is hard because staff can guess a target if any hint leaks: a displayed running total or a known float lets them adjust the count toward the expected value.",
    k: ["Blind count versus showing expected: blind gives an honest signal, while showing expected speeds closing and invites rounding the count to fit.", "Count by denomination versus by total: denomination counts catch transposition errors and support bank deposits, but take longer."],
    p: ["A screen that shows the running total during entry makes the count meaningless.", "Allowing unlimited recounts until the variance is zero hides the original discrepancy."],
    v: "Close a drawer known to be 5.00 short, enter the counted denominations without seeing expected, and confirm the system records a 5.00 shortage and keeps the first count even after a recount.",
    dep: ["shift-open-and-close", "over-short-handling"]
  },
  "over-short-handling": {
    s: "Calculates the difference between expected and counted cash, assigns it to a shift and cashier, and applies tolerances and follow-up actions.",
    d: "The variance is posted to an over-and-short account and attached to the shift. Small differences within a tolerance are normal and only tracked; larger ones need a manager's explanation and may start an investigation. Trends by cashier and register show patterns. It is hard because a number alone is ambiguous: it may be a miscount, change error, a real theft, a sale not recorded, or a till that two people used.",
    k: ["Charge variances to the cashier versus the store: charging encourages care but may be unlawful or unfair and discourages honest reporting, while charging the store hides patterns.", "Fixed tolerance versus a percentage of sales: a fixed amount is simple, while a percentage scales with busy drawers."],
    p: ["Cashiers who are penalized for shortages learn to hide them by shuffling cash between drawers.", "Overages ignored because they favor the store hide the same errors as shortages."],
    v: "Close three shifts with an exact count, a 2.00 variance and a 40.00 shortage, and confirm the first two pass tolerance quietly, and the third requires an explanation and appears on the exception report.",
    dep: ["blind-cash-count", "exception-reports", "shift-open-and-close"]
  },
  "end-of-day-close": {
    s: "Ends the trading day: closes open shifts, produces the final totals by tender, department and tax, prepares the bank deposit and locks the day's data.",
    d: "An interim report, often called an X report, shows totals without resetting; the final Z-style report resets counters and closes the business date. The close verifies there are no open transactions or shifts, totals tenders against counted cash and card batches, and computes the deposit. The day is then locked, and later changes are adjustments in the next period. It is hard because it must be complete: late offline registers, open holds and uncounted drawers all need to be resolved or explicitly carried.",
    k: ["Hard lock at close versus allow reopening: a hard lock keeps reports stable and honest, while reopening fixes mistakes and makes totals unreliable.", "Close per register versus per store: per register is simpler to isolate, while per store captures shared safe and card batches."],
    p: ["Closing before an offline register uploads leaves its sales out of the day and into the next.", "Open held sales at close vanish from the day's totals and the stock record."],
    v: "Close a day with an open hold and an unclosed shift and confirm the system blocks until both are resolved, then closes, prints totals that equal the sum of tenders and locks the date against edits.",
    dep: ["shift-open-and-close", "settlement-and-reconciliation", "transaction-journal"]
  },
  "device-abstraction-layer": {
    s: "Presents printers, drawers, scanners, scales and displays to the application as a small set of device classes with uniform operations, hiding the model-specific details.",
    d: "The application asks for operations such as print receipt, open drawer, read scale or show line, never for a model. A driver for each device class translates to the device's own commands over serial, USB, network or Bluetooth. Standards define the class interfaces, and vendors supply service objects that implement them. Configuration maps logical device names to physical ones per register. It is hard because the abstraction leaks: devices differ in speed, error reporting and status, and the lowest-common-denominator interface cannot express useful features.",
    k: ["Standard device interface versus direct vendor commands: a standard keeps the application portable across hardware, but limits access to model-specific features.", "Drivers in the app process versus a separate device service: in-process is simple and fast, while a separate service isolates crashes and lets several apps share a device."],
    p: ["A driver that blocks on a stuck printer freezes the whole sale screen.", "Logical device names mapped wrongly after replacing a unit send receipts to the wrong printer."],
    v: "Swap one receipt printer model for another by changing only the device mapping, and confirm a sale prints correctly with no application change, and a missing device returns an error rather than a hang.",
    dep: ["operating-system-and-runtime", "peripheral-hub-and-bridge"]
  },
  "peripheral-hub-and-bridge": {
    s: "Connects devices on a tablet or browser-based register, where the app cannot talk to hardware directly, through a small local service or hub.",
    d: "A hub on the local network or the device exposes a local interface that the application calls to print, open drawers and read scanners. It holds device drivers and connection state and queues jobs. Several registers can share one printer through it. Pairing and trust must be set up, since anything on the network could issue commands. It is hard because it is another moving part: the hub must stay running, be updated, and be secured, and a failure takes all its devices down at once.",
    k: ["Local bridge on the register versus a shared hub on the network: a local bridge isolates each register, while a hub shares printers and reduces hardware cost.", "Cloud-routed print jobs versus local-only: cloud routing works from anywhere and adds latency and an internet dependency to every receipt."],
    p: ["An unauthenticated local interface lets any device on the store Wi-Fi open the cash drawer.", "A bridge that silently queues jobs when the printer is offline later prints a stack of old receipts."],
    v: "Pair a tablet to the hub, print from two registers at once, and confirm both receipts print in order, and that an unpaired device's request to open the drawer is rejected.",
    dep: ["device-abstraction-layer", "network-and-connectivity", "device-enrollment"]
  },
  "receipt-printer-driver": {
    s: "Sends the composed receipt to a thermal printer, tracks its status such as paper out, cover open and offline, and reports success or failure to the sale.",
    d: "The driver converts the receipt content to the printer's command language, including fonts, alignment, graphics, barcodes and cutting. It reads status bytes before and after the job to detect paper-low, cover-open and buffer-full conditions. Jobs are queued and retried on recoverable errors. It is hard because many printers claim compatibility with a command set yet differ in code pages, graphics handling and status reporting, and a failed print must not lose the receipt.",
    k: ["Text mode with built-in fonts versus rendered images: text is fast and sharp, while images support any language and logo at the cost of speed and memory.", "Print before payment completes versus after: printing after is correct, while printing early speeds checkout and risks a receipt for an unpaid sale."],
    p: ["Reporting success when the job merely reached the buffer hides a paper-out printer.", "A wrong code page prints currency symbols and accented names as garbage."],
    v: "Print a sale with a long item name, accented text and a barcode, then remove the paper mid-job, and confirm the driver reports paper out, keeps the receipt, and reprints the full receipt after reloading.",
    dep: ["device-abstraction-layer", "printer-command-sets", "receipt-composer"]
  },
  "printer-command-sets": {
    s: "The byte-level languages thermal printers understand for text, graphics, barcodes, cutting and drawer pulses, which the driver generates for each model family.",
    d: "Command sets are sequences of control codes. Common families overlap and extend each other, with variants for code pages, graphics modes and status requests. A table of printer capabilities describes widths, supported features and quirks. Some printers instead render a page description. It is hard because of the long tail of near-compatible models: a feature that works on one device prints blank or garbage on another, and capabilities are rarely discoverable by the driver.",
    k: ["Capability table per model versus probing the printer: a table is predictable and testable, but needs updating for each new model, while probing adapts and rarely works reliably.", "Generate commands directly versus a shared rendering library: direct generation is lean and exact, while a library speeds support at the price of a dependency."],
    p: ["Assuming one family's graphics command on a clone prints a long strip of garbage and wastes paper.", "Drawer pulse timing set for one drawer fails to open another model reliably."],
    v: "Run a standard test page covering every font, code page, barcode and cut mode on each supported printer model, and compare the output against the reference print.",
    dep: ["receipt-printer-driver"]
  },
  "cash-drawer-control": {
    s: "Opens the drawer on cash tender or on permitted no-sale actions and reports its open or closed state, so every opening is accounted for.",
    d: "The drawer is usually triggered by a pulse sent through the receipt printer or a direct port. A sensor, if fitted, reports whether it is open. The application opens it on cash payments and on authorized events, and logs every opening with the reason. Some stores lock drawers or alarm when left open. It is hard because opening is a trust boundary: a drawer that can be opened by anything but a logged event creates untraceable cash movements.",
    k: ["Open only on logged events versus manual key access: logged openings keep cash accountable, while key access is a necessary backup that bypasses the system.", "Drawer driven by the printer versus its own port: printer-driven needs no extra cable, but fails when the printer is down."],
    p: ["A no-sale button available to any cashier lets them open the drawer with no record or reason.", "A drawer left open after a sale blocks the next customer and invites theft."],
    v: "Complete a cash sale and a no-sale, and confirm the drawer opens for each, both are logged with cashier and reason, and the open-too-long alarm fires after the configured time.",
    dep: ["device-abstraction-layer", "audit-trail", "tender-manager"]
  },
  "label-and-ticket-printing": {
    s: "Prints shelf labels, price tags, parcel and pickup tickets and kitchen or order tickets on dedicated printers, from the same item and order data.",
    d: "Label printers use their own languages and media sizes. Templates place item name, price, code and promotion text, and batches are generated when prices change so shelf labels match the register. Order tickets route to stations by item or course. It is hard because the output is physical and time-bound: a changed price needs a changed label at the same time, and an order ticket that fails to print is a customer waiting for food that was never started.",
    k: ["Print labels centrally and ship versus at the store: central printing is consistent, while in-store printing is immediate and risks mismatch.", "Route tickets by a rule table versus by item flags: rules are flexible per store, while flags keep routing with the product and need careful setup."],
    p: ["A shelf label updated a day after the register price creates price-integrity complaints and legal exposure.", "A kitchen printer out of paper silently drops orders unless the failure is shown on the register."],
    v: "Change an item price, print the label batch, and confirm the label matches the register price and promotion text; send an order to an offline kitchen printer and confirm the cashier sees an alert.",
    dep: ["device-abstraction-layer", "price-books", "printer-command-sets"]
  },
  "device-health-monitoring": {
    s: "Watches devices for faults and degradation, such as low paper, failed reads and offline readers, and alerts staff and head office before they stop trade.",
    d: "Each driver reports status and counters. A monitor on the register and a central service collect them, apply thresholds, raise tickets or warnings and show per-store device status. Predictive signals include rising decode failures or reconnect counts. The register also shows plain-language messages to the cashier. It is hard because alert fatigue is real: too many warnings are ignored, and a device that fails silently, such as a scanner that scans but sends nothing, shows no fault at all.",
    k: ["Alert on every fault versus only service-impacting ones: alerting on all gives complete data, while filtering keeps staff attentive to what matters.", "Poll devices versus rely on events: polling finds silent failures, while events are cheap and miss devices that die without a message."],
    p: ["A card reader offline for days is noticed only when customers are turned away.", "A printer near paper end reports healthy right until the receipt is half-printed."],
    v: "Disconnect a scanner and a printer in a test store, and confirm the register shows a clear message, the central dashboard lists both within one minute, and they clear when reconnected.",
    dep: ["device-abstraction-layer", "logging-and-telemetry", "remote-device-management"]
  },
});
