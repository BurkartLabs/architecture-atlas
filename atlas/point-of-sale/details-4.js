// Details for the point-of-sale plate, part 4: offline and sync, security, local platform, cross-cutting concerns.
ATLAS.details("point-of-sale", {
  "local-transaction-store": {
    s: "The register's durable on-device record of transactions, journal entries, shifts and queued uploads, written before any sale is acknowledged to the customer.",
    d: "Every event is committed to local storage with a flush that survives power loss before the register proceeds. The store keeps open and completed transactions, the upload state of each, and counters such as the next receipt number. Old, uploaded data is pruned on a schedule. Everything else in offline mode depends on this record being right. It is hard because registers lose power abruptly, run on cheap flash storage that wears and fails, and must still reconstruct a half-written sale.",
    k: ["Synchronous commit per event versus batched writes: synchronous commits survive a power cut with nothing lost, but cost latency on slow storage, while batching is fast and loses the last moments.", "Prune after confirmed upload versus keep for a fixed period: pruning saves space, while keeping supports reprints and disputes at a storage cost."],
    p: ["Write caching that reports success before data reaches flash loses the last sales in a power failure.", "Pruning data that was queued but never confirmed deletes sales that were never uploaded."],
    v: "Pull the power mid-transaction 100 times on a test register and confirm after each restart the database passes integrity checks, completed sales are intact, and the open sale is recoverable or cleanly absent.",
    dep: ["local-database-engine", "transaction-journal"]
  },
  "store-and-forward-queue": {
    s: "Holds completed transactions and other events locally until the center confirms receipt, then uploads them in order with retry and back-off.",
    d: "Each event enters a durable queue with a unique key and an upload status. A sender drains it to the center in sequence, retrying on failure with increasing delays, and marks entries confirmed only on an explicit acknowledgement. Queue depth and age are monitored. Priorities may let payments and voids go ahead of low-value telemetry. It is hard because queues grow silently: a register offline for days builds a backlog that floods the center on return and hides old data from reports.",
    k: ["Strict order versus parallel upload: strict order keeps dependent events consistent, while parallel upload clears a backlog faster and needs events to be independent.", "Unbounded queue versus limited with an alarm: unbounded never refuses a sale, while a limit protects storage and forces attention."],
    p: ["Marking an event sent when the request was merely transmitted loses it if the center never processed it.", "A poison event that fails forever blocks the entire queue behind it."],
    v: "Disconnect a register, ring 200 sales, reconnect, and confirm all 200 arrive at the center once each in order, the queue shows zero depth, and a deliberately malformed event is parked without blocking the rest.",
    dep: ["local-transaction-store", "idempotency-and-dedupe", "network-and-connectivity"]
  },
  "sync-engine": {
    s: "Moves data in both directions between registers and the center: uploads transactions and counts, downloads catalog, prices, users and rules, and keeps track of what each side has seen.",
    d: "Each register holds a cursor for what it has pulled and a queue for what it must push. Downloads are versioned snapshots and ordered deltas; uploads are idempotent events. The engine handles authentication, compression, resumption of interrupted transfers and scheduling that avoids peak trade. It reports lag per register. It is hard because both directions have different rules: reference data flows center-to-register and is authoritative from the center, while transactions flow the other way and are authoritative at the register.",
    k: ["Register-initiated pull versus center-initiated push: pull works through firewalls and is simple to scale, while push is faster and needs a persistent connection to every register.", "Real-time sync versus scheduled windows: real-time keeps data fresh and uses constant capacity, while windows are predictable and leave data stale between them."],
    p: ["A cursor that advances before the data is safely applied skips updates permanently.", "All registers syncing at opening time overload the center and delay the first sales of the day."],
    v: "Change a price at the center and ring a sale at a register at the same time, and confirm the register applies the price update within the target, and the sale is received by the center exactly once.",
    dep: ["store-and-forward-queue", "catalog-distribution", "reference-data-refresh", "idempotency-and-dedupe"]
  },
  "idempotency-and-dedupe": {
    s: "Makes repeated delivery of the same event harmless by giving each event a unique key and ignoring a key that has already been applied.",
    d: "Every transaction, payment, stock movement and loyalty posting carries a key generated at the register from its identity, register and sequence. The receiver records applied keys and, on a repeat, returns the original result instead of repeating the effect. Keys must be stable across retries and across the register restarting. It is hard because everything is retried: networks drop acknowledgements, queues redeliver, and operators replay data, so any effect that is not keyed will be doubled sooner or later.",
    k: ["Keys generated by the register versus by the center: register-generated keys work offline and survive retries, while center-generated keys are simple and cannot be used before contact.", "Keep applied keys forever versus a time window: forever is safe and grows without limit, while a window is cheap and fails on a very late replay."],
    p: ["A key that includes the retry timestamp is different on each attempt and defeats the purpose.", "Dedupe by content such as amount and time treats two genuine identical sales as one."],
    v: "Submit the same transaction batch three times, including after a simulated crash, and confirm the center holds exactly one copy with one set of stock, tender and loyalty effects.",
    dep: ["local-database-engine", "clock-and-ordering"]
  },
  "conflict-resolution": {
    s: "Decides what wins when two places changed the same thing, such as an edited customer, a stock level or a price, and records what was overridden.",
    d: "Transactions rarely conflict because each is created in one place and never edited. Shared data does: stock counts, customer profiles and balances. Policies include last-writer-wins by a trusted clock, merging deltas rather than values, ownership by one authority, or manual review. Stock uses movements that add commutatively, so concurrent decrements combine. It is hard because the right answer is domain-specific: a balance must never be overwritten by a stale copy, while a phone number can be.",
    k: ["Merge deltas versus overwrite values: deltas combine concurrent changes correctly for counters, while overwriting is simple and loses one of the writers.", "Automatic resolution versus a review queue: automatic keeps data flowing, while a queue handles rare high-value conflicts and needs people to work it."],
    p: ["Last-writer-wins on a loyalty balance replaces a newer balance with an older one from an offline store.", "Silently dropping the losing change gives no sign that anything was lost."],
    v: "Edit one customer's address at two offline registers, reconnect both, and confirm the documented policy is applied, the loser is logged with both values, and a balance changed at both is merged by delta.",
    dep: ["sync-engine", "clock-and-ordering", "inventory-ledger"]
  },
  "offline-risk-limits": {
    s: "Sets what the register may accept while disconnected: limits on card amounts and counts, gift card and coupon use, returns and price changes, to cap the loss.",
    d: "While offline the register cannot check balances, redemptions or approvals centrally. Policy sets a per-sale and cumulative limit for floor-limit card approvals, forbids or caps stored value redemptions, blocks returns without a receipt and limits manual price changes. Counters live locally and reset on reconnection. It is hard because the limit is a bet: too low and customers are turned away during an outage, too high and a fraudster who knows the store is offline can spend freely.",
    k: ["Strict offline limits versus accepting everything: strict limits cap the worst case, while accepting everything keeps the store trading and takes the loss.", "Limits by store versus by register: per-store limits reflect total risk, but need shared state offline, so per-register limits are simpler and add up to more."],
    p: ["A cumulative limit that resets on reboot lets someone power-cycle the register to keep spending.", "Offline-approved card sales declined at upload leave the retailer with goods gone and no payment."],
    v: "Take a register offline, process card sales until the cumulative limit is reached, and confirm the next is refused with an explanation, and that reconnecting clears the counter and uploads all.",
    dep: ["card-terminal-integration", "fraud-and-loss-detection", "gift-cards-and-store-credit"]
  },
  "in-store-server": {
    s: "A small server in the store that registers talk to first, sharing catalog, holds and stock between registers and bridging to the center when the line is down.",
    d: "The server caches reference data, receives transactions from registers over the local network, hosts the back-office console and queues uploads to the center. Registers can reach each other's holds and the store's stock through it. It can also act as the store's authority for a short time. It is hard because it is a single point of failure that must itself be resilient, patched and backed up, and it adds a tier whose failure modes differ from the registers' and the center's.",
    k: ["Store server tier versus registers talking directly to the center: a store tier gives local sharing and outage tolerance, but adds hardware and a component to operate.", "Server as authority versus a cache: authority enables store-wide features offline, and risks divergence when it fails."],
    p: ["When the store server fails, every register falls back to isolated mode with no shared holds or stock.", "An unpatched store server becomes the easiest way into the network that carries payments."],
    v: "Stop the store server mid-trade and confirm registers keep selling in isolated mode, queue transactions locally, and when it returns, all queued sales reach it and onward to the center once.",
    dep: ["sync-engine", "local-database-engine", "network-and-connectivity"]
  },
  "reference-data-refresh": {
    s: "Keeps the register's copies of slow-changing data current: users, roles, tax rules, tender settings and configuration, with checks on how stale they may become.",
    d: "Beyond the catalog, registers need rosters, permissions, tax tables, currency rates, promotions and feature settings. Each set has a version and a maximum age. The register refreshes on a schedule and on change notifications, and warns or restricts behavior when data is too old. It is hard because staleness has different costs per set: a day-old catalog is fine, a day-old user roster keeps an ex-employee's access, and a stale tax table breaks compliance.",
    k: ["Maximum age enforced with lockout versus warn only: lockout guarantees fresh rules and can stop a store trading in an outage, while warnings keep selling with stale rules.", "Per-dataset schedules versus one bundled refresh: per-dataset schedules match each need, while a bundle is simpler and refreshes data that has not changed."],
    p: ["No staleness limit on the user roster leaves dismissed staff able to sign in.", "A partial refresh that updates tax rules but not the item tax mapping charges incorrectly."],
    v: "Block a register's network for longer than the roster's maximum age and confirm it warns, then restricts manager functions as configured, and clears after the next successful refresh.",
    dep: ["sync-engine", "tax-calculation", "access-control-and-roles"]
  },
  "clock-and-ordering": {
    s: "Keeps timestamps trustworthy and events orderable across registers whose clocks drift, using synchronized time plus per-register sequence numbers.",
    d: "Registers set their clocks from a time service and record both wall time and a monotonic sequence with each event. The center orders events within a register by sequence and across registers by corrected time. Business date is decided by store policy, not by the clock alone. Clock steps are logged. It is hard because wall time lies: a dead battery or a manual change shifts timestamps, effective-dated prices apply at the wrong moment, and cross-register ordering by timestamp alone can be wrong by seconds.",
    k: ["Wall-clock timestamps versus logical sequence numbers: wall time is meaningful to people and across systems, while sequence is exact within one register and meaningless across them.", "Trust the register clock versus the center's receipt time: register time is when it happened, while center time is reliable and can be days later."],
    p: ["A register with the wrong date sells expired promotions and journals sales into the wrong trading day.", "Daylight-saving changes create an hour with duplicate or missing timestamps in the journal."],
    v: "Set a test register's clock two hours ahead, confirm it detects the drift against the time service, flags it, and that events still arrive in sequence order and are reported under the correct business date.",
    dep: ["network-and-connectivity", "local-database-engine"]
  },
  "access-control-and-roles": {
    s: "Defines what each person may do at the register and in the back office, by role and by store, enforced on the device and again at the center.",
    d: "Permissions are fine-grained actions such as void, discount above a limit, open drawer and change price. Roles group them, and users get roles at a place in the store hierarchy. The register holds a cached copy for offline checks, and the center re-validates uploaded actions. Sensitive actions require elevation by a second person. It is hard because the model must be both simple enough to administer and detailed enough to prevent abuse, and role creep makes everyone a manager.",
    k: ["Fine-grained permissions versus a few broad roles: fine-grained gives least privilege, while broad roles are easy to assign and tend to give too much.", "Check only at the register versus also at the center: register checks work offline and are fast, while central checks catch tampered clients and detect after the fact."],
    p: ["Everyone given the manager role during a busy period never loses it.", "Permissions enforced only in the screen let a modified client call the underlying function."],
    v: "Sign in as a cashier, attempt each restricted action via the screen and via a direct service call, and confirm both are refused offline and online and the refusals are logged.",
    dep: ["store-hierarchy", "audit-trail", "reference-data-refresh"]
  },
  "audit-trail": {
    s: "An append-only record of who did what and when across the system, including overrides, price edits, drawer openings, configuration changes and administrator actions.",
    d: "Each sensitive action writes an entry with actor, role, device, time, target, before and after values and any approver. Entries are chained or signed so changes can be detected, and shipped off the register promptly so tampering at the device does not erase them. Retention follows legal and fraud needs. It is hard because completeness conflicts with volume and privacy: logging too little leaves gaps, and logging too much keeps personal data and swamps reviewers.",
    k: ["Tamper-evident chained log versus plain table: chaining detects deletion and edits, while plain tables are simple and rely entirely on access control.", "Log at the register versus at the center: register logs capture offline actions, while central logs are safer and see only what is uploaded."],
    p: ["Audit entries kept only on the device vanish when the device is reimaged or stolen.", "Administrators with write access to the audit table can quietly remove their own entries."],
    v: "Perform a price override, a drawer open and a configuration change, and confirm each appears centrally with actor, device, before and after values, and deleting one local entry is detected by the chain check.",
    dep: ["local-database-engine", "sync-engine", "clock-and-ordering"]
  },
  "fraud-and-loss-detection": {
    s: "Finds theft and abuse through rules and statistics over transactions: refund patterns, sweethearting, void abuse, card testing and gift card draining.",
    d: "Events from the journal and audit trail are scored against rules and baselines per cashier, register, store and card. Some checks run at the register, such as velocity limits on card attempts, and others run centrally on batches. Alerts go to loss-prevention staff with the evidence and, where fitted, linked video. It is hard because the cost of false positives is people's trust and time, and fraudsters adapt: rules that are known get worked around.",
    k: ["Real-time blocking versus after-the-fact review: blocking stops the loss and risks stopping legitimate sales, while review is safe and acts only after the money is gone.", "Rule-based versus statistical models: rules are explainable and easy to defend, while statistical models find unknown patterns and are harder to justify to those accused."],
    p: ["A rule published in a staff manual is learned and avoided within weeks.", "Alerts without the underlying transactions attached get ignored."],
    v: "Replay a labeled test dataset with injected refund abuse and card testing, and confirm the system alerts on each injected case with its evidence, with false alerts below the agreed rate.",
    dep: ["transaction-journal", "audit-trail", "exception-reports"]
  },
  "payment-scope-reduction": {
    s: "Designs the system so card data never reaches the register, its network or its logs, shrinking the part of the system that must meet card-security rules.",
    d: "Card entry is done on certified terminals that encrypt data at the point of capture, and the register handles only tokens and results. The network is segmented so terminals sit apart from everything else. Logs and databases are scanned for card numbers. An annual assessment covers whatever remains in scope. It is hard because scope creeps: a debugging log, a screenshot, a support recording or a manual keyed entry brings real card data back into the register.",
    k: ["Point-to-point encryption with certified terminals versus handling card data in the register: encryption minimizes scope and cost of assessment, while handling data gives control and brings the whole stack into scope.", "Network segmentation versus flat network: segmentation limits the damage of a compromise, but needs routers, rules and care with shared devices."],
    p: ["Verbose logging of a payment response writes the card number to files nobody treats as sensitive.", "Support staff taking screenshots of failed payments capture card details."],
    v: "Scan the register's disk, database, logs and memory dumps after a day of test card sales for card number patterns, and confirm none exist; confirm the register cannot reach the terminal network's other hosts.",
    dep: ["card-terminal-integration", "payment-tokens", "network-and-connectivity"]
  },
  "data-privacy-controls": {
    s: "Limits and documents what personal data the system collects, shows, keeps and shares, and supports customers' rights to see, correct and delete it.",
    d: "Customer data enters through loyalty, receipts and accounts. Controls include consent capture, minimal fields, masking on screens and receipts, role-based access, retention limits and a process to export or delete a person's data across systems. Staff data such as biometrics has its own rules. It is hard because the data spreads: copies live in the journal, the warehouse, backups and email logs, and deleting a person while keeping legally required sales records needs anonymization rather than removal.",
    k: ["Anonymize on request versus delete records: anonymizing keeps sales and tax records intact, while deletion is simple to describe and breaks accounting.", "Collect optional fields versus only what the sale needs: more data enables marketing, while less reduces risk and the effort of every request."],
    p: ["Printing a full card or phone number on the receipt exposes it to anyone who handles it.", "A deletion request fulfilled in the main database but not in the warehouse or backups is not fulfilled."],
    v: "Create a test customer with sales, request deletion, and confirm the profile is removed or anonymized in the register, center, warehouse and queued emails, while the sale totals are unchanged.",
    dep: ["customer-attach", "warehouse-feed", "access-control-and-roles"]
  },
  "device-enrollment": {
    s: "Registers each device, such as register, terminal or hub, with the center, proves its identity with a credential and records which devices belong to which store.",
    d: "A new device is enrolled by an authorized person, receiving a certificate or key bound to its identity and store. Every connection to the center and to terminals uses it. A registry lists devices, serial numbers, versions and status, and revoking a device cuts its access. It is hard because devices are physical and swappable: a stolen or cloned device must be shut out quickly, a replaced unit must take over its predecessor's role cleanly, and thousands must be enrolled without error.",
    k: ["Per-device certificates versus a shared store credential: per-device credentials can be revoked individually, while a shared credential is simple and one leak exposes the store.", "Enroll at a staging depot versus at the store: depot enrollment is controlled and consistent, while in-store enrollment is flexible and depends on staff following steps."],
    p: ["A decommissioned register still holding valid credentials is sold secondhand with access to the center.", "A device registry that falls out of date hides a rogue device among the legitimate ones."],
    v: "Revoke a test register's credential and confirm it can no longer sync or log in within the revocation window, while its cached data is wiped on its next start and other registers are unaffected.",
    dep: ["secrets-and-key-management", "remote-device-management"]
  },
  "secrets-and-key-management": {
    s: "Creates, stores, distributes and rotates the keys and credentials used by registers and services, keeping them out of code, configuration and logs.",
    d: "Each device holds keys in protected storage where available, and the center issues short-lived credentials where possible. Payment-related keys live in certified hardware only. Rotation is scheduled and automated, with overlap so devices with old keys keep working while they update. Emergency revocation is rehearsed. It is hard because thousands of offline devices hold secrets: rotation must succeed on devices that are off for weeks, and a leaked key in a build artifact is leaked everywhere at once.",
    k: ["Short-lived credentials versus long-lived keys: short-lived limits what a leak is worth, but needs connectivity to renew and fails on devices offline for long.", "Hardware-protected key storage versus software storage: hardware resists extraction, while software storage is available on every device and easy to copy."],
    p: ["A key embedded in the application build is extracted from any register and works on all.", "Rotation that cuts over at one moment locks out the registers that were switched off."],
    v: "Rotate a service credential with a test register offline, and confirm online registers switch without interruption, the offline one authenticates with the old key during the overlap and renews on return.",
    dep: ["operating-system-and-runtime", "network-and-connectivity"]
  },
  "operating-system-and-runtime": {
    s: "The operating system, drivers and runtime the register app runs on, locked down to kiosk use, with the minimum services needed and a controlled patch path.",
    d: "Registers run a general or embedded operating system configured to boot straight into the app, with restricted users, no unrelated software, disabled removable media and controlled drivers. Hardware ranges from decades-old desktops to tablets. A runtime or browser engine executes the app. It is hard because of lifespan: registers run seven years or more, operating systems fall out of support, and patching them must not break certified drivers or fiscal modules.",
    k: ["Locked-down kiosk image versus a general desktop: a kiosk image has a small attack surface and fewer surprises, but needs image engineering and testing for each hardware model.", "Immutable image with atomic updates versus in-place patching: immutable images roll back cleanly, while in-place patches are simple and can leave a machine half-updated."],
    p: ["Automatic OS updates that restart the machine during trading take the lane offline mid-sale.", "A driver update that fixes one printer model breaks another across the estate."],
    v: "Boot a register from power-off with the network disconnected, and confirm it reaches the sign-in screen with only the approved services running and no way to leave the app without a managed credential.",
    dep: []
  },
  "local-database-engine": {
    s: "An embedded database on each register that stores the catalog, prices, users and the transaction journal, with fast indexed reads and durable writes.",
    d: "A file-based relational or key-value store holds reference data, which is read heavily, and the journal, which is written constantly. Indexes support lookup by code and name. Write-ahead logging and checkpoints give crash safety. Schema migrations run at app update, and the file is backed up or reconstructable from the center. It is hard because storage is weak: flash wears, files corrupt on power loss, and a migration that fails halfway on thousands of devices leaves an estate that cannot start.",
    k: ["Embedded database versus flat files: a database gives indexes, transactions and crash safety, while flat files are simple and need hand-built safety.", "One file for everything versus separate files for reference data and transactions: separation lets reference data be replaced wholesale without touching sales, at the cost of cross-file consistency."],
    p: ["A migration tested only on small data takes ten minutes on a full catalog and times out at startup.", "Corruption with no recovery path forces a full device reimage that loses unsent transactions."],
    v: "Load a 200,000-item catalog and a year of journal, run a migration, and confirm the app starts within the target, lookups return in under 50 ms, and a forced kill during migration recovers on next start.",
    dep: ["operating-system-and-runtime"]
  },
  "app-update-and-rollout": {
    s: "Delivers new register software to the estate in stages, verifies each update, and can roll back automatically if a new version fails.",
    d: "A release is built, signed and published to an update service. Registers download in the background, verify the signature and install at a quiet time, keeping the previous version. Rollouts proceed by rings: test registers, a pilot store, a region, everyone, with health checks between. Database migrations run as part of the update. It is hard because trade does not stop and registers differ: an update that works on lab hardware fails on an odd model, and a bad release affects every store at once if rollout is not gated.",
    k: ["Staged rings with health gates versus all at once: rings limit the blast radius and slow every release, while all at once is quick and risks the whole estate.", "Automatic rollback versus manual: automatic rollback restores trade fast, while manual avoids oscillation and needs a person at the right moment."],
    p: ["Updating during trading hours interrupts open sales on registers that restart.", "An update that migrates the database before the app is verified cannot be rolled back."],
    v: "Release a version with a deliberate startup fault to the pilot ring and confirm the health gate halts rollout, affected registers return to the previous version automatically, and no sale is lost.",
    dep: ["remote-device-management", "local-database-engine", "secrets-and-key-management"]
  },
  "configuration-and-feature-flags": {
    s: "Controls register behavior through settings and flags set centrally per store, register or role: enabled tenders, screens, receipt options and experimental features.",
    d: "Configuration is a hierarchy of values resolved from company to register, versioned and delivered through sync. Feature flags turn code paths on for chosen stores, supporting gradual rollout and quick shutoff. The register logs which configuration version was active for each sale. It is hard because the combinations explode: each flag doubles the states to test, long-lived flags become permanent behavior nobody understands, and a bad setting reaches every register quickly.",
    k: ["Central configuration with local override versus central only: local overrides let a store fix a problem now, but cause drift, while central only is consistent and slow to react.", "Flags removed on schedule versus kept: removal keeps code paths few, while keeping them preserves quick switches and accumulates complexity."],
    p: ["A flag left on in one store for months means that store runs an untested combination.", "A configuration push that sets an invalid tender list leaves registers unable to take payment."],
    v: "Flip a feature flag for one pilot store, confirm only its registers change behavior within the sync interval, and that turning it off restores the previous behavior and records the active version on each sale.",
    dep: ["sync-engine", "store-hierarchy", "local-database-engine"]
  },
  "remote-device-management": {
    s: "Lets support see device status, collect logs, run commands, restart services and change settings on registers and peripherals without visiting the store.",
    d: "An agent on each device keeps a secure connection to a management service and reports state: version, health, disk and connectivity. Support can pull logs, trigger restarts or screen views, and push scripts under audit. Policies enforce desired state, such as required versions and settings. It is hard because the power is large: a management channel that can run commands on every register is the most valuable target in the company and must be tightly controlled and logged.",
    k: ["Remote desktop-style access versus structured commands: desktop access fixes anything and shows customer data, while structured commands are safer, limited and audited.", "Agent initiates outbound connections versus inbound access: outbound works through store firewalls and exposes no open port, while inbound is simpler to build and a target."],
    p: ["A shared support credential means no one knows who ran a command on a register.", "A script pushed to all stores at once with no staged rollout breaks every register."],
    v: "Run a log-collection and restart command on one register from the console, confirm it executes within a minute, appears in the audit trail with the support user, and is refused for a user without the right role.",
    dep: ["device-enrollment", "network-and-connectivity", "audit-trail"]
  },
  "logging-and-telemetry": {
    s: "Collects diagnostic logs, errors, performance timings and usage metrics from registers, with privacy controls, so problems are found before stores report them.",
    d: "The app writes structured logs locally with levels and rotating files, and ships summaries and errors to a central service when connected. Metrics cover scan-to-line time, payment duration, queue depth and crash counts. Dashboards and alerts show estate health. Sensitive fields are masked at the source. It is hard because the devices are many and often offline: volume must be bounded, logs must be there when a failure happens, and nothing sensitive may leak into them.",
    k: ["Verbose local logs with sampled upload versus uploading everything: local detail is available when needed on demand, while uploading everything costs bandwidth and storage.", "Structured events versus free-text logs: structured events can be aggregated and alerted on, while free text is quick to write and difficult to query."],
    p: ["Logs that fill the disk and stop the register are worse than having none.", "A log line that includes the full request for debugging also includes personal or card data."],
    v: "Cause a payment timeout on a test register and confirm the central dashboard shows the event with timings and register identity within a minute, and a search of the uploaded logs finds no card or personal data.",
    dep: ["local-database-engine", "network-and-connectivity", "data-privacy-controls"]
  },
  "network-and-connectivity": {
    s: "The store's local network and its links to the center and payment providers, including wired and wireless segments, a backup link and rules about what may talk to what.",
    d: "Registers, terminals, printers and the store server sit on a segmented local network, with the terminal segment isolated. A primary wired link to the internet is backed by a cellular or secondary line. Name resolution, time service and certificates must work locally. Quality of service favors payment traffic. It is hard because stores are not data centers: consumer-grade equipment, interference, and staff who unplug cables mean links fail in the most ordinary ways.",
    k: ["Wired registers versus wireless mobile points of sale: wired is dependable and cheap to run, while wireless gives flexibility and brings interference and roaming problems.", "Automatic failover to a backup link versus manual: automatic keeps trading with no action, while manual avoids surprise data costs and delays recovery."],
    p: ["A single flat network lets a compromised guest device reach the terminals.", "A backup link that is never tested fails during the first real outage."],
    v: "Pull the primary uplink during a card sale and confirm the register fails over to the backup within the target, the payment completes or recovers cleanly, and the failover is logged.",
    dep: []
  },
  "money-precision": {
    s: "How amounts are represented, rounded and allocated across every layer, so that lines, tax, tenders, refunds and reports agree to the smallest unit.",
    d: "Decisions include integer minor units or decimals, the rounding mode and level, how discounts are allocated to lines, how cash is rounded to the smallest coin, and how currency is handled. These choices reach the promotion engine, tax, returns, reporting and the accounting export. They are hard to change because history was recorded under the old rules. The risk is quiet: a one-cent difference per sale is invisible on a receipt and shows up as thousands in annual reconciliation.",
    k: ["One shared money library versus per-service handling: a shared library guarantees the same rounding everywhere, while per-service code is faster to start and drifts.", "Allocate discounts to lines with a documented remainder rule versus leave at basket level: allocation makes returns and tax exact, but needs a rule for the leftover cent."],
    p: ["Two services rounding at different points produce receipts and reports that never agree.", "Floating-point anywhere in the path creates drift that is hard to reproduce."],
    v: "Run a large generated set of baskets, returns and promotions through the register, the center and the reporting store, and confirm every amount agrees to the cent at each stage.",
    dep: ["rounding-and-totals", "tax-calculation", "promotion-engine"]
  },
  "offline-tolerance": {
    s: "How much of the system keeps working with no connection, and what each feature does, refuses or defers while the center is out of reach.",
    d: "Every feature must be classified: works fully offline, works with limits, queues for later, or refuses. Sale, cash tender and receipt printing must work. Card payments, gift cards, coupons, loyalty, returns and cross-store lookups need explicit offline behavior. The decision shapes data placement, caching, queues and conflict handling in every layer. It is hard because each feature's offline rule is a business risk choice, and offline paths are rarely exercised until an outage tests them.",
    k: ["Offline-first design versus online with an offline fallback: offline-first treats the register as the source of its sales and stays simple in outages, while the fallback model is easier to build and fails in unexpected ways.", "Uniform offline policy versus per-feature policy: a uniform policy is easy to explain, while per-feature policy matches each risk and is complex to configure."],
    p: ["A feature that quietly needs a server call makes the whole sale screen hang during an outage.", "Offline mode that is never tested in production conditions fails the first time it is needed."],
    v: "Disconnect a store for an hour during a scripted trading day and confirm each feature behaves as its classification states, every sale is recorded, and all data reconciles after reconnection.",
    dep: ["local-transaction-store", "store-and-forward-queue", "offline-risk-limits"]
  },
  "counter-latency": {
    s: "The limit on how long any action at the counter may take, which forces local data, cached decisions and care about every call that could wait on a network.",
    d: "Cashiers work in seconds: a scan must show a line immediately, a total must update at once, and payment must not stall the queue. Latency budgets apply to lookup, repricing, tender and print. Anything slower than the budget moves off the critical path: it is done locally, in the background, or after the customer has left. It is hard because the systems producing delay are outside the register's control: networks, processors and slow peripherals, so every added feature spends from a fixed budget.",
    k: ["Local data for the sale path versus central calls: local data keeps every action fast and available, but replicates data that may be stale.", "Synchronous checks versus deferred ones: synchronous checks stop bad sales and cost time, while deferred ones keep the line moving and accept some loss."],
    p: ["Each added network call sits on the sale path until the sum of them makes scanning feel slow.", "Averages hide the long tail: one in fifty sales pausing five seconds is what cashiers remember."],
    v: "Measure scan-to-line, repricing and payment times at the 99th percentile on the slowest supported hardware under a loaded day's traffic, and confirm they are within the stated budget.",
    dep: ["sale-screen-and-cart", "local-database-engine", "price-resolution"]
  },
  "regional-compliance": {
    s: "The local legal requirements, tax rules, fiscal devices, receipt contents, privacy laws and card-network rules that change what a register must do in each country or region.",
    d: "Rules cover how tax is computed and shown, whether sales must be signed and numbered, retention of records, required receipt text and unit-price display, age-restricted goods, cash rounding and consumer return rights. They must be modeled as data and modules, not hard-coded, so adding a country is configuration plus a plug-in. It is hard because rules change on specific dates, differ within a country and carry penalties, and are tested by authorities rather than by your test suite.",
    k: ["Compliance as pluggable modules versus branching in core code: modules isolate each regime and can be certified separately, while branching is quicker and spreads regional logic everywhere.", "Central rules service versus bundled rules: a service updates instantly, while bundled rules work offline and update with software."],
    p: ["Hard-coded rates and rules need a code release for each change and miss the effective date.", "Rules tested only for the home country fail audits in the first new region."],
    v: "Configure a store for a second region and confirm tax, rounding, receipt text, numbering and fiscal reporting follow that region's rule set, as checked against a written checklist from a local advisor.",
    dep: ["tax-calculation", "fiscal-compliance-module", "receipt-composer"]
  },
  "retail-vertical-variation": {
    s: "How the same core is adapted to different kinds of retail, such as grocery, apparel, hospitality and fuel, which differ in items, workflows, payments and peripherals.",
    d: "Grocery needs speed, weights and age checks; apparel needs variants, returns and stock by size; hospitality needs tables, tips and tickets to the kitchen; fuel needs pre-authorization and pump control. A common core of catalog, transaction, tender and sync is extended by vertical modules, screens and rules. It is hard because forcing one model on all causes awkward compromises, while forking per vertical multiplies maintenance and splits the platform.",
    k: ["Configurable core with vertical plug-ins versus separate products per vertical: one core shares fixes and sync, while separate products fit each vertical exactly and diverge over time.", "Generic data model versus vertical-specific tables: generic models need no schema change for new verticals, but make queries harder to write and understand."],
    p: ["A feature built for one vertical quietly breaks assumptions in another that shares the same code.", "A generic item model with free-form attributes lets inconsistent data pile up unchecked."],
    v: "Run the same core build configured for a grocery store and a restaurant through their scripted day, and confirm each sees only its own screens and rules, and a core fix applies to both.",
    dep: ["modifiers-and-bundles", "variants-and-matrices", "tips-and-surcharges"]
  },
  "trust-and-loss-exposure": {
    s: "How much each person, device and offline period is trusted, and so how much money or stock it can lose or move, which sets limits and controls in every layer.",
    d: "Every control balances speed against loss: approval thresholds, drawer access, offline limits, return rules and audit depth. Most losses come from insiders and from rushed exceptions, not outside attacks. The design assumes mistakes and misuse, makes risky actions visible and attributable rather than impossible, and tunes friction to value. It is hard because friction costs real sales and morale, and controls that are too tight are bypassed by the staff they are meant to protect.",
    k: ["Prevent by blocking versus detect by recording: blocking stops the loss and the line, while recording is frictionless and relies on review that may never happen.", "Uniform controls versus risk-tiered controls: uniform rules are easy to explain, while tiering puts friction where the money is and adds rules to maintain."],
    p: ["Controls defeated by routine workarounds, such as shared logins, create records that look clean and mean nothing.", "A control placed only at the register is bypassed at the back office where the same actions are possible."],
    v: "Run a red-team day where staff try ten known abuse patterns, and confirm each is blocked or recorded with an attributable actor and appears in the exception reporting by the next morning.",
    dep: ["access-control-and-roles", "audit-trail", "fraud-and-loss-detection"]
  },
});
