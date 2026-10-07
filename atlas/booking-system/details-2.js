// Details for the booking system plate, part 2: notifications, operations, pricing, policies, waitlists.
ATLAS.details("booking-system", {
  "confirmation-messages": {
    s: "The message sent right after a booking is committed, stating what was booked, when, the price, the rules that apply and how to change it.",
    d: "A confirmation is triggered by the commit event, not by the web page, so it is sent even if the guest closes the browser. It is rendered from the stored booking and price breakdown, and includes the reference, venue address, arrival instructions, cancellation terms and a link to manage the booking. It is the guest's proof, so it must be accurate and arrive quickly. The hard part is exactly-once intent: a retry should not send two, and a failed delivery should be noticed.",
    k: ["Send from the commit event vs from the web request: events guarantee a message for every channel's bookings, while request-time sending misses partner and staff bookings.", "Plain summary vs full terms in the message: full terms settle disputes later but are long and ignored; links are short but can change after the fact."],
    p: ["The message is rendered from current policy rather than the booking's stored terms, so it misstates what the guest agreed to.", "A bounce on a mistyped address goes unnoticed, and the guest arrives with no confirmation."],
    v: "Commit a booking through each channel and confirm one message per booking arrives within the target time, with figures matching the stored record. Bounce one address and confirm the failure is flagged to staff.",
    dep: ["delivery-channels", "templates-and-localization", "domain-event-log", "booking-record"]
  },
  "reminders": {
    s: "Scheduled messages before the booked time that reduce no-shows, remind guests of arrival details and offer an easy way to confirm or cancel.",
    d: "At confirmation, the system schedules reminders relative to the slot, such as one day and two hours before, computed in the venue's time zone. Each fires through the scheduler, checks that the booking is still active, and sends. Replies can confirm or cancel, freeing the slot for the waitlist. Reminders matter most for businesses with high no-show costs. The difficulty is staleness: a reminder for a canceled or moved booking is worse than none, and thousands may fall due in the same minute.",
    k: ["Schedule at booking time vs compute reminders in a periodic sweep: scheduling is precise but must be rescheduled on every change; sweeps tolerate changes but run late and in bursts.", "Reply-to-cancel vs link-only cancellation: replies are easy and free slots earlier, but are ambiguous to parse and easy to trigger by mistake."],
    p: ["A moved booking keeps its old reminder time and the guest is told the wrong hour.", "A reminder goes out for a canceled booking because the active check was skipped for speed."],
    v: "Create bookings, then move one and cancel another. Verify that reminders fire at the correct venue-local times for the first, at the new time for the moved one, and not at all for the canceled one.",
    dep: ["scheduler-and-timers", "templates-and-localization", "delivery-channels", "booking-state-machine"]
  },
  "templates-and-localization": {
    s: "The store of message layouts and wording per event, language and tenant, filled with booking data, with versioning and previews.",
    d: "Each notification type has templates per language and brand, with placeholders for names, dates, prices and links. Dates, currencies and plurals follow the guest's locale, while times are shown in the venue's zone with the zone named. Tenants edit wording within limits, and legally required text is locked. The hard part is correctness of data in many languages and the danger of changing a template and silently breaking every message of that type.",
    k: ["Tenant-editable templates vs fixed system wording: editing fits each brand, but invites broken placeholders and removed legal text; fixed text is safe but generic.", "Translate whole templates vs compose from phrases: whole templates read naturally but multiply maintenance; phrases reuse work but produce awkward grammar."],
    p: ["A template edit removes the cancellation terms from every confirmation sent afterward.", "A date formatted in the server's locale shows the day and month swapped for part of the audience."],
    v: "Render every template for a sample booking in each supported language and zone, and check names, dates, amounts and links against the record. An edit that drops a required block must be rejected.",
    dep: ["tenant-configuration", "time-and-timezones"]
  },
  "delivery-channels": {
    s: "The adapters that actually send messages by email, SMS, push or chat, track delivery status and fall back or retry when one fails.",
    d: "Each channel has its own provider, limits, costs and failure signals. The adapter takes a rendered message, sends it through the provider, records delivery, bounce or complaint callbacks, and retries transient failures. Policy chooses the channel: transactional messages go by the most reliable one and may fall back to another. Sending is queued so booking never waits on a provider. The difficulty is knowing a message arrived, since delivery receipts are partial and delayed.",
    k: ["One provider per channel vs multiple with failover: one is simpler and cheaper, but an outage means silence; failover adds reliability and the risk of duplicates.", "Send inline during commit vs from a queue after commit: inline is simple but couples booking to provider uptime; queues decouple, at the cost of a small delay."],
    p: ["Retries after a timeout produce duplicate messages because the provider had actually accepted the first.", "A provider outage fills the queue and delays reminders past the time they were useful."],
    v: "Send a test confirmation through each channel while the provider is made to fail once. Exactly one message should be delivered, with the retry visible in the status log and a delivery or bounce result recorded.",
    dep: ["outbox-and-queues", "contact-preferences", "rate-limiting-and-quotas"]
  },
  "calendar-invites-and-tickets": {
    s: "Attachments that go with a booking: a calendar event in the standard iCalendar format, and a ticket or pass with a scannable code.",
    d: "A calendar file lets the guest add the booking to their own calendar with the correct local time, location and a link to manage it. Updates and cancellations should reissue the event with the same unique identifier and a higher sequence number, so calendars change instead of duplicating. Tickets carry a code tied to the booking and sometimes a wallet pass. The hard parts are time zone encoding, client differences in handling updates, and revoking a ticket that has been shared.",
    k: ["Event with stable identifier and sequence numbers vs a new event each time: stable updates in place but depends on client support; new events always work but leave stale entries.", "Static code vs rotating code: static is simple and works offline, while rotating resists screenshots but needs the app and a clock."],
    p: ["A changed booking sends a new invite with a fresh identifier, and the guest's calendar shows both times.", "Floating times without a zone put the event in the wrong hour for guests in another place."],
    v: "Add an invite to two different calendar clients, then reschedule and cancel the booking. Each calendar should update the single event, not add copies, and show the venue-local time correctly.",
    dep: ["time-and-timezones", "booking-record", "delivery-channels"]
  },
  "contact-preferences": {
    s: "The record of how and whether each guest may be contacted: channel choices, language, quiet hours and consent for non-essential messages.",
    d: "Transactional messages about a booking are allowed, while marketing needs consent. Preferences store verified addresses and numbers, language, and opt-outs per type and channel. They are checked at send time, not just at booking, since guests change their minds. The hard part is the line between a necessary notice, like a venue closure, and promotion, and keeping preferences consistent across partner bookings where the partner may hide the guest's real email.",
    k: ["Check preferences at send time vs at enqueue: send time respects late opt-outs; enqueue time is simpler but can message someone who just unsubscribed.", "Per-type, per-channel consent vs a single marketing flag: fine-grained meets regulation and expectations, at the cost of a larger model and interface."],
    p: ["A relay address from a partner is stored as the guest's email, and later messages never reach them.", "A promotional offer is sent as part of a reminder, breaking consent rules."],
    v: "Opt a test guest out of marketing but not booking notices, trigger both kinds, and confirm only the booking notice is sent. Change the language preference and confirm the next message uses it.",
    dep: ["guest-profiles", "consent-and-data-requests"]
  },

  "daily-operations-views": {
    s: "The operational screens for today: arrivals, departures, manifests, sold and open counts, occupancy by resource and items needing attention.",
    d: "Staff run the day from lists derived from bookings: who arrives when, what each needs, which resources are free, and what is unpaid or flagged. The views read from projections that update as bookings change, so they stay fast under load. They print or export for people without devices, such as kitchen sheets and driver manifests. The hard part is trust: if a view is minutes stale, staff stop using it, and a missing booking on a manifest becomes a real person turned away.",
    k: ["Live query on the booking store vs a maintained projection: live is always correct but competes with booking traffic; projections are fast and isolated but can lag.", "One view for everyone vs role-specific views: shared views avoid disagreement, while role views hide irrelevant detail and sensitive data."],
    p: ["A late change appears in the booking record but not on a printed manifest, and the guest is not expected.", "Views show guest details to staff who do not need them."],
    v: "Make five changes to bookings for tomorrow, including a cancellation and a move, and compare the manifest with the booking store. They should match, and the lag between the change and the view should be within the stated target.",
    dep: ["read-model-projections", "roles-and-permissions", "booking-record"]
  },
  "manual-overrides-and-blocks": {
    s: "Staff powers to close or reduce inventory, hold units back, force a booking past a rule, or reassign a guest, each with a reason and expiry.",
    d: "Real operations break the model: a room is out of service, a table is saved for a regular, a group needs an exception. Blocks remove units from sale without deleting them, and overrides let an authorized person approve something rules would refuse. They write to the same ledger as bookings so counts stay honest. The hard part is visibility: a forgotten block silently reduces sales, and an unrecorded override makes later disputes impossible to resolve.",
    k: ["Blocks as special bookings vs a separate flag on the resource: special bookings reuse the ledger and conflict logic; flags are simple but need their own overlap handling.", "Override with required reason vs free override: reasons cost seconds and give an audit trail; free overrides are faster and are quickly abused."],
    p: ["A maintenance block is added without an end date and removes a room from sale for months.", "An override pushes a booking through, and the channel feed is not updated so partners keep selling the unit."],
    v: "Block a unit for next week and confirm it disappears from search and every channel, then let the block expire and confirm it returns. Every override should show who, when, why and which rule.",
    dep: ["availability-ledger", "roles-and-permissions", "audit-trail", "restriction-rules"]
  },
  "reporting-and-forecasting": {
    s: "Reports on bookings, revenue, occupancy and sources, plus forecasts of future demand and cancellations used for pricing and overbooking decisions.",
    d: "Reports are built from event history and read models, not by querying live tables: bookings made, bookings staying, revenue by stay date versus booking date, lead time, channel mix and cancellations. Forecasts combine pace against history, seasonality and events to predict final occupancy. They feed pricing and overbooking limits. The hard part is definitions: revenue recognized at booking, at stay or at payment gives different totals, and forecasts mislead when behavior shifts.",
    k: ["Report on booking date vs stay date: booking date shows sales performance, stay date shows operational reality; most businesses need both and clearly labeled.", "Simple pace-based forecast vs statistical model: pace is explainable and robust to little data, while models capture more but fail oddly on unusual periods."],
    p: ["Reports mix net and gross figures and different time zones, and finance and operations quote different numbers.", "A forecast trained before a pricing change keeps predicting the old behavior."],
    v: "Pick one stay date and reproduce its booked count and revenue from raw events by hand, then compare with the report. Compare last month's forecast to what happened and record the error.",
    dep: ["read-model-projections", "domain-event-log", "no-show-tracking"]
  },
  "no-show-tracking": {
    s: "The record of which bookings were used, canceled late or abandoned, by customer, channel and slot, used for policy, fees and overbooking limits.",
    d: "At the end of each slot, bookings that were not checked in become no-shows, after a grace period and any staff correction. The system stores the outcome with its context: lead time, channel, party size, price and customer history. The data feeds penalties, deposit requirements and the overbooking rate. The hard part is accuracy: unscanned arrivals look like no-shows, and stricter policies change behavior, so past rates stop predicting the future.",
    k: ["Automatic no-show after a grace period vs staff mark: automatic is complete and consistent, but wrong when staff skip check-in; staff marking is accurate but incomplete.", "Per-customer scores vs aggregate rates: scores target repeat offenders but raise fairness and privacy issues; aggregates are simple and neutral."],
    p: ["Guests who arrived but were never scanned are charged a fee and then dispute it.", "The overbooking limit is set from a no-show rate measured under a looser policy."],
    v: "Run a day with known arrivals and absences, including a late scan, and confirm the no-show list contains exactly the absent bookings and no one who arrived within the grace period.",
    dep: ["check-in-and-fulfillment", "booking-state-machine", "no-show-penalties"]
  },
  "bot-and-abuse-protection": {
    s: "Controls that tell people from scripts and stop inventory hoarding, scraping, scalping and card testing without blocking real customers.",
    d: "Abuse shows up as many holds that never convert, high-rate searches, bulk purchases of scarce slots, and small test charges. Defenses layer: rate limits per address and account, challenges on suspicious sessions, hold limits per customer, device and behavior signals, and payment risk scoring. Rules adapt as attackers do. The hard part is balance: a strict rule blocks a family booking from a shared network, while a loose one lets a script take every table.",
    k: ["Challenge suspicious sessions vs block them: challenges keep real people in with some friction; blocks are final and wrongly end real customers' attempts.", "Limit per account vs per payment instrument: account limits are easy to evade with new accounts; instrument limits are harder to dodge but affect shared cards."],
    p: ["Hold limits are tied to sessions, so a script avoids them by clearing cookies.", "An aggressive rule blocks a corporate network and every employee fails to book."],
    v: "Replay a scripted attack of repeated holds and rapid searches against a test environment and confirm throttling engages and holds are capped, while a normal user flow from the same address completes.",
    dep: ["rate-limiting-and-quotas", "inventory-hold", "payment-authorization", "virtual-waiting-room"]
  },
  "support-tools": {
    s: "Internal tools that let support find a booking from partial information, see its full history and fix problems: resend messages, correct details, refund, or move a guest.",
    d: "Support starts with a name, email, phone or partner reference and needs one view of the booking: price breakdown, payment state, messages sent, channel, changes and the audit trail. From there, permitted actions run through the standard lifecycle flows rather than editing data. Sensitive fields are masked unless needed. The challenge is correctness under pressure: a direct database fix for an angry guest breaks invariants, and a view that shows too little prolongs every call.",
    k: ["Actions through normal flows vs direct data edits: flows keep money, inventory and messages consistent but cannot do everything; direct edits are flexible and dangerous.", "Full search across fields vs reference-only lookup: broad search speeds support but exposes more personal data to more people."],
    p: ["A support edit changes the booking but not the payment record, leaving them in conflict.", "Staff export guest lists for convenience and the files outlive any access controls."],
    v: "Locate a test booking by phone fragment, resend its confirmation, move it and refund a fee. Each action should appear in the audit trail, with money and inventory consistent afterward.",
    dep: ["audit-trail", "booking-record", "roles-and-permissions", "amendment-flow"]
  },

  "rate-plans": {
    s: "The named price structures for a product: base rates by date and unit, with variants such as flexible, non-refundable, member or package, each carrying its own conditions.",
    d: "A rate plan ties a price to rules: refund terms, required prepayment, minimum stay, who may buy it and what is included. Prices vary by date, day of week and occupancy, and plans can derive from others, for example a member plan at ten percent below flexible. Search shows the plans that apply, and the booking stores which one was bought. The hard part is combinatorics: plans, restrictions and channels multiply, and a change to a base rate must correctly ripple to derived ones.",
    k: ["Derived plans calculated from a base vs independent plans with their own prices: derived keeps plans consistent with less data entry; independent allows full control and drifts.", "Rules attached to the plan vs rules at the resource: plan-level rules sell variants of one product, while resource rules apply to every purchase of that unit."],
    p: ["A base rate update rewrites derived plans and silently changes the price of a promotion that was meant to stay fixed.", "A restricted plan appears in partner feeds without its restrictions."],
    v: "Change a base price and check that each derived plan updates as defined. Book each plan type and confirm the stored plan, conditions and charged amount match what the search displayed.",
    dep: ["restriction-rules", "cancellation-policies", "resource-catalog"]
  },
  "dynamic-pricing": {
    s: "Adjusts prices automatically from demand, remaining inventory, lead time, events and competitor signals, within limits set by the business.",
    d: "A pricing engine reads pace of booking, remaining units and forecasts and moves price up or down along a bounded curve, or recommends changes that a person approves. It writes the results as rate overrides by date, so search and channels use one source. Limits prevent extremes. The difficulty is feedback and trust: price changes shape demand and so change the data that guides them, and a bug can price a whole season at a floor in minutes.",
    k: ["Automatic changes vs recommendations for approval: automatic reacts in minutes and scales; approval catches errors but is slow and often skipped under volume.", "Rule-based curves vs learned models: rules are explainable and bounded; models find patterns but are harder to audit and fail on unusual events."],
    p: ["A data glitch reports zero availability and the engine raises the price of a hundred slots to the cap.", "Price changes reach channels at different times, so partners sell at stale prices for hours."],
    v: "Replay a demand scenario against a test calendar and confirm prices move as designed and stay within floor and ceiling. Inject bad inventory data and confirm a guardrail stops the change.",
    dep: ["reporting-and-forecasting", "rate-plans", "availability-ledger", "availability-rate-push"]
  },
  "taxes-and-fees": {
    s: "Calculates mandatory and optional charges added to a base price: sales and occupancy taxes, service fees, resort or cleaning fees, with jurisdiction rules and display requirements.",
    d: "Taxes depend on place, product, length, guest type and sometimes channel, and may be percentages, flat amounts or tiered by duration. Fees may be per unit, per person or per stay. The engine computes each as a separate line with its basis and rounding rule so receipts and refunds can reproduce them. Regulations also decide whether prices are shown with or without them. The challenge is that rules change by date and place, and partial refunds must reverse the right parts.",
    k: ["Taxes calculated by the engine vs by an external tax service: in-house gives control and speed; external keeps up with changing rules for a fee and a dependency.", "Show all-in prices vs add at checkout: all-in is honest and increasingly required; add-on looks cheaper but triggers distrust and legal risk."],
    p: ["Rounding per line and per total differ, so receipts do not match the charge by a cent.", "A tax rule changes mid-year and old bookings are recalculated instead of keeping the rate they were sold under."],
    v: "Price a sample of stays across jurisdictions and durations, compare each line to a hand calculation, then refund part of one and confirm the tax and fee reversal matches the policy.",
    dep: ["price-quote-and-lock", "currency-and-display", "refunds-and-credits"]
  },
  "promotions-and-codes": {
    s: "Discounts, bundles and codes applied at quote time, with eligibility, usage limits, stacking rules and expiry.",
    d: "A promotion defines a benefit and the conditions: dates of booking and stay, products, minimum spend, audience and a limit on total or per-customer uses. The pricing step checks applicability, applies the best or stacked set according to rules and records which promotion applied. Redemption must be counted atomically so a limited code cannot be over-used. The challenge is interaction: stacking, partner channels with their own offers, and refunds that must undo only the discounted amount.",
    k: ["Best single promotion vs allow stacking: single is predictable and cheap to evaluate; stacking is flexible but can drive prices below cost in unplanned combinations.", "Count redemptions at hold vs at confirmation: at hold prevents overuse but burns codes on abandoned carts; at confirmation is accurate but can exceed the limit."],
    p: ["A limited code is shared online and redeemed far beyond its quota because counting was not atomic.", "A refund returns the full price paid at the original rate instead of the discounted amount."],
    v: "Redeem a code with a limit of ten from fifty concurrent sessions and confirm exactly ten succeed. Apply stacking combinations and confirm the final price matches the defined rule order.",
    dep: ["rate-plans", "price-quote-and-lock", "guest-profiles"]
  },
  "currency-and-display": {
    s: "Handles prices in more than one currency: base currency, conversion rates, rounding, and what the guest sees versus what is charged and settled.",
    d: "A business sets prices in one currency, then shows or charges others using rates that may refresh daily or at quote time. The booking stores the amount, currency and the rate used. Charging in the guest's currency avoids their bank's conversion, while settlement happens in the business's currency, so exchange differences must be tracked. The hard parts are rounding, price endings, partial refunds across rates, and showing an approximate figure that differs from the final charge.",
    k: ["Fixed local prices per market vs live conversion: fixed prices are stable and marketable but need maintenance; live conversion is automatic and moves daily.", "Refund at the original rate vs the current rate: original returns what was paid, shifting exchange risk to the business; current is simpler but surprises the guest."],
    p: ["A quote in one currency is charged in another at a different rate and totals mismatch by more than rounding.", "A rate cache goes stale during a currency swing, and the business sells below cost."],
    v: "Quote and book the same stay in three currencies and verify the stored amount, rate and charge agree. Refund one after the rate changes and confirm the refund follows the documented rule.",
    dep: ["price-quote-and-lock", "capture-and-settlement"]
  },
  "price-quote-and-lock": {
    s: "Computes the full price for a chosen slot and options, and fixes it for the length of the hold so what the guest sees is what they pay.",
    d: "At hold time the quote combines base rate, plan, extras, taxes, fees and promotions into a line-by-line breakdown, stored with a version of the rules used. The guest pays that figure even if rates change during checkout. After confirmation, the breakdown is the reference for receipts, amendments and refunds. The hard part is expiry and drift: how long a quote stays valid, what happens when options change mid-flow, and keeping partner quotes consistent with the direct site.",
    k: ["Lock the price for the hold duration vs reprice at payment: locking is fair and predictable but exposes the business to a stale price; repricing is safe but surprises guests.", "Store the breakdown vs the inputs to recompute: breakdown is immutable and auditable, while inputs are smaller and open to silent change."],
    p: ["A quote outlives its hold and is honored at an old rate after the slot has been repriced.", "Extras added late recompute everything instead of adding to the locked quote, changing taxes unexpectedly."],
    v: "Start a checkout, change the rate in the back office, then complete payment. The charge must equal the quote shown at the start, and the stored breakdown must list each line with its rule version.",
    dep: ["rate-plans", "taxes-and-fees", "promotions-and-codes", "inventory-hold"]
  },

  "restriction-rules": {
    s: "Conditions on when a slot can be bought: minimum or maximum stay, advance purchase, closed to arrival, cutoffs, blackout dates and day-of-week limits.",
    d: "Restrictions are set by date range, product, rate plan and channel, and evaluated during search and again at hold. They protect revenue and operations: a minimum stay avoids unsellable single nights, a cutoff avoids last-minute arrivals the staff cannot serve. Because they apply to the booking as a whole, a multi-night stay must satisfy each night's rules. The challenge is rule overlap and clear error messages, so a guest learns why something is unavailable and what would work.",
    k: ["Evaluate rules at search and again at booking vs only at booking: both give accurate results and consistent errors; booking only is cheaper but shows unbookable options.", "Rules stored as structured data vs code: data lets operators change them safely and sync to channels; code is flexible and hidden from non-engineers."],
    p: ["Search ignores a closed-to-arrival rule and offers stays that fail at checkout.", "A channel feed omits the restriction, so partners sell stays the business refuses."],
    v: "Set a two-night minimum on a date range and test one-night and three-night searches across it and across its boundary on each channel. Each result and refusal reason should match the rule.",
    dep: ["schedules-and-exceptions", "rate-plans", "tenant-configuration"]
  },
  "eligibility-and-party-rules": {
    s: "Rules about who may book and what the party must look like: age limits, group size, accompanying adults, member-only products and required documents.",
    d: "Some products can only be bought by certain people or require specific details: a child must be accompanied, a license must be shown, a class has a minimum age, a rate is for residents. The booking flow collects the needed fields and evaluates them against the product's rules at hold time and again at check-in. The hard part is that eligibility depends on data at the time of the event, such as age on the day, and that errors discovered at arrival cannot be fixed.",
    k: ["Validate at booking vs at arrival only: booking-time checks prevent turning guests away on site, while arrival checks catch false claims; both are used when stakes are high.", "Collect details at booking vs later: early details prevent surprises but add friction; later collection lifts conversion and shifts work to arrival."],
    p: ["Age is checked at booking date, not on the day of the event, and an eligible child turns ineligible by arrival.", "Party size is enforced by number of tickets while the venue's rule counts accompanying children differently."],
    v: "Attempt bookings with a minor alone, over the group limit and with a wrong age on the event date. Each should be refused or flagged with a specific reason, and a valid party should pass.",
    dep: ["party-and-traveler-details", "restriction-rules", "capacity-and-units"]
  },
  "cancellation-policies": {
    s: "The terms for canceling or changing a booking: free until a cutoff, then a fee or no refund, defined per rate plan and shown before purchase.",
    d: "A policy is a schedule of time windows relative to the slot, each with a penalty: a percentage, a number of nights, the deposit or the full price. It is attached to the rate plan, copied into the booking at purchase, and applied by the cancellation flow and the refund calculation. Some policies treat changes like cancellations. The hard parts are unambiguous wording in the guest's language, time zones for cutoffs, and exceptions for events such as closures, illness or a venue's own cancellation.",
    k: ["Copy the policy into the booking vs reference the current policy: copying honors what was sold and is auditable; referencing is smaller and changes old terms silently.", "Fixed windows vs graduated schedules: windows are simple to explain and enforce; graduated schedules are fairer and harder to display and compute."],
    p: ["A venue edits a policy and it applies to existing bookings, creating a legal dispute.", "The cutoff is evaluated in the server's time zone and a guest is charged though canceling inside the free period."],
    v: "Cancel identical bookings an hour before and after each cutoff, in a different zone from the venue. The fee and refund for each must match the schedule stored with that booking.",
    dep: ["time-and-timezones", "rate-plans", "refunds-and-credits"]
  },
  "overbooking-policy": {
    s: "The deliberate rule for selling more than physical capacity, how much, for which slots, and what to do for the guests who cannot be served.",
    d: "Overbooking offsets expected cancellations and no-shows. The policy sets a limit per product and date, informed by history and forecasts and tightened near the date as uncertainty falls. Allocation to channels must respect it. If too many arrive, the process finds an alternative: upgrade, equivalent unit nearby, compensation. Who is moved is decided by rules such as latest booked, lowest paid or no loyalty status. The challenge is cost asymmetry: an empty unit loses money, a bumped guest costs more.",
    k: ["Static percentage vs forecast-driven limit: static is simple and predictable but wastes in quiet times and overreaches in busy ones; forecast-driven adapts and depends on data quality.", "Compensate and relocate vs refuse to overbook on critical slots: relocation protects revenue; refusal protects trust where there is no substitute."],
    p: ["The limit counts only direct bookings while partners sell on top of it, doubling the real overbooking.", "No relocation partner is arranged beforehand, so each bumped guest becomes an emergency."],
    v: "Simulate arrivals above physical capacity on a test date and confirm the process selects guests by the stated rule, offers the defined alternative and records compensation. Check the sales limit never exceeded the configured value.",
    dep: ["no-show-tracking", "reporting-and-forecasting", "availability-ledger", "capacity-and-units"]
  },
  "no-show-penalties": {
    s: "The charges or consequences for guests who do not arrive: forfeited deposit, a fee on a stored card, or restrictions on future bookings.",
    d: "A no-show is usually decided after a grace period following the start of the slot. The policy states what happens: keep the deposit, charge a percentage or first-night amount, or nothing. Charging uses the stored payment method under the terms accepted at booking. The booking record keeps the evidence that the policy was shown. The challenge is disputes: guests claim they came, were turned away, or never saw the terms, and a chargeback costs more than the fee.",
    k: ["Charge automatically after the grace period vs staff approval: automatic is consistent and quick but amplifies mistakes; approval is slow and catches data errors and exceptions.", "Deposit up front vs card on file for later charge: deposits are guaranteed funds but reduce conversion; card on file converts better and risks declines at charge time."],
    p: ["A fee is charged for a guest who was checked in late, because the check-in event arrived after the sweep.", "Terms accepted at booking are not stored, and a disputed fee is lost for lack of proof."],
    v: "Run a day with one late arrival, one real absence and one absence with an accepted exception, and confirm that fees apply only to the real absence, with the accepted terms attached to the charge.",
    dep: ["no-show-tracking", "payment-authorization", "payment-method-tokens", "cancellation-policies"]
  },
  "group-and-bulk-rules": {
    s: "Special handling for large parties and multi-unit requests: room blocks, deposits, rooming lists, release dates and attrition clauses.",
    d: "Groups reserve many units under one contract, then fill in guest names later. The system holds a block against inventory, with a release date after which unsold units return to the pool and an attrition allowance saying how many may be dropped without penalty. Payment is often by schedule and invoiced to an organizer. Individual guests may book against the block through a code. The challenge is that large blocks distort availability and forecasts, and that changes cascade across many linked bookings.",
    k: ["Block drawn down by individual bookings vs one booking edited with a list: drawdown fits guests booking themselves; one booking suits tours and teams with one payer.", "Release unsold units automatically at cutoff vs after approval: automatic is efficient and strict; approval keeps relationships and risks stranded stock."],
    p: ["A block is released at the cutoff while the organizer is still collecting names, and the guests find no rooms.", "Group prices are applied to individual bookings that should have been charged the normal rate."],
    v: "Create a block with a release date and attrition allowance, book some members and let the date pass. Unsold units should return to the pool, and the billing should match the contract terms.",
    dep: ["channel-allocation", "deposits-and-prepayment", "invoicing-and-receipts", "capacity-and-units"]
  },

  "waitlist-queue": {
    s: "The ordered list of people who want a slot that is currently full, with the request details needed to match them when inventory frees up.",
    d: "A guest joins by giving their criteria: date range, party size, acceptable alternatives. The entry is stored with a timestamp and any priority attributes. It stays valid until the date passes, the guest withdraws or the request is satisfied. The queue is read when release events occur and by staff who want to see pent-up demand. The challenge is scale and accuracy: duplicate entries for the same person, entries whose criteria no longer make sense, and guests who forget they joined.",
    k: ["Per-slot queues vs flexible criteria matching: per-slot queues are simple and predictable; criteria matching fills more demand but needs a search on every release.", "Cap queue length vs unlimited: caps keep promises honest and cheap to manage; unlimited captures demand data and builds false hope."],
    p: ["The same guest joins through three channels and receives three offers for one need.", "A canceled booking frees a slot but the entry's party size no longer fits, and the offer fails."],
    v: "Fill a slot, join five test guests with different criteria and a duplicate, then free the slot. The queue should show one entry per person and the correct candidate order for that slot.",
    dep: ["booking-store", "guest-profiles", "capacity-and-units"]
  },
  "waitlist-priority-rules": {
    s: "The rules that order waiting guests: first come, first served, membership or fare class, party fit, and customer value, with limits that keep the order explainable.",
    d: "When one slot frees, several guests may fit. The order may be arrival time, a loyalty tier, a payment already on file, or how well the party fills the opening. Rules must be stated to guests and applied consistently. Some systems let the venue promote a person manually. The hard part is fairness and perception: priority for paying customers feels reasonable to some and unfair to others, and complex rules make a missed offer impossible to explain.",
    k: ["Strict arrival order vs scored priority: arrival order is trivially explainable and fair-looking; scoring optimizes revenue or fit and invites disputes.", "Allow staff to reorder vs forbid manual changes: reordering handles special cases, but erodes trust and needs an audit trail."],
    p: ["Priority rules favor large parties, so singles never receive an offer for slots they could fill.", "Manual promotions are not logged, and a guest complains about being skipped with no way to check."],
    v: "Put a set of test guests in the queue with different tiers and arrival times, release a slot, and confirm the offer goes to the person the written rule selects, with the reason recorded.",
    dep: ["waitlist-queue", "loyalty-and-credits", "audit-trail"]
  },
  "offer-and-claim-window": {
    s: "The time-limited offer sent to the next waiting guest when a slot frees up, held for them briefly, then passed on if unclaimed.",
    d: "When a match is found, the system places a hold on the freed inventory for the guest and sends an offer with a deadline. If the guest claims within the window, the normal booking flow completes with payment. If not, the hold expires and the next person is offered. Windows are short for near dates and longer for far dates. The difficulty is the cascade: long windows slow the chain, short ones favor people watching their phones, and a freed slot near the event may leave no time at all.",
    k: ["Exclusive hold per offer vs broadcast to several with first claim wins: exclusive is fair and slow; broadcast fills fast but disappoints those who lose the race.", "Fixed window vs window shrinking toward the event date: fixed is simple; shrinking balances fairness and filling the slot before it is wasted."],
    p: ["The offer message arrives after the window has already expired because of a delivery delay.", "An unclaimed hold is not released on time and the slot stays blocked from everyone."],
    v: "Release a slot, let the first offer expire and the second be claimed. Confirm one booking, that the third guest got nothing, and that hold, offer and expiry times are consistent in the log.",
    dep: ["inventory-hold", "scheduler-and-timers", "delivery-channels", "waitlist-priority-rules"]
  },
  "release-matching": {
    s: "The step that reacts to freed inventory from cancellations or new capacity and finds waiting requests that fit it.",
    d: "A cancellation, block removal, expired hold or added capacity creates a release event. The matcher looks for waitlist entries whose criteria fit the freed units and chooses by the priority rules. It must act quickly, since freed inventory is also visible to regular search, and ordinary buyers may take it first. Some systems reserve freed units for the queue for a short time. The challenge is races between direct buyers and the waitlist, and avoiding repeated offers for slots a guest already declined.",
    k: ["Reserve freed units for the waitlist first vs open to everyone immediately: reserving serves queued guests and delays sales; opening sells fastest and makes the queue meaningless.", "Match on every release event vs in periodic batches: events react at once but run often; batches smooth load and let one slot serve the best combined fit."],
    p: ["A freed slot is bought directly a second before the matcher runs, and the first queued guest is told nothing.", "Matching ignores partner channel restrictions and offers inventory the guest's channel cannot sell."],
    v: "Cancel a booking on a slot with a queue and with live direct search active. The queued guest should be offered the slot first, according to the configured reservation window, and the log should show the match decision.",
    dep: ["waitlist-queue", "availability-ledger", "domain-event-log", "offer-and-claim-window"]
  },
});
