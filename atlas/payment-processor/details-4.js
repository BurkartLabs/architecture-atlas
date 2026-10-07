// Details for the payment processor plate, part 4: security, compliance, availability, and cross-cutting concerns.
ATLAS.details("payment-processor", {
  "card-vault": {
    s: "A small, isolated, hardened service that stores encrypted card numbers and is the only place they exist, answering requests with tokens everywhere else.",
    d: "The vault accepts card data from the collection path, encrypts it with keys held in hardware, stores the ciphertext, and returns a token. Detokenization is allowed only to a few narrow callers, mainly the network gateway, over authenticated internal channels. It sits in its own network segment with minimal software, strict access controls and heavy logging. It is hard because it must be extremely available, since every payment needs it, and extremely locked down, since it is the most valuable target in the company.",
    k: ["A separate vault service vs card data in the main database: a vault shrinks the audited surface and adds a dependency on every payment; the main database is simple and drags everything into scope.", "Operating the vault yourself vs using a vault provider: self-operation avoids lock-in and costs compliance effort; a provider is quick and makes migration hard."],
    p: ["Letting analytics or support tools query the vault for convenience brings them into audit scope and into breach scope.", "A vault outage with no failover stops every payment, including ones using already-saved cards."],
    v: "Scan every database, log, queue and backup in the environment for known test card numbers, and confirm they appear only inside the vault's encrypted store and nowhere else.",
    dep: ["tokenization", "key-management", "cde-segmentation", "access-audit"]
  },
  "tokenization": {
    s: "Replacing a card number with a random reference that has no mathematical relation to it, so systems can handle payments without ever holding the real number.",
    d: "On receipt, the card number is sent to the vault, which generates a token and stores the mapping. The token travels through the rest of the system in place of the number and can be restricted to one merchant. Some tokens keep the last four digits and format so existing screens work. Token lookup is one hop, and detokenization is permitted only at the network edge. It is hard because tokens must be unique per card and merchant as policy needs, the same card may need to give the same token or not, and every system must be taught never to log the number.",
    k: ["Random tokens with a lookup vs format-preserving encryption: random tokens reveal nothing and need a stored mapping; encryption needs no lookup and exposes the ciphertext to key compromise.", "Same token per card across merchants vs a different one per merchant: same enables cross-merchant analysis and fraud checks; different limits the damage of a leak."],
    p: ["A token that is guessable or sequential lets attackers walk the token space and use other merchants' cards.", "Tokens usable by any merchant make a leaked token as dangerous as a leaked number."],
    v: "Tokenize a test card for two merchants, confirm each token is unusable by the other, appears nowhere as the real number, and that detokenization at the gateway returns the original only for an authorized caller.",
    dep: ["card-vault", "key-management"]
  },
  "key-management": {
    s: "Generating, storing, rotating and using the cryptographic keys that protect card data and messages, with the keys held inside hardware modules.",
    d: "Hardware security modules generate and store keys so the key material never exists outside the device; applications send data in and receive results. Keys are arranged in a hierarchy, with a master key protecting data keys, and are created in ceremonies with split knowledge and dual control. Rotation replaces keys on schedule, re-encrypting data or decrypting with old keys during overlap. It is hard because rotation of billions of records must be online, losing a key means losing data, and the modules have limited throughput that limits payment speed.",
    k: ["Hardware modules in a managed cloud service vs owned devices: managed services are quick and share trust with the provider; owned devices give control and demand operations.", "Envelope encryption with data keys vs encrypting everything with the master key: envelopes allow cheap rotation and bulk work; direct use is simple and throttles on the module."],
    p: ["A key backup stored beside the data it protects gives an attacker both at once.", "Rotation that is never practiced fails the first time it is needed in an incident."],
    v: "Rotate a data key in staging with live traffic and confirm no payment fails, old records still decrypt, new records use the new key version, and a ceremony log shows two authorized custodians for the master key action.",
    dep: ["cde-segmentation", "access-audit"]
  },
  "encryption-in-transit": {
    s: "Protecting data moving between customers, merchants, services and networks with transport encryption and mutual authentication.",
    d: "All external traffic uses current TLS versions with modern ciphers, and certificates are managed automatically with short lifetimes. Internal service calls use mutual TLS so each service proves its identity, which also supports authorization by caller. Links to networks use dedicated connections or VPN tunnels, with their own required encryption and message authentication codes. It is hard because certificates expire at the worst time, older merchant clients need compatibility, and weakening settings for one client weakens them for all.",
    k: ["Mutual TLS for every internal call vs trusting the internal network: mutual TLS gives identity and containment of a breach at a cost in certificates and latency; trust is simple and spreads any intrusion.", "Dropping old protocol versions on a date vs supporting them for large merchants: dropping is secure and breaks integrations; supporting old versions keeps revenue and risk."],
    p: ["An expired internal certificate takes down a service chain at once, and the alert arrives after the outage.", "Terminating TLS at an edge device and forwarding in plain text exposes card data inside the network."],
    v: "Scan every public and internal endpoint for supported protocol versions and ciphers, confirm only the approved ones respond, and confirm certificates renew automatically well before expiry in a staged test.",
    dep: ["key-management"]
  },
  "point-to-point-encryption": {
    s: "Encrypting card data at the point of capture, such as a terminal, so that every system between it and the processor sees only ciphertext.",
    d: "The reading device encrypts the number and, for PIN entry, the PIN, using keys injected securely at manufacture or provisioning. Each transaction derives a fresh key from a base key, so one key capture exposes a single transaction. The processor's hardware module decrypts and, for PINs, translates between keys for the network without exposing the clear value. It is hard because key injection and tracking device inventory require secure facilities and process, and lost or swapped devices have to be detected.",
    k: ["Derived per-transaction keys vs a fixed key per device: derived keys limit compromise to one transaction and need more key logic; fixed keys are simple and one theft exposes everything.", "Validated hardware encryption vs software on a general device: validated hardware shrinks compliance scope; software is flexible and brings the whole device into scope."],
    p: ["An unregistered terminal added to the fleet sends data under keys nobody controls.", "Decrypting early in the network edge for convenience puts clear card data back into the wider environment."],
    v: "Capture a test transaction on a terminal, inspect every hop between device and processor, and confirm only ciphertext is visible until the hardware module, which returns a correct approval.",
    dep: ["key-management", "pci-scope-reduction"]
  },
  "cde-segmentation": {
    s: "Separating the network, systems and people that handle card data from the rest of the company, with controlled and monitored crossings between them.",
    d: "The environment that stores, processes or transmits card data is placed in its own network segments, accounts and clusters with default-deny rules. Only listed services and people may enter, through monitored paths, using separate credentials. Everything in the segment, and everything that can reach it, is in audit scope, so the aim is to make the segment as small as possible. It is hard because over time convenience adds exceptions, shared tooling and dependencies, and every exception widens the scope and the audit.",
    k: ["A small dedicated segment vs wide scope with pervasive controls: small is cheaper to audit and requires disciplined interfaces; wide is easy to build and makes everything a target.", "Network-level segmentation vs service-level policy: network rules are coarse and understandable; service policy is precise and harder to prove."],
    p: ["A shared logging agent or monitoring tool installed in the segment becomes a path out for card data.", "Segmentation never tested from outside gives false confidence when a rule has drifted."],
    v: "Run a segmentation test from a system outside the segment against every port and service inside it, and confirm only the documented paths connect, with all attempts logged.",
    dep: ["access-audit"]
  },
  "access-audit": {
    s: "Controlling who and what can touch sensitive data and operations, and recording every access in a tamper-evident log.",
    d: "Access follows least privilege: engineers get time-limited, approved access for a stated reason, and sensitive actions such as detokenization, manual ledger adjustments and key operations need a second person. Every access writes to a log stored outside the control of the people it records, with identity, action, target and time. Logs are protected from alteration and reviewed by alerts. It is hard because audit logs themselves can contain sensitive data, volume is large, and urgent incidents tempt people to bypass the process.",
    k: ["Just-in-time access with approval vs standing access: just-in-time cuts the exposure window and slows incident response; standing access is fast and a stolen account does maximum damage.", "Logging full request detail vs identifiers only: detail helps investigations and creates a new sensitive store; identifiers keep logs safe and less useful."],
    p: ["Break-glass access used routinely stops being an exception and nobody reviews it.", "Audit logs writable by the same administrators they monitor can be edited after the fact."],
    v: "Request detokenization as an ordinary engineer and confirm it is refused, then through the approval flow and confirm it succeeds with a log entry naming the approver, reason and data, and the log cannot be altered by the requester.",
    dep: []
  },
  "data-retention": {
    s: "Rules and jobs that decide how long each category of data is kept, and delete or anonymize it when the period ends.",
    d: "Different data has different obligations: transaction records are kept for years for tax and disputes; card numbers only as long as needed for a purpose, and security codes never after authorization; personal data is subject to deletion requests. A catalog assigns each field a class and period, and jobs purge across primary stores, replicas, search indexes, caches and backups. It is hard because data is copied into many places, the ledger is immutable by design and so must be anonymized in place or kept without personal fields, and legal duties can conflict.",
    k: ["Purging by field class automatically vs on request only: automatic purge limits exposure and risks deleting what a dispute needs; on request is cautious and keeps unneeded sensitive data.", "Deleting vs anonymizing: deletion is complete and breaks referential history; anonymizing keeps records usable and may remain linkable."],
    p: ["A deletion request fulfilled in the primary database but not in backups and search indexes is not fulfilled.", "Security codes stored briefly for convenience violate rules that forbid storing them at all."],
    v: "Create a test customer with a payment, process a deletion request, then search every store, index and backup restore for the identifiers and confirm they are gone, while the ledger totals remain unchanged.",
    dep: ["card-vault"]
  },
  "pci-scope-reduction": {
    s: "Design choices that keep card data out of as many systems as possible, so the audited environment is small, such as hosted fields, tokens and validated encryption.",
    d: "The scope of the card-data standard covers every system that stores, processes or transmits card data, plus anything that can affect their security. Reducing scope means never letting data in: hosted fields and redirects keep merchants out, tokens keep internal systems out, and validated point-to-point encryption keeps in-store networks out. Whatever remains is isolated and hardened. It is hard because new features pull data back in, such as support screens or exports, and because scope is decided by the assessor, not the company's own definition.",
    k: ["Hosted collection for merchants vs direct API with card data: hosted gives the merchant a far lighter obligation; direct gives control and puts them in full scope.", "Outsourcing card handling entirely vs running your own vault: outsourcing removes scope and control; running it gives flexibility and the whole obligation."],
    p: ["A new reporting feature that exports payment details copies card data into a system never assessed.", "Merchants assume hosted fields remove all duties and neglect their own page security."],
    v: "Enumerate every system that could see the card number in test traffic, by capture and by search, and confirm the list equals the documented scope, with each other system verifiably seeing only tokens.",
    dep: ["hosted-fields", "tokenization", "cde-segmentation", "point-to-point-encryption"]
  },
  "pci-program": {
    s: "The ongoing process of assessing, evidencing and maintaining compliance with the card data security standard, including scans, tests and annual assessment.",
    d: "A processor at the highest level undergoes an annual on-site assessment by an approved assessor, quarterly external vulnerability scans, regular penetration tests, and continuous control monitoring. Evidence, such as configurations, logs, access reviews, training records and policies, is collected and mapped to each requirement. Findings have remediation deadlines. It is hard because compliance is a continuous state, not an annual event, evidence collection is expensive without automation, and networks and customers ask for proof on request.",
    k: ["Continuous automated evidence collection vs a yearly scramble: continuous collection keeps controls honest and costs tooling; a scramble is cheap in months and expensive in the audit season.", "Strict internal standards above the requirement vs the minimum: stricter is safer and slower to change; the minimum is cheap and leaves no margin."],
    p: ["A control that passed at assessment and drifted by the next quarter is a finding that is also a real exposure.", "Scope defined too narrowly by the team is expanded by the assessor, with weeks of rework."],
    v: "Pick ten requirements at random and, for each, produce the current evidence generated within the last quarter, from automated collection, that shows the control operating, without any manual preparation.",
    dep: ["pci-scope-reduction", "access-audit", "cde-segmentation"]
  },
  "kyc-aml": {
    s: "Verifying who merchants and their owners are and screening their activity against laundering and fraud typologies, as required by financial regulation.",
    d: "At onboarding the system verifies identities, ownership structure and business registration, screens individuals and companies against watchlists and adverse media, and assigns a risk rating. Higher-risk customers get enhanced checks and periodic review. Ongoing, it re-screens when lists change. Cases that need judgment go to analysts, who record a decision and reasons. It is hard because data quality varies by country, names match approximately, false positives swamp analysts, and records of every decision must be kept.",
    k: ["Risk-based tiers vs uniform checks: tiers focus effort where risk is and need a defensible model; uniform checks are simple and expensive for low-risk customers.", "Building screening vs buying data: building controls matching logic and cost; buying is quicker and relies on vendor coverage."],
    p: ["Screening only at onboarding misses people added to lists afterward.", "Fuzzy matching tuned to reduce alerts lets near-matches of sanctioned names through."],
    v: "Onboard test entities with a known listed name, a variant spelling and a clean name, and confirm the first two are held for review with the match reason, the third passes, and a later list update re-screens everyone.",
    dep: ["merchant-onboarding", "sanctions", "access-audit"]
  },
  "sanctions": {
    s: "Checking merchants, payers, payees and payment details against government sanctions lists, and blocking or freezing matches.",
    d: "Lists from several governments are loaded and updated daily. The system screens names, addresses, countries and, where available, account details at onboarding and on payments and payouts, using normalization and fuzzy matching. A hit places the transaction or account on hold and creates a case for an analyst, who clears or escalates it; confirmed matches are blocked and reported. It is hard because lists change often, transliteration makes matching imprecise, speed requirements conflict with review, and the penalties for misses are severe.",
    k: ["Screening in the payment path vs after the fact: in-path blocks violations and adds latency and false-positive declines; after the fact is smooth and cannot prevent a transfer.", "Single combined list vs separate per jurisdiction: combined is simple and over-blocks; per jurisdiction is precise and needs routing logic."],
    p: ["A list update that fails to load leaves the system screening against stale data without alerting anyone.", "Screening names but not countries and banks lets payments pass through sanctioned regions."],
    v: "Submit test payments and payouts involving a listed name, a listed country and a clean party, and confirm the first two are held with cases and the third proceeds, and that a freshly loaded entry blocks within the stated time.",
    dep: ["kyc-aml", "payout-scheduling", "access-audit"]
  },
  "transaction-monitoring": {
    s: "Analyzing patterns of money movement over time to spot laundering, structuring and other suspicious behavior that individual payments do not show.",
    d: "Scenarios, such as many small payments just below a threshold, rapid in-and-out movement or volume inconsistent with the merchant's profile, run over the stream and the ledger, producing alerts. Analysts review alerts, with the merchant's history on screen, and either close them or file reports with the authorities, which must be kept confidential. Thresholds are tuned against past cases. It is hard because the base rate of real laundering is very low, alert volume overwhelms staff, and tipping off the subject is itself illegal.",
    k: ["Rule-based scenarios vs learned anomaly detection: rules are explainable to regulators and miss new patterns; anomaly detection finds the unknown and is hard to defend.", "Monitoring per merchant vs across linked parties: per merchant is simple; linked views find networks and need entity resolution."],
    p: ["Alert thresholds loosened to cut volume remove the very behavior the scenario was meant to catch.", "Notifying a merchant that an investigation is underway can breach the law."],
    v: "Replay a dataset with planted structuring and rapid-movement patterns and confirm each triggers the intended scenario, with the alert linking the underlying transactions and the case record preserving the analyst's decision.",
    dep: ["journal-entries", "merchant-risk", "kyc-aml"]
  },
  "sca-rules": {
    s: "The regional rules that require strong customer authentication on payments, with exemptions by amount, risk or merchant type, applied by the processor when choosing how to authenticate.",
    d: "In regions with strong authentication rules, payments by cardholders need two independent factors unless an exemption applies: low value, low fraud rate, trusted beneficiary, recurring same-amount charges or corporate cards. The system encodes these rules, tracks the fraud rates that determine which exemptions it may claim, and decides per payment whether to request an exemption or authenticate. It is hard because rules differ by region and change, exemption limits depend on the processor's own measured fraud rate, and issuers may override a request.",
    k: ["Claiming every available exemption vs authenticating by default: claiming maximizes conversion and risks issuer declines and liability; authenticating is safe and creates friction.", "Encoding rules in code vs as configured policy: code is precise and slow to change; configuration adapts to rule changes and risks misconfiguration."],
    p: ["Exceeding the fraud rate that allows an exemption without noticing means claims are non-compliant.", "Applying the rule by merchant location rather than by card issuer region misses payments in scope."],
    v: "Run test payments across amounts, regions and card types and confirm each follows the expected path, authenticate or exempt, and that raising the measured fraud rate above the limit removes the corresponding exemption.",
    dep: ["three-ds", "risk-scoring", "bin-tables"]
  },
  "regulatory-reporting": {
    s: "Producing the periodic and event-driven reports that regulators, tax authorities and networks require about volumes, safeguarding, incidents and suspicious activity.",
    d: "Obligations include periodic returns of transaction volumes and funds held, safeguarding reconciliations, reports of major security or operational incidents within hours, tax information on merchant payments, and suspicious activity reports. Each has a format, a deadline and an owner. Data comes from the ledger and monitoring, with a recorded definition and lineage. It is hard because definitions differ by regulator, deadlines are fixed, incident reports must be written during the incident, and each report must be reproducible later.",
    k: ["Reports generated from governed ledger queries vs spreadsheet assembly: governed queries are reproducible and need engineering; spreadsheets are fast and unreviewable.", "One reporting data model vs per-regulator extracts: one model keeps numbers consistent; extracts are simple per report and diverge."],
    p: ["A report submitted with a definition that differs from the previous period makes trends look like errors.", "Incident timelines reconstructed afterward from memory conflict with logs."],
    v: "Generate a quarterly return for a closed period twice from the governed queries, confirm identical numbers, and trace three reported figures back to individual ledger entries.",
    dep: ["finance-reports", "journal-entries", "auditability"]
  },
  "outbox-pattern": {
    s: "Writing an outgoing message to a table in the same database transaction as the state change, and publishing it afterward, so state and messages never disagree.",
    d: "When a payment changes state, the service writes the new state and a message row in one transaction. A separate relay reads unpublished rows in order, sends them to the queue or webhook system and marks them sent, repeating after crashes. Consumers see each message at least once and deduplicate by identifier. This avoids the failure where the database commits and the publish fails, or the reverse. It is hard because the relay can duplicate, the table grows and needs cleanup, and ordering matters per object.",
    k: ["Outbox table plus relay vs direct publish after commit: outbox cannot lose messages and adds latency and an extra process; direct publish is simple and loses messages in a crash.", "Polling the table vs reading the database's change log: polling is simple and adds load; log-reading is efficient and ties to the database engine."],
    p: ["A relay that marks rows sent before the publish is acknowledged loses messages on a crash.", "An outbox that is never pruned slows the very transactions it was added to protect."],
    v: "Kill the service between commit and publish, restart it, and confirm every committed state change produced exactly one published message, in order per payment, with consumers receiving no gaps.",
    dep: ["async-queues", "db-replication"]
  },
  "async-queues": {
    s: "Durable queues and workers that run work outside the request path, such as sending webhooks, posting entries, generating files and retrying failures.",
    d: "Work items are placed on queues with a key, processed by worker pools with limits, and acknowledged only when done. Failures retry with backoff, then land in a dead-letter queue for inspection. Ordering is kept per key where required, such as per payment. Queues decouple fast, critical paths from slow or unreliable ones. It is hard because messages are delivered at least once, so every handler must be idempotent, queue depth hides latency, and a poison message can block a partition.",
    k: ["Per-key ordering with partitions vs unordered with parallelism: ordering keeps object history correct and limits throughput; unordered scales and needs handlers that tolerate any order.", "Unlimited retries vs bounded with a dead-letter queue: unlimited eventually succeeds and can loop forever; bounded needs people to drain the dead letters."],
    p: ["A handler that is not idempotent applies a refund twice when its acknowledgment is lost.", "An ignored dead-letter queue accumulates payments no one ever completes."],
    v: "Crash a worker mid-job, confirm the job is retried and completes once with no duplicate effect, and push a poison message to confirm it moves to the dead-letter queue while later messages continue.",
    dep: ["idempotency-keys"]
  },
  "multi-region": {
    s: "Running the service in several geographic regions or zones, so the loss of one does not stop payments, while keeping state consistent.",
    d: "Stateless services run in several zones and regions behind global traffic management. State is the hard part: the ledger and payment state need a single authoritative writer at a time, so there is a primary region with replicas, or data is partitioned by merchant with each partition homed in one region. Network links to card networks may be tied to specific data centers. It is hard because cross-region latency is large, split-brain would cause double spending, and data residency laws can pin some merchants' data to a country.",
    k: ["Single primary region for writes vs partitioned homes: a single primary is simple and a failover event; partitioned homes spread load and make cross-partition operations hard.", "Active-active serving vs active-passive: active-active uses capacity and keeps failover tested; active-passive is simpler and the standby may not work when needed."],
    p: ["A failover in which both regions accept writes creates two histories of the same payment.", "Capacity planned for normal load fails when one region must absorb all traffic."],
    v: "Fail an entire region in a game-day exercise during test traffic and confirm traffic moves within the target time, no payment is double-processed, and balances from both regions agree afterwards.",
    dep: ["db-replication", "failover-routing", "network-links"]
  },
  "db-replication": {
    s: "Copying the payment and ledger data to other nodes and regions, with a chosen balance between durability, latency and consistency.",
    d: "The primary database streams changes to replicas. Synchronous replication to at least one other zone means a committed payment survives a zone loss, at the cost of write latency. Asynchronous replicas in other regions serve reads and disaster recovery, with a lag that determines how much could be lost. Failover promotes a replica, and the old primary must be fenced to avoid two writers. It is hard because replica reads can be stale in ways that matter, such as a balance shown before a refund, and promotion under load is delicate.",
    k: ["Synchronous replication across zones vs asynchronous: synchronous guarantees no committed loss and slows writes; asynchronous is fast and can lose recent payments in failover.", "Reading balances from replicas vs from the primary: replicas scale and may show stale funds; the primary is exact and limits capacity."],
    p: ["Deciding a payout from a lagging replica pays out against a balance that has already been spent.", "Promoting a replica without fencing the old primary leaves two nodes accepting writes."],
    v: "Fail the primary under write load, promote a replica, and confirm no acknowledged payment is missing, the old primary is fenced, and the ledger invariants pass on the promoted node.",
    dep: ["double-entry-ledger"]
  },
  "failover-routing": {
    s: "Detecting failing dependencies and shifting traffic to healthy alternatives automatically, using health checks, circuit breakers and retry policies.",
    d: "Each external dependency, such as an acquirer, network link or vendor, has health tracking from error rates and latency. Circuit breakers open when a dependency fails, stop sending traffic, and test it gradually before closing. Routes fall back to alternatives where one exists. Retries use budgets and timeouts so they do not multiply load. It is hard because failover on an ambiguous result risks duplicate charges, breakers that trip on normal declines remove a healthy route, and fallbacks have their own capacity limits.",
    k: ["Breakers on technical errors only vs also on decline rates: technical-only avoids false trips; including declines catches an issuer or acquirer that is up and rejecting.", "Automatic failover vs operator-approved: automatic restores service in seconds and can flap; approval is deliberate and slow."],
    p: ["A retry storm after a brief outage overwhelms the recovering dependency and extends the outage.", "A fallback route that is never exercised turns out to be misconfigured when needed."],
    v: "Inject failures and slow responses into one acquirer in test and confirm the breaker opens at the configured threshold, traffic moves, ambiguous in-flight requests are resolved before retry, and the breaker closes after recovery.",
    dep: ["acquirer-routing", "observability"]
  },
  "degraded-modes": {
    s: "Planned reduced-function behavior that keeps core payments working when a non-critical dependency is down, and shuts down optional features in order.",
    d: "Components are ranked by importance to authorizing and recording a payment. If risk scoring is slow, fall back to rules; if the feature store is stale, use cached values; if the dashboard database is down, payments continue; if reporting fails, queue it. Load shedding drops low-priority traffic first. Each degraded mode is defined, tested and visible in monitoring. It is hard because each fallback changes risk and consistency, and untested degraded paths fail in unexpected ways.",
    k: ["Failing open on risk checks vs failing closed: open keeps revenue and invites fraud during the outage; closed is safe and declines legitimate customers.", "Shedding by merchant tier vs by request type: tiers protect valued customers and seem unfair; request type protects the money path for everyone."],
    p: ["A fallback that silently weakens fraud checks stays in place after the outage ends.", "Degraded behavior never exercised in test is first run during a real incident."],
    v: "Take the scoring service down in a controlled test and confirm payments continue with the documented fallback, the mode is flagged in monitoring and events, and the system returns to full checks on recovery.",
    dep: ["risk-scoring", "rules-engine", "failover-routing"]
  },
  "disaster-recovery": {
    s: "The plans, backups and rehearsed procedures that restore the system and its data after a loss of a site, a data corruption or an attack.",
    d: "Targets are set for how much data may be lost and how long recovery may take. Backups and log archives are kept in separate accounts, tested by restoring, and protected from deletion by an attacker. Recovery runbooks cover failover to another region, restoring from backup to a point in time, and rebuilding from the event log and ledger. After recovery, reconciliation against banks and networks finds payments whose outcome was lost. It is hard because corruption replicates to replicas, and recovery must be rehearsed to be believed.",
    k: ["Point-in-time restore from backup vs rebuild from event replay: restore is fast and returns old state; replay is precise and slow and needs complete events.", "Immutable offsite backups vs same-account backups: immutable copies survive an attacker and add cost and process; same-account copies are easy and destroyed together."],
    p: ["Backups that were never restored turn out to be empty or unreadable on the day they are needed.", "Recovering to a point before some payments without reconciling against networks leaves customers charged for orders that are gone."],
    v: "Restore the production backup into an isolated environment, replay the log to a chosen minute, and confirm ledger invariants pass, balances match the source at that time, and recovery time meets its target.",
    dep: ["db-replication", "matching-engine", "event-log"]
  },
  "observability": {
    s: "Metrics, traces and alerts that show approval rates, latency, error rates and money-flow health by network, issuer, merchant and method, in real time.",
    d: "The main signal is the authorization rate sliced by network, acquirer, issuer, country, card type and merchant, compared with its expected value for that hour. A drop in one slice often reveals an outage or a bad release before any error rate rises. Distributed traces follow each payment across services, and business metrics such as unreconciled amounts and payout delays sit beside technical ones. It is hard because approval rates move for legitimate reasons, so alerts need seasonal baselines, and slicing creates many sparse series.",
    k: ["Alerting on deviation from learned baselines vs fixed thresholds: baselines handle daily patterns and need history and tuning; fixed thresholds are clear and misfire.", "High-cardinality slices vs aggregates: slices find local problems and cost storage; aggregates are cheap and hide a failing issuer."],
    p: ["An alert on overall approval rate misses an outage affecting only one network, hidden by healthy traffic elsewhere.", "Tracing that records card data in span attributes leaks sensitive data into the telemetry system."],
    v: "Block one issuer's test traffic and confirm an alert fires on that slice within minutes, naming the network and issuer, while the overall rate stays within its normal band.",
    dep: ["event-log"]
  },
  "change-control": {
    s: "The process and tooling for releasing changes to a system that cannot afford errors: staged rollout, feature flags, freezes and rapid rollback.",
    d: "Changes go out gradually, first to a small share of traffic or internal merchants, with automated comparison of approval rates, errors and latency against the old version before expanding. Feature flags separate deploy from release. Schema and ledger changes follow expand-and-contract so old and new code can run together. Freezes apply in peak periods. Every change is attributed, and rollback is rehearsed. It is hard because money-affecting bugs can persist as data errors even after rollback, so some changes need data repair plans before release.",
    k: ["Canary releases with automatic comparison vs manual staged rollout: automatic comparison catches regressions fast and needs good metrics; manual is flexible and relies on attention.", "Freezing changes during peak periods vs continuing to deploy: freezes reduce risk during high-stakes days and let changes pile up; continuing keeps changes small."],
    p: ["A change that is rolled back in code but has already posted wrong ledger entries leaves the damage in place.", "Flags that are never cleaned up accumulate into untested combinations."],
    v: "Release a deliberately faulty build to a one-percent canary in test and confirm the comparison detects the approval drop, halts the rollout and rolls back automatically within the target time.",
    dep: ["observability"]
  },
  "money-representation": {
    s: "How amounts are stored and calculated: integers in the smallest currency unit with an explicit currency, never binary floating point, with defined rounding.",
    d: "Every amount is an integer count of minor units plus a currency code, because currencies have zero, two or three decimal places and sometimes more for rates. Arithmetic never mixes currencies. Allocation, such as splitting a fee or a bill, uses defined rules so remainders go somewhere explicit and totals equal exactly. Rounding mode and the point at which rounding happens are specified for each calculation, since fees on many small items differ from fees on the total. This decision touches the API, ledger, fees, FX and reporting.",
    k: ["Integer minor units vs decimal types: integers are fast, exact and need care for rates and fractions; decimals are convenient and vary by library.", "Rounding per line vs on the total: per line matches network calculations item by item; on the total is simple and differs by cents."],
    p: ["Floating-point amounts accumulate errors that show up as unexplained cents in reconciliation.", "Assuming two decimal places charges a currency with none a hundred times too much."],
    v: "Run a property test that splits random amounts across random numbers of parties in every supported currency and confirm the parts always sum exactly to the original, with no float types anywhere in the money path.",
    dep: []
  },
  "exactly-once-effects": {
    s: "The discipline that every money-moving action takes effect once despite retries, duplicates and crashes, achieved through idempotency, transactions and deduplication rather than exactly-once delivery.",
    d: "Networks and queues deliver at least once and may deliver none, and clients retry. The system therefore makes each effect idempotent: operations carry a unique key, the key and the effect are stored atomically, and replays return the original result. Outside systems that cannot deduplicate, such as banks, need a record of intent before the call and a way to query the outcome afterwards. This decision sets the design of the API, queues, ledger, payouts and network gateway, and it has to hold across every failure mode.",
    k: ["Idempotency at every layer vs only at the API edge: every layer survives internal retries and costs effort in each service; edge-only is simple and breaks at the first internal replay.", "Record intent before calling an outside system vs after: before lets recovery find unknown outcomes; after is simple and loses track on a crash."],
    p: ["A single service that retries without a key silently breaks the guarantee for the whole path.", "Assuming the bank rejects duplicate instructions leads to paying twice when it does not."],
    v: "Run a chaos test that kills processes and drops responses at random during a load test, then confirm from the ledger and bank files that every payment and payout took effect exactly once.",
    dep: ["idempotency-keys", "outbox-pattern", "async-queues"]
  },
  "eventual-truth": {
    s: "Accepting that the processor's records are a belief about the outside world that becomes confirmed over days, so every state must allow for later correction.",
    d: "Authorization is not payment; capture is not settlement; settlement is not a bank credit; a payout is not a received deposit; and a payment can be disputed months after all of that. The system models each stage as its own state with its own evidence, and treats external reports as the authority that later confirms or contradicts internal records. Reconciliation is the mechanism that closes the gap. This decision shapes status names, merchant messaging, ledger accounts and reporting, and it is why nothing is ever called final too early.",
    k: ["Distinct states for each stage vs a single paid flag: distinct states reflect reality and demand clear explanations to merchants; a flag is simple and wrong for weeks.", "Trusting outside reports over internal records: external truth catches internal errors; it also imports the outside system's own mistakes."],
    p: ["Telling a merchant a payment is paid when only authorized causes goods to ship against money that never arrives.", "No path to correct a past state forces manual database edits when reality disagrees."],
    v: "Follow a test payment through authorization, capture, settlement, payout and a late dispute, and confirm at each stage the API, ledger and merchant report show the state that matches the evidence received so far.",
    dep: ["payment-state-machine", "matching-engine", "double-entry-ledger"]
  },
  "merchant-isolation": {
    s: "Ensuring one merchant can never see, change or affect another's data or service, in data access, rate limits, keys, reports and failures.",
    d: "Every record carries a merchant identifier, and every query is scoped by it at the lowest layer, not left to each endpoint. Credentials map to one merchant, caches and search indexes are keyed by it, and rate limits and queues give each a fair share. For platforms, connected accounts are explicit scopes with their own balances. Large merchants may get dedicated capacity. It is hard because a single missed filter leaks data across customers, and a noisy merchant can degrade the shared service.",
    k: ["Enforcement in the data layer vs in each endpoint: data-layer enforcement cannot be forgotten and is rigid; endpoint checks are flexible and one omission leaks data.", "Shared multi-tenant infrastructure vs dedicated per large merchant: shared is efficient and couples fates; dedicated isolates and costs more."],
    p: ["A cache key without the merchant identifier serves one merchant's data to another.", "An internal admin endpoint that skips scoping becomes the way a bug exposes everyone."],
    v: "Using one merchant's credentials, attempt to read, refund and list objects belonging to another merchant via every endpoint and the dashboard, and confirm each attempt is refused and logged without revealing the object exists.",
    dep: ["api-auth", "access-audit"]
  },
  "data-classification": {
    s: "Labeling every field by sensitivity, such as card data, personal data, financial records and public, and attaching the handling, storage and logging rules that follow from the label.",
    d: "A catalog assigns each field a class: card numbers and security codes are most restricted; personal and bank details are sensitive; amounts and states are internal; documentation is public. Each class defines where it may be stored, how it is encrypted, whether it may appear in logs or analytics, who may read it and how long it is kept. Tooling enforces the rules in schemas, loggers and exports. It is hard because new fields appear constantly, data copies drift into unclassified places, and classification decisions shape the audit scope.",
    k: ["Enforcing classification in tooling vs by policy and review: tooling catches mistakes automatically and requires upkeep; policy is flexible and depends on every engineer remembering.", "Few coarse classes vs many fine ones: few classes are easy to apply and over-protect; many are precise and often misapplied."],
    p: ["An unclassified new field defaults to being treated as harmless and ends up in logs.", "Classification applied to databases but not to message payloads, files and caches leaves gaps."],
    v: "Add a new field containing a test card number to a payload and confirm automated checks block it from logs, analytics and exports and fail the build until it has a classification and handling rule.",
    dep: ["card-vault", "data-retention"]
  },
  "auditability": {
    s: "Designing so that every balance, decision and action can be explained afterward: who did what, on which data, under which rules and with what result.",
    d: "Payments, ledger entries, rule decisions, model versions, human approvals and configuration changes all record cause and actor in append-only form with stable identifiers linking them. Given a number in a report, an auditor can walk back to the entries, the events, the external files and the rule versions. This shapes the immutable ledger, the event log, versioned rules and fees, and approval workflows. It is hard because explainability must be built in from the start, and it competes with privacy requirements to delete data.",
    k: ["Append-only records with corrections as new entries vs mutable records with history tables: append-only is simple to trust and needs reversal logic; mutable with history is flexible and weaker.", "Recording every decision's inputs vs only its outcome: inputs make a decision reproducible and cost storage and privacy risk; outcomes are compact and unverifiable."],
    p: ["A rule or model change not versioned makes past decisions impossible to explain.", "Audit data kept in a system that engineers can edit is not evidence."],
    v: "Pick a figure from a monthly report and a single declined payment, and for each reconstruct, using only stored records, the entries, files, rule and model versions and actors that produced it.",
    dep: ["journal-entries", "event-log", "access-audit"]
  },
});
