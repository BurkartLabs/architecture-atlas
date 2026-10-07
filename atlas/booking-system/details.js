// Details for the booking system plate, part 1: cross-cutting concerns, front ends, channels.
ATLAS.details("booking-system", {
  "consistency-and-oversell-risk": {
    s: "The decision about how strictly the same unit of inventory is protected from being sold twice, and what the business does in the rare case that it is.",
    d: "Some businesses can never sell a unit twice, such as a numbered seat or a single appointment slot. Others deliberately sell more than they have, because a fraction of customers cancel or do not show up. The choice sets the design: hard limits need serialized access to each count, while overbooking needs a policy for who gets bumped, what compensation costs, and how it is reported. Every channel and cache must also honor the same choice, or the strictest rule is defeated by the loosest copy.",
    k: ["Hard limits vs controlled overbooking: hard limits give clean customer promises but leave revenue on the table; overbooking raises revenue but needs compensation, walk-away handling and bad-day tolerance.", "Strong consistency vs eventual consistency per channel: strong prevents conflicts but slows distribution; eventual scales but must resolve collisions after the fact."],
    p: ["Teams declare hard limits for the direct site while a partner feed quietly allows oversell, so the promise is false in practice.", "Overbooking limits are set from average no-show rates, then a holiday with unusual behavior strands dozens of guests."],
    v: "Fire many concurrent requests for the last unit from direct and partner paths and count confirmed bookings afterward. The count must equal the limit the policy allows, never more.",
    dep: ["double-booking-prevention", "overbooking-policy"]
  },
  "time-and-timezones": {
    s: "The rules for representing when a slot happens: local wall time at the venue versus absolute instants, daylight saving shifts, durations, and what a date means to a guest in another zone.",
    d: "A booking is for a place at a local time, so the venue's zone is part of the data, not the guest's. Storing only absolute instants breaks recurring schedules across daylight saving changes: a nine o'clock appointment must stay at nine. Nights, check-in days and slot boundaries are calendar concepts, not 24-hour spans. Every message, report and cutoff, such as free cancellation until 48 hours before, needs a stated zone and a stated meaning of day.",
    k: ["Venue-local wall time plus zone vs absolute instants: wall time keeps recurring schedules stable, but instants make ordering and duration math simple; most systems store both.", "One tenant-wide reporting zone vs per-venue zones: simpler totals, but days roll over at the wrong hour for some venues."],
    p: ["A recurring weekly slot shifts by an hour after a daylight saving change because it was stored as a fixed offset.", "A cancellation deadline computed in the server's zone expires hours early or late for the venue."],
    v: "Create a weekly 9:00 appointment across both daylight saving transitions and confirm it appears at 9:00 venue time in the calendar, in the confirmation message and in the cancellation cutoff.",
    dep: ["time-slot-model", "time-source-and-clock-skew"]
  },
  "idempotency-and-retries": {
    s: "The guarantee that repeating a request, because of a timeout, double click or message redelivery, leaves the system in the same state as running it once.",
    d: "Networks fail between the action and the acknowledgement, so callers retry, and queues deliver at least once. A booking system must make every mutating step safe to repeat: holds, confirmations, charges, refunds and notifications. This is done by client-supplied keys stored with the result, by natural unique constraints on booking references, and by state checks on transitions. The difficulty is that one booking touches several systems, each needing its own repeat protection.",
    k: ["Client-generated idempotency keys vs server-side duplicate detection: keys are exact but require client cooperation; content matching works with any client but guesses wrongly on legitimate repeats.", "Retrying inside a transaction vs retrying whole requests: whole-request retries are simpler to reason about but repeat external calls unless those are also keyed."],
    p: ["A retried confirmation after a timeout creates a second booking and a second charge.", "A key is cached too briefly, so a slow client retry after expiry is treated as a new request."],
    v: "Send the same confirmation request ten times with one key, including simultaneously, and verify one booking, one payment and one confirmation message exist, with identical responses returned.",
    dep: ["idempotent-booking-requests", "outbox-and-queues"]
  },
  "peak-demand-and-fairness": {
    s: "The plan for sudden bursts of demand, such as an on-sale, a holiday opening or a viral table: who gets inventory, in what order, and how the system stays up.",
    d: "Demand is often a spike over a few seconds on a few units. First-come-first-served on raw requests rewards bots and fast connections. Systems add queues, admission limits, per-customer caps and randomized draws, and they protect the booking core by shedding load at the edge. Whatever is chosen must also decide what happens to abandoned holds and how quickly freed inventory returns to the pool, since that is where bursts turn into thrash.",
    k: ["Arrival-order queue vs random draw among entrants: queues feel fair but reward automation; draws resist bots but frustrate people who acted quickly.", "Shed load at the edge vs scale the core: shedding protects consistency cheaply, while scaling the core costs more and still cannot parallelize one hot counter."],
    p: ["A hot slot is hammered by retries from every client, and the retry storm outlasts the original burst.", "Per-person caps are enforced per session, so one buyer opens many sessions and takes the whole block."],
    v: "Run a load test with ten times capacity demand on one slot and confirm no oversell, bounded latency on unrelated slots, and that holds released by timeouts are re-offered within seconds.",
    dep: ["virtual-waiting-room", "rate-limiting-and-quotas"]
  },
  "money-and-refund-correctness": {
    s: "The rule that every amount charged, held, refunded or paid out can be traced to a booking state and a price decision, and totals reconcile.",
    d: "Money in a booking system moves in stages and partial amounts: deposit, balance, fee, tax, partial refund, supplier payout, channel commission. Each must be tied to a stored price breakdown, not recomputed later from rates that may have changed. Refunds follow the policy in force at booking time. Reconciliation compares internal ledgers with processor and partner statements. The hard cases are partial failures, where the booking changed but the refund did not, and currency rounding.",
    k: ["Store the full price breakdown at booking time vs recompute on demand: storing is immune to later rate changes but takes space and needs versioning; recomputing silently changes old bookings.", "Single ledger of money events vs state fields on the booking: a ledger audits and reconciles cleanly, while fields are simpler but lose the history."],
    p: ["A refund is calculated with today's policy rather than the one the guest accepted, leading to disputes.", "Rounding is done per line in one place and per total in another, so receipts differ from charges by cents."],
    v: "Book, change, cancel and partially refund a sample of bookings, then reconcile the ledger against processor and partner statements. The differences must be zero or explained line by line.",
    dep: ["refunds-and-credits", "price-quote-and-lock", "capture-and-settlement"]
  },
  "privacy-and-fraud": {
    s: "The policy for protecting guest data and the business from abuse: what personal and payment data is kept, who sees it, and how fake or malicious bookings are detected.",
    d: "Bookings collect names, contact details, travel plans and often children's or health information. Data is minimized, access is by role, and sensitive fields are separated or encrypted. Fraud takes several forms: stolen cards, bots that hold inventory to block competitors or scalp it, fake reviews of availability, and coupon abuse. Controls must sit at each layer, from edge throttling to payment risk checks to manual review, without adding friction that drives away real customers.",
    k: ["Collect only what is needed vs collect more for personalization and recovery: less data lowers breach and compliance exposure, but weakens marketing and no-show follow-up.", "Block automatically vs flag for review: automatic blocks stop bots instantly but wrongly stop real people; review is accurate but slow when holds expire in minutes."],
    p: ["Bots hold the best slots without ever paying, turning holds into a denial-of-service on inventory.", "Full guest details appear in logs, support exports and analytics copies with weaker access control than the booking store."],
    v: "Attempt scripted holds from one source and confirm throttling engages, then request deletion for a test guest and confirm personal fields disappear from the store, copies and exports, while financial records remain as required.",
    dep: ["bot-and-abuse-protection", "consent-and-data-requests", "roles-and-permissions"]
  },

  "guest-booking-flow": {
    s: "The multi-step path a guest follows from choosing a slot to receiving confirmation: details, extras, price review, payment and the final result.",
    d: "The flow turns a search result into a held reservation, collects party and contact details, shows a locked price, takes payment and ends with a confirmation page. It runs against a hold with a visible countdown, and each step calls the engine rather than trusting what the page remembers. The hard part is failure: payment pending, hold expired, price changed, double submission and a back button after success. Each needs a clear, recoverable screen.",
    k: ["Hold at the start vs hold at payment: early holds protect the guest's choice but lock inventory for people who browse; late holds waste fewer slots but risk a failed final step.", "Single-page checkout vs multi-step wizard: one page converts better, while steps validate more and suit complex products with extras and per-person details."],
    p: ["The countdown shown to the guest is client-side and drifts from the server's hold expiry, so payment is accepted for a slot already released.", "A back-button resubmit creates a second booking because the flow has no booking-scoped token."],
    v: "Walk the full flow in a browser for a test slot, then let a hold expire mid-payment and double-submit the final button. Exactly one booking should result, and the expired path should show a recoverable message.",
    dep: ["inventory-hold", "price-quote-and-lock", "payment-authorization", "confirmation-commit"]
  },
  "search-results-ui": {
    s: "The interface that shows available options for a date, time and party size, with prices, filters, sorting and clear signals about scarcity or unavailability.",
    d: "It sends the guest's criteria to availability search and renders offers: slots, room types, rate plans, add-ons. Calendars show open and closed days, often with lowest price per day. Filters and sorting narrow choices. Because results may be cached, the interface labels them as indicative until a hold confirms them, and shows reasons for unavailability such as minimum stay. It must be fast, since most searches never become bookings.",
    k: ["Calendar with price per day vs list of options after date entry: calendars help flexible guests but need precomputed prices; lists need less data but hide cheaper nearby dates.", "Show scarcity messages vs hide counts: urgency lifts conversion but is misleading if counts are stale or channel-wide."],
    p: ["A result is shown as available from a cache and fails at hold time, which feels like a broken site.", "Prices shown without fees or taxes differ at checkout, causing abandonment and complaints."],
    v: "Search a date with one unit left, book it in another session, and refresh. The unit must disappear within the stated staleness bound, and the quoted price on each result must equal the checkout total.",
    dep: ["availability-query", "result-ranking-and-packaging", "rate-plans"]
  },
  "embeddable-widget-and-api": {
    s: "A booking component and public API that other sites embed or call to search and book, so businesses can sell from their own pages and apps.",
    d: "A widget wraps the search and booking flow in a frame or script that runs on a third-party page, styled by tenant configuration. A public API exposes the same operations to developers: search, hold, confirm, cancel. Both authenticate with tenant or partner keys, enforce rate limits, and are versioned because clients update slowly. The hard parts are cross-site security, keeping behavior identical to the first-party flow, and not breaking integrators with changes.",
    k: ["One API used by the first-party site and external clients vs separate internal and public APIs: one API avoids drift but constrains internal changes; separate ones allow freedom but diverge in behavior.", "Hosted widget in a frame vs embedded script components: frames isolate styling and security, while scripts blend into the page but inherit its conflicts."],
    p: ["An API change removes a field a partner relied on, silently breaking their bookings until a customer complains.", "Keys with broad permissions are pasted into client-side code and abused to hold inventory."],
    v: "Embed the widget in a plain test page on a different origin, complete a booking, and compare the resulting record with one made on the first-party site. Fields and totals should be identical.",
    dep: ["partner-api-gateway", "rate-limiting-and-quotas", "tenant-configuration"]
  },
  "self-service-manage": {
    s: "The guest-facing page where a booker views, changes or cancels a reservation using a reference and verification, without calling the business.",
    d: "A guest opens a link or enters a reference plus an email or code, and sees the booking, its policies and the actions allowed now. Changes and cancellations call the same lifecycle flows staff use, with the same checks and fees shown before confirmation. It reduces support load and cancel-by-no-show. The hard parts are authentication without accounts, showing the correct fee for this moment, and preventing guessable references from exposing other people's bookings.",
    k: ["Link with a signed token vs reference plus a second factor: tokens are frictionless but are bearer secrets if forwarded; a second factor is safer but adds steps.", "Allow self-service changes up to a cutoff vs always require staff: self-service saves cost, but limits abuse only if the cutoff and fees are enforced by the engine."],
    p: ["Sequential or short booking references let anyone enumerate other guests' reservations.", "The page shows a free cancellation button because it computed the deadline in the wrong time zone."],
    v: "Open a test booking by link, cancel it before and after the free-cancellation cutoff, and confirm the fee shown matches the amount refunded or charged, and a changed reference from another booking is refused.",
    dep: ["amendment-flow", "cancellation-flow", "cancellation-policies", "booking-record"]
  },
  "staff-console": {
    s: "The internal application where staff search bookings, create phone or walk-in reservations, move guests, override rules and see the state of the day.",
    d: "Staff need the full inventory view, including blocked and held units, plus powers guests lack: bypassing restrictions, applying discounts, moving bookings between resources and marking arrivals. Each power is permission-checked and logged with a reason. The console reads from the same engine so counts match the public site. The difficulty is concurrency with guests: staff edit a slot at the same moment it is sold, and their screens must show conflicts instead of overwriting them.",
    k: ["Staff go through the same engine with elevated rights vs a separate back-door path: one engine keeps invariants, while a back door is faster to build but bypasses checks.", "Optimistic conflict detection on edits vs locking records while open: detection never blocks colleagues but needs good merge messages; locks are simple but get stuck on abandoned screens."],
    p: ["An override bypasses capacity checks without trace, and no one can later explain an oversold slot.", "A stale grid lets staff drag a booking onto a unit that was sold a minute earlier."],
    v: "Open the same slot in two staff sessions and in the guest flow, make conflicting changes, and confirm exactly one succeeds, the other shows a clear conflict, and every override has an audit entry with a reason.",
    dep: ["manual-overrides-and-blocks", "roles-and-permissions", "booking-state-machine", "audit-trail"]
  },
  "mobile-and-checkin": {
    s: "Mobile apps and on-site tools for arrival: showing a ticket or code, scanning it at the door, and marking a booking as used or arrived.",
    d: "The guest's phone shows the booking and a code that staff scan at entry. The scanner validates the code against the booking record, flags duplicates, wrong dates and canceled bookings, and records the arrival. On-site networks are unreliable, so scanners hold a local copy of valid codes and sync later. The hard problem is consistency offline: two gates scanning the same code at once, and bookings changed after the copy was downloaded.",
    k: ["Online validation at every scan vs offline lists with later sync: online is always current but fails with poor connectivity; offline works anywhere but can admit a canceled or duplicate code.", "Signed self-contained codes vs lookup keys: signed codes verify without network but cannot be revoked; lookups revoke instantly but need connectivity."],
    p: ["A code is screenshotted and shared, and the first scanner to see it admits an unauthorized person.", "An offline scanner's copy is hours old, so a refunded ticket still opens the gate."],
    v: "Scan one test code at two offline gates, then sync. Exactly one arrival is recorded and the duplicate is flagged. Cancel a test booking and confirm the code is rejected after the next sync.",
    dep: ["check-in-and-fulfillment", "booking-record", "calendar-invites-and-tickets"]
  },

  "channel-manager": {
    s: "The component that holds the list of partner channels and decides, for each, what inventory, rates and rules it may sell, and coordinates all outbound and inbound sync.",
    d: "It stores which channels are connected, their credentials, mappings, allocation and commission terms, and drives the push of availability and rates and the intake of bookings. When anything changes, it determines which channels are affected and schedules updates. It also enforces channel-specific rules such as closing a channel when stock is low. The difficulty is volume and heterogeneity: dozens of partners with different formats, limits and failure behaviors, all needing consistent inventory.",
    k: ["Central manager owning all channel logic vs per-channel adapters with their own state: central control keeps one view, while adapters isolate quirks; mixing them without a boundary spreads partner rules everywhere.", "Immediate fan-out on every change vs batched updates: immediate keeps copies fresh but floods partners; batching reduces load but widens the oversell window."],
    p: ["One slow partner blocks the queue and delays updates to every other channel.", "A rule is changed in the engine but not in the channel configuration, so the partner keeps selling closed dates."],
    v: "Change availability on one test slot and watch the outbound updates: every enabled channel should receive the new value within the stated delay, and a disabled channel should receive none.",
    dep: ["partner-api-gateway", "product-mapping", "availability-rate-push", "channel-allocation"]
  },
  "partner-api-gateway": {
    s: "The entry point for partners: authentication, request validation, version handling, throttling and translation of partner formats into the engine's own operations.",
    d: "Partners call in with their own message shapes and credentials, and expect strict, documented responses. The gateway authenticates them, validates payloads, enforces quotas, translates formats to internal commands and maps errors back to partner codes. It also logs every exchange for dispute resolution. It is hard because partners are slow to upgrade, so old versions must live for years, and because a flaw here exposes inventory and prices to the outside.",
    k: ["Translate at the gateway vs make the core speak partner formats: translation keeps the core clean but adds a layer that must stay in step; native support is faster but spreads format knowledge.", "Strict validation vs tolerant parsing: strict catches bad data at the door but breaks sloppy partners; tolerant keeps traffic flowing and risks storing garbage."],
    p: ["Partner errors are returned with internal messages that reveal system details.", "A retired version is switched off on schedule, but a partner never saw the notice and all their bookings fail."],
    v: "Send valid, malformed, duplicate and over-quota requests from a test partner and confirm each gets the documented response, nothing malformed reaches the core, and every exchange appears in the log.",
    dep: ["rate-limiting-and-quotas", "idempotent-booking-requests", "roles-and-permissions"]
  },
  "product-mapping": {
    s: "The table that links each internal room type, seat class or service to the matching product code at each partner, including rate plan and policy equivalents.",
    d: "Partners describe the same thing under their own codes and categories, with different rules for occupancy, meals or cancellations. Mapping connects internal resources and rate plans to partner products so availability and rates go to the right place and incoming bookings resolve to an internal unit. Mappings are edited by staff, validated for gaps and kept versioned. The hard part is semantic mismatch: a partner product that looks equal but has a different policy.",
    k: ["Many-to-one internal mapping vs strict one-to-one: many-to-one lets a partner see a simplified catalog but loses detail; one-to-one is exact but needs more upkeep.", "Mapping edited live vs reviewed and published in batches: live is fast for operators but risky; batches add delay but give a review point."],
    p: ["A new room type is added internally but never mapped, so it is invisible to partners and never sells.", "A booking arrives for a partner code that was remapped, and lands on the wrong unit type."],
    v: "Run a completeness check that lists every sellable product and every partner code without a counterpart, then send a test booking per mapped code and confirm it resolves to the intended internal product.",
    dep: ["resource-catalog", "rate-plans", "channel-manager"]
  },
  "availability-rate-push": {
    s: "The outbound path that sends current availability, prices and restrictions to each channel after they change, in the format and cadence that channel accepts.",
    d: "Changes from bookings, rate edits and blocks produce events. The push component computes the channel's view, such as units after allocation and restrictions, and sends full or delta updates. It tracks acknowledgements, retries failures and records what each partner last received. Partners limit request rates and sometimes accept only full-calendar replacements. The challenge is ordering and loss: an older update arriving after a newer one, or a failed update leaving a partner showing stock that is gone.",
    k: ["Delta updates vs full calendar snapshots: deltas are cheap and quick but can drift after a lost message; snapshots self-heal but cost bandwidth and may hit limits.", "Push on every change vs scheduled windows: every change is fresh but can overload partners; windows are predictable but create stale periods."],
    p: ["Updates sent in parallel arrive out of order, and the partner ends with the older availability.", "A failed push is retried without a sequence number, overwriting a newer value."],
    v: "Book the last unit and measure the time until each test channel shows it closed. Then drop one update in transit and confirm the next reconciliation or snapshot repairs the partner's copy.",
    dep: ["domain-event-log", "outbox-and-queues", "channel-allocation", "availability-ledger"]
  },
  "reservation-pull-webhooks": {
    s: "The inbound path that receives bookings, changes and cancellations from partners, by webhook or polling, and turns them into internal reservations.",
    d: "Some partners push each reservation to an endpoint; others require periodic polling of their system. Either way, the message is authenticated, deduplicated by the partner's reference, mapped to internal products and run through the same hold and confirm logic as a direct booking. A rejection must be reported back in the partner's terms. The difficulty is that partner bookings are already promised to the customer, so a failed internal acceptance is an incident, not a normal decline.",
    k: ["Webhook push vs polling: push is immediate but depends on partner reliability and replay; polling is controlled but delays and wastes calls.", "Accept then reconcile vs reject unless the engine confirms: accepting never loses a booking but may oversell; rejecting is safe but leaves a customer with a promise elsewhere."],
    p: ["A redelivered webhook creates a second reservation because the partner's reference is not unique-checked.", "Polling falls behind during a surge, and bookings sit unseen while the slot is sold again."],
    v: "Replay the same partner booking message three times and confirm one internal reservation. Then send a booking for a full slot and verify the policy outcome and the partner's response are as configured.",
    dep: ["partner-api-gateway", "product-mapping", "idempotent-booking-requests", "confirmation-commit"]
  },
  "channel-allocation": {
    s: "The rules that split or share inventory among channels: fixed blocks per partner, shared pool with limits, or release times for unsold allocations.",
    d: "A business may promise a partner a fixed number of units, or let all channels draw from one pool with caps or priority. Allocation rules decide what each channel sees as available. Unsold blocks can be released to the common pool at a cutoff, such as seven days before. The tension is between certainty for the partner and efficient use of stock. It is hard because allocations change what each channel sees, so one booking can change many views.",
    k: ["Fixed blocks per channel vs shared pool: blocks give partners certainty and avoid contention, but strand unsold stock; a pool sells more but needs fast sync.", "Release unsold blocks automatically vs on request: automatic improves yield, but surprises partners who expected to hold them."],
    p: ["A block is released at a cutoff without telling the partner, whose later booking fails.", "Per-channel counts are updated separately and sum to more than the total after a race."],
    v: "Configure a block and a pool, sell out the block on one channel, and confirm other channels still see pool stock, then pass the release cutoff and confirm leftover block units join the pool.",
    dep: ["availability-ledger", "capacity-and-units", "channel-manager"]
  },
  "channel-reconciliation": {
    s: "The periodic comparison of internal bookings and availability with partner records to find missing, duplicated or mismatched reservations and counts.",
    d: "Even careful sync loses messages. Reconciliation pulls each partner's reservations and calendar for a window, compares them with the internal record, and reports differences: bookings known on one side only, status or amount mismatches, and inventory that disagrees. Some differences repair automatically, others go to staff. It also underpins commission statements. The challenge is deciding which side is right, because both may have changed since the last sync.",
    k: ["Internal system always wins vs per-field rules: one winner is simple and safe for inventory, but can overwrite legitimate partner-side edits.", "Frequent small windows vs nightly full comparison: small windows find drift early; full runs catch everything but late and with heavy load."],
    p: ["Reconciliation runs against a partner's cached view and reports false differences that staff waste time chasing.", "A mismatch is auto-repaired by canceling a booking that a guest already paid for."],
    v: "Inject a missing booking, an extra booking and a count mismatch in a test channel, run reconciliation, and confirm each is reported with the correct side and that repaired items converge on the next run.",
    dep: ["booking-record", "reservation-pull-webhooks", "availability-rate-push", "supplier-payouts-and-commission"]
  },
});
