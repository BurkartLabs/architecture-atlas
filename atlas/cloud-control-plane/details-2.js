// Details for the cloud control plane plate, part 2: identity, accounts, quotas and billing.
ATLAS.details("cloud-control-plane", {
  "principals": {
    s: "The identities that can make calls: human users, groups, machine identities and the cloud's own services, each with a stable identifier and a way to prove it.",
    d: "A principal is a record in the identity store with an identifier, an owning account and one or more ways to authenticate: passwords with a second factor, long-lived access keys, or certificates. Groups collect principals so permissions attach once. Machine identities are meant to hold no permanent secret and instead receive short-lived credentials. The hard parts are lifecycle, since departed people and abandoned keys must be found and disabled, and scale, since an authentication path serves every request in the region.",
    k: ["Long-lived keys vs only short-lived credentials: keys are simple for scripts; they leak and linger, while short-lived credentials need a role mechanism everywhere.", "Groups for permission assignment vs per-principal grants: groups make audits tractable; they hide who actually holds a permission behind nested membership."],
    p: ["An access key committed to a public repository is used within minutes by scanners.", "A deleted employee's keys stay valid because key records are separate from the user record."],
    v: "Disable a user and confirm every console session, access key and token minted for them is rejected within the documented time, with the rejection visible in the audit log.",
    dep: ["resource-database", "secrets-store"]
  },
  "policy-documents": {
    s: "Declarative statements that grant or deny actions on resources, optionally under conditions, attached to principals, groups, roles, resources or whole accounts.",
    d: "A policy is a document of statements, each naming an effect, a set of actions, a set of resource patterns and conditions on context such as source network, time or tags. Policies attach to identities, to resources and to organizational units, and each attachment point has a different meaning. Customers write them by hand, so size limits and validation matter. Difficulty comes from expressiveness: richer conditions allow precise control but make policies hard to reason about and to evaluate quickly.",
    k: ["Explicit deny that overrides allow vs allow-only: deny supports guardrails that cannot be bypassed; it makes the result of combining many policies harder to predict.", "Rich condition language vs a small fixed set: customers express real rules; the evaluator is slower and more bug-prone."],
    p: ["A wildcard in an action or resource pattern grants far more than the author intended.", "A condition key that is absent on some requests makes a deny statement silently never match."],
    v: "Attach a policy and run a matrix of allowed and denied requests, including edge cases for wildcards and missing conditions, and confirm the decision for each matches the expectation written beforehand.",
    dep: ["principals", "resource-identifiers"]
  },
  "policy-evaluation": {
    s: "Combines every applicable policy for a request and returns allow or deny with a reason, on the hot path of every call.",
    d: "The evaluator gathers policies from the principal, its groups, the target resource, the account's organization guardrails and any session limits. It matches action, resource and condition, applies precedence, and returns a decision and, for audit, the matching statement. For speed it caches parsed policies and compiled patterns, and evaluates locally in each service rather than calling a central service. The difficulty is correctness under change: policy updates must take effect quickly everywhere, and a decision must be explainable when customers ask why they were denied.",
    k: ["Evaluate in every service vs call a central authorizer: no extra network hop and no shared dependency; every service must run the same correct engine and see fresh policy.", "Default deny vs default allow: a missed policy fails closed; mistakes show up as outages rather than breaches."],
    p: ["Stale cached policies let a revoked permission persist for minutes across some servers and not others.", "Different services implement slightly different matching of wildcards, so one policy behaves two ways."],
    v: "Update a policy to deny an action, then call the action against every service in a loop and record the time at which the last allow occurs; confirm it is within the stated propagation bound.",
    dep: ["policy-documents", "organization-policies", "service-discovery"]
  },
  "temporary-credentials": {
    s: "Short-lived credentials minted for a principal or role session, scoped down and expiring automatically so a leak has a bounded lifetime.",
    d: "A token service accepts proof of identity, such as a signed assertion, an existing session or an instance identity document, checks that the principal may assume the requested role, and returns a key, secret and token valid for minutes to hours. The session may carry an inline policy that narrows permissions further. Verifiers check expiry and the signing key. The challenge is protecting the minting keys, supporting revocation of an already issued session, and keeping the issuing service available because every automated workload depends on it.",
    k: ["Short lifetimes vs long: a leak is limited to the lifetime; every workload must refresh and a token-service outage becomes everyone's outage.", "Self-contained signed tokens vs server-side sessions: verification needs no lookup; revocation requires a deny-list or waiting for expiry."],
    p: ["Role chaining extends effective session lifetime far beyond what the first role allowed.", "A token-service outage stops all running automation from refreshing, so applications fail an hour later."],
    v: "Mint a credential with a five-minute lifetime and a narrowed policy, confirm it works, confirm an out-of-scope call is denied, wait past expiry and confirm every call is rejected.",
    dep: ["principals", "encryption-key-service", "policy-evaluation"]
  },
  "identity-federation": {
    s: "Accepts identities proven by an external directory or provider, mapping them to roles in the cloud so organizations manage people in one place.",
    d: "The cloud trusts a configured external provider using standard sign-in protocols that exchange signed assertions. A mapping converts assertion attributes, such as group membership, into permitted roles. The external provider's keys are fetched and rotated. Users get a temporary session rather than a local account. The hard parts are mapping correctness, keeping the trust relationship from being abused to claim another tenant's roles, and what happens to running sessions when the user is removed upstream.",
    k: ["Federated sign-in vs local users: central offboarding and single sign-on; the cloud inherits the availability and security of the provider.", "Attribute-to-role mapping vs manual assignment: scales to large organizations; a mistaken attribute mapping can silently grant administrator."],
    p: ["A trust policy that does not check the audience lets an assertion from one organization be used against another's role.", "Upstream user removal does not end sessions already issued, which remain valid until they expire."],
    v: "Sign in through the provider with a user in and a user out of the mapped group, confirm only the first receives a session, then remove the first upstream and confirm new sessions fail and old ones expire on schedule.",
    dep: ["temporary-credentials", "principals"]
  },
  "service-roles": {
    s: "Roles that let cloud services act on a customer's resources on their behalf, with permissions the customer grants and can inspect.",
    d: "When a service must create a network interface or read a bucket for a customer, it assumes a role in the customer's account created for that purpose, and the customer's policy limits what it can do. The trust policy states which service may assume it and, for confused-deputy protection, for which account or resource. Service-to-service calls inside the cloud use the same mechanism where possible. The difficulty is the confused deputy problem, and scoping permissions narrowly when services need broad ones to do their job.",
    k: ["Customer-granted roles vs service-internal privilege: customers see and control what is done to their data; services need the role to exist and be correct before they work.", "Narrow per-action permissions vs one broad service role: narrow limits damage from a service bug; broad is easier to set up and fewer things break."],
    p: ["A service that trusts a user-supplied role identifier can be tricked into acting on another customer's resources.", "A customer deletes or edits the role and the service starts failing in a way that looks like a cloud outage."],
    v: "Have a service act through a role, attempt to make it act on a resource in a different account using the same role identifier, and confirm the second attempt is denied by the trust condition.",
    dep: ["temporary-credentials", "policy-documents"]
  },
  "encryption-key-service": {
    s: "Creates, stores and uses encryption keys on behalf of services and customers, performing cryptographic operations inside protected hardware so key material never leaves.",
    d: "Customers and services request keys; the service generates them in hardware security modules, stores wrapped copies and exposes operations such as encrypt, decrypt and generate a data key. Services use envelope encryption, protecting bulk data with data keys that are themselves wrapped by a master key. Key policies decide who may use each key. Keys rotate on schedule. The difficulty is availability, since losing a key loses the data it protects, and the operation rate, since every encrypted read may need a key call.",
    k: ["Envelope encryption vs encrypting data directly with the master key: the master key sees little traffic and data keys can be cached; there are more keys to track and wrap.", "Customer-managed keys vs provider-managed: customers can revoke access to their data; losing or disabling the key makes the data permanently unreadable."],
    p: ["A customer disables a key still used by running volumes and everything attached to it fails at the next restart.", "Backups of wrapped keys stored in one location are lost together with the module that unwraps them."],
    v: "Encrypt a volume with a customer key, disable the key, and confirm new attachments fail while the audit log records every use; re-enable it and confirm access returns without data loss.",
    dep: ["secrets-store", "policy-evaluation", "audit-log"]
  },
  "account-hierarchy": {
    s: "A tree of accounts grouped under organizational units, so large customers can apply billing, guardrails and delegation at any level.",
    d: "An organization has a root, units under it and accounts at the leaves. Policies and consolidated billing attach at any level and apply to everything below. Accounts can be created by API, which lets customers give each team or workload its own isolated account. The structure is stored in the global control plane because it applies across regions. It is hard because a move or policy change affects permissions across a huge set of resources, and the hierarchy must stay consistent while being read by every request's evaluation.",
    k: ["Many small accounts vs a few large ones: isolation, limits and cost visibility improve with many; cross-account access and management overhead grow.", "Policies inherited down the tree vs set per account: central control of guardrails; a single change at the top has wide, hard-to-predict effect."],
    p: ["Moving an account between units changes its effective policies instantly and can break production access.", "Deep nesting makes the effective policy for one account hard for any human to determine."],
    v: "Move a test account between two units with different guardrails and confirm its effective permissions change exactly as the destination unit's policy predicts, and that the move appears in the audit log.",
    dep: ["global-control-plane", "organization-policies"]
  },
  "tenant-isolation": {
    s: "The mechanisms that stop one account's resources, data and requests from being seen or affected by another, in every service and at every layer.",
    d: "Isolation is applied at several levels: the account identifier is part of every key in every database and is checked on every read, networks are separate by default, memory and disk are cleaned between uses, and compute is separated by virtualization. Services derive the account from the authenticated request and never from a parameter the caller supplied. The difficulty is that isolation is a property of every line of code: one query missing an account filter leaks data, and shared caches and shared queues are tempting places to forget it.",
    k: ["Account identifier in every key and query vs separate databases per tenant: shared storage is cheap and scales; one missing filter becomes a cross-tenant leak.", "Strong isolation for all workloads vs tiered isolation: uniform guarantees are simpler to explain; dedicated hardware for those who pay more adds a second path to maintain."],
    p: ["A cache keyed by resource name rather than account and name returns another customer's object.", "A reused disk block or memory page exposes the previous tenant's data to the next."],
    v: "Using two test accounts, request each other's resources by identifier through every API and confirm each response is indistinguishable from not found, and that nothing in the logs shows the data was read.",
    dep: ["resource-identifiers", "policy-evaluation"]
  },
  "organization-policies": {
    s: "Account-wide guardrails set by an organization that limit what any account beneath it can do, whatever those accounts' own administrators grant.",
    d: "These policies define the outer bound of permissions: deny creating resources outside approved regions, deny disabling audit logging, require encryption. They are evaluated together with the account's own policies and always win on deny. Because they apply to account administrators too, they are the tool central security teams use to bound teams that otherwise hold full control. The difficulty is testing their effect, since a mistaken guardrail can lock a whole business unit out of its own accounts.",
    k: ["Guardrails as limits only vs also granting permissions: limiting is safe and simple to reason about; granting would remove the need for per-account policy but mixes two meanings.", "Apply immediately vs staged enforcement: instant guardrails close gaps at once; staged audit-first rollout avoids outages at the cost of a window of risk."],
    p: ["A guardrail denying actions outside one region also blocks global services whose calls are served from another.", "No dry-run mode means the first test of a policy is the production lockout."],
    v: "Attach a deny guardrail to a unit, then try the denied action as the account's administrator and confirm denial citing the organization policy, while allowed actions in the same account still succeed.",
    dep: ["account-hierarchy", "policy-documents"]
  },
  "account-lifecycle": {
    s: "The states an account passes through from creation and verification to suspension, closure and deletion, with the rules for what happens to resources and data at each step.",
    d: "Creation verifies identity and payment and seeds default roles, quotas and a trail. Suspension for nonpayment or abuse blocks new work but preserves data for a grace period; closure stops billing and schedules deletion after a recovery window. Deletion must find every resource in every region and service, which requires an inventory that each service reports into. It is hard because resources exist in dozens of services and a missed one keeps billing or keeps data.",
    k: ["Delayed hard delete vs immediate: a recovery window rescues mistakes and fraud disputes; data lingers longer and storage is billed to nobody.", "Block at the front door when suspended vs let running resources continue: blocking stops abuse fast; it may kill a legitimate customer's production for a billing glitch."],
    p: ["A resource type missed by the deletion inventory keeps running and costing money after the account is closed.", "Suspension takes down a production system because the control plane cannot be used to scale it down or move it."],
    v: "Close a test account that owns resources in every service and region, wait out the window, and confirm an inventory sweep finds zero resources and billing shows zero charges.",
    dep: ["resource-model", "usage-metering", "global-control-plane"]
  },
  "resource-sharing": {
    s: "Lets one account grant another access to specific resources, such as a subnet, an image or a snapshot, without copying them or merging accounts.",
    d: "The owner creates a share that names resources and recipient accounts or organization units. The recipient's principals can then use the resource subject to their own permissions. Usage is attributed to the user while ownership stays with the owner. Services must understand that a resource may be referenced by an account other than the one that owns it. The difficulty is that nearly every authorization and cleanup assumption was written for single-owner resources, so sharing has to be audited in every service.",
    k: ["Share by reference vs copy to the recipient: no duplication and one source of truth; the owner's deletion or change affects every recipient immediately.", "Both owner and recipient must allow vs owner only: stricter and safer; harder for recipients to understand why access fails."],
    p: ["Deleting a shared subnet strands the recipient's running instances with no route.", "A service that logs only the owner's account makes the recipient's actions invisible in the recipient's audit trail."],
    v: "Share one resource to a second account, use it there, then revoke the share and confirm further use is denied, while the recipient's audit log recorded every earlier use under its own account.",
    dep: ["tenant-isolation", "policy-evaluation", "audit-log"]
  },
  "quota-model": {
    s: "The definition of what limits exist, what they count, at what scope and with what default, forming the contract between customers and the capacity the cloud has built.",
    d: "Each limit names a resource or rate, a scope such as account and region, a default and a hard maximum. Some count stock, such as the number of instances, others count rate, such as launches per minute. Limits can be adjustable by request or fixed by design. Defaults start low for new accounts and rise with trust and billing history. The difficulty is choosing limits that are protective yet do not block legitimate growth, and keeping them understandable across hundreds of resource types.",
    k: ["Many fine-grained limits vs a few coarse ones: precise protection of scarce resources; customers are confused by which limit they hit.", "Low defaults raised on request vs high defaults: new accounts cannot do much damage; legitimate customers hit friction on day one."],
    p: ["A limit hidden deep in a dependency is reached first and reported as an internal error rather than a quota error.", "A default that is generous for one region exhausts capacity in a new small region."],
    v: "For each limit, drive usage to the limit and confirm the next create fails with an error naming that quota, its current value and how to request an increase.",
    dep: ["resource-model", "account-hierarchy"]
  },
  "usage-counters": {
    s: "Counts of what each account currently holds and how fast it is calling, kept accurate enough to enforce limits at create time without becoming a bottleneck.",
    d: "On a create, the owning service increments a per-account counter in the same transaction that records the resource, and decrements on delete. Rate counters use windows or buckets. Counters live near the resource data in each cell, with a periodic reconciliation against the real resource list to repair drift. The difficulty is correctness under failure: a counter incremented by a create that then fails must be returned, and distributed increments must not exceed the limit when many requests race.",
    k: ["Counter in the same transaction as the resource vs asynchronous counting: exact under crash; the counter store must be the resource database, tying scale together.", "Strict enforcement vs a small overshoot allowed: strict is predictable; allowing slack is faster in distributed settings but lets customers exceed limits briefly."],
    p: ["A failed workflow leaves its reserved count held, slowly shrinking the customer's available quota to zero.", "Counter drift after a bug blocks creation for a customer with plenty of headroom in reality."],
    v: "Run many parallel creates against a quota of ten and confirm exactly ten succeed; then delete five and confirm the counter shows five used. Run the reconciliation job and confirm it finds no drift.",
    dep: ["resource-database", "quota-model"]
  },
  "limit-increase-workflow": {
    s: "The path by which a customer asks for a higher limit, and the checks on fraud risk and real capacity that decide whether to grant it.",
    d: "Requests arrive by API or console naming a limit, region and desired value. Automatic approval covers small increases for accounts in good standing; larger ones go to a person who checks the account's history, intended use and the capacity forecast. Approved values are written to the quota model and take effect without deploys. It is hard because the decision is a business and capacity question in disguise, and fully manual processes cannot keep up with scale.",
    k: ["Automated approval for small changes vs human review for all: fast for most customers; automation can be gamed by many small stepwise requests.", "Increase tied to capacity forecast vs granted on request: avoids promises the fleet cannot keep; slows customers whose growth the forecast missed."],
    p: ["Repeated small automatic increases add up to a limit that no human ever reviewed.", "Approved increases that cannot be fulfilled leave customers failing with capacity errors instead of quota errors."],
    v: "File an increase request for a test account, trace it through approval, and confirm the limit value changes in the quota model and a create that was failing at the old limit now succeeds.",
    dep: ["quota-model", "capacity-inventory"]
  },
  "capacity-reservations": {
    s: "Lets a customer hold specific compute capacity in advance in a zone, so a future launch cannot fail for lack of room.",
    d: "A reservation names a type, count, zone and duration. The placement system sets aside matching host capacity, marks it as claimed by that account and counts it against the account whether used or not. Launches that target the reservation consume it first. Reservations can be shared across an organization. The difficulty is that held but unused capacity is waste, so reservations require pricing and careful accounting, and that large reservations in a small zone can starve everyone else.",
    k: ["Hard reservation of specific hosts vs a soft pool guarantee: hard is simple to promise; soft packs better but cannot be guaranteed on a bad day.", "Billing reserved capacity whether used or not vs billing on use: the cloud can plan capacity; customers pay for idle space they hold for safety."],
    p: ["A reservation sized for a peak sits mostly idle and the customer finds out from the bill.", "Reserved capacity fragmented across many hosts cannot fit a large instance type when it is finally needed."],
    v: "Create a reservation in a zone, fill the rest of the zone with other accounts until it is full, then launch against the reservation and confirm it succeeds while a plain launch fails.",
    dep: ["capacity-inventory", "capacity-claims", "usage-metering"]
  },
  "usage-metering": {
    s: "Collects raw records of what each resource did and how long it existed, from hosts and services, into a durable stream that billing is computed from.",
    d: "Hosts and services emit usage records such as an instance running for a period, bytes stored or requests served, each with account, resource, type, region and a unique identifier. Records are batched, signed or checksummed and delivered to the metering pipeline, which dedupes and persists them. Lifecycle events from the compute service act as a second source to cross-check. It is hard because records must never be lost or double-counted despite crashes, replays and late arrival, and because this is financial data.",
    k: ["Emit usage from the host vs derive from lifecycle events: host records capture real use; events are simpler and independent of the host but may disagree with reality.", "At-least-once delivery with deduplication by identifier vs exactly once: dependable and simple; every consumer must handle replays correctly."],
    p: ["A host that crashes loses its last unsent batch, undercharging or leaving a gap that nobody notices.", "A clock error on a host assigns usage to the wrong billing period."],
    v: "Run a resource for a known interval, kill the host agent mid-period and restart it, and confirm the metered total equals the true duration within the documented tolerance with no duplicate record identifiers.",
    dep: ["telemetry-agent", "message-bus", "instance-state-machine"]
  },
  "usage-aggregation": {
    s: "Rolls raw usage records into per-account, per-resource totals over billing periods, handling late records and corrections.",
    d: "A batch and streaming pipeline groups records by account, product, region and time bucket, applies rounding and minimums, and writes totals that downstream rating reads. Late-arriving records are folded in by re-aggregating affected periods until the period is closed. It stores both detail, for customers who want line-item reports, and summaries. The difficulty is correctness over time: restating prior periods, handling clock skew, and proving that the totals reconcile with the raw records.",
    k: ["Immutable raw records plus recomputed totals vs mutable running counters: totals can always be rebuilt and audited; recomputation costs compute and time.", "Closing a period at a fixed delay vs holding it open: customers get a stable bill; records arriving after close need explicit adjustment lines."],
    p: ["A duplicate batch processed twice inflates one account's total until a customer notices.", "A late record posted into a closed period silently changes an invoice that was already sent."],
    v: "Replay a day of raw records into an empty pipeline and confirm the totals match the stored ones exactly for every account, and that a deliberately duplicated batch changes nothing.",
    dep: ["usage-metering", "resource-database"]
  },
  "rating-and-pricing": {
    s: "Turns aggregated usage into money, applying price lists, tiers, discounts, commitments and free allowances for each account.",
    d: "Prices are held in versioned price books by product, region and unit. Rating multiplies quantity by rate, applies volume tiers, free-tier allowances, committed-use and negotiated discounts, and credits, in a defined order. Because the order of discounts changes the total, the engine is deterministic and fully traced so each line can be explained. Difficulty comes from the combinations: many products, many contract types and price changes that apply from a date.",
    k: ["Rate every record vs rate aggregates: per-record is precise and traceable; aggregates are much cheaper but make tiering and refunds harder.", "Price book versioned by effective date vs edited in place: past invoices can be reproduced; the number of versions and their interactions grows."],
    p: ["A discount applied before tax in one path and after in another produces invoices that differ by small amounts that auditors flag.", "A price change effective mid-period is applied to the whole period instead of from its start date."],
    v: "Rate a fixed set of usage for sample accounts under each discount type and compare the result against a hand-computed spreadsheet, line by line, then rerun on a later date and confirm identical output.",
    dep: ["usage-aggregation", "account-hierarchy"]
  },
  "invoicing": {
    s: "Assembles rated charges into a document per paying account, applies credits and taxes, and collects payment.",
    d: "At period close the system collects each payer's rated lines, groups them by linked account for consolidated billing, adds taxes for the customer's jurisdiction, subtracts credits and produces an invoice with a total. It then charges the payment method or issues terms. Failed payments start a retry and dunning process that can end in suspension. It is hard because it is legally regulated, because currency and tax rules vary widely, and because mistakes are visible and costly.",
    k: ["Consolidated billing across an organization vs invoicing each account: one payer is manageable and gets volume pricing; allocation to teams needs extra tooling.", "Charging in arrears at period end vs prepaid balances: arrears is simpler for customers; the provider carries credit risk."],
    p: ["A tax rule change not deployed in time under- or over-charges a whole country's customers.", "A payment retry loop charges a card multiple times after a gateway timeout."],
    v: "Close a sample billing period for a test organization with several linked accounts and verify the invoice totals equal the sum of rated lines plus tax, and that retrying the payment step yields one charge.",
    dep: ["rating-and-pricing", "account-lifecycle"]
  },
  "budgets-and-alerts": {
    s: "Lets customers set spending thresholds and be notified, or have actions taken, when actual or forecast cost approaches them.",
    d: "A budget names a scope such as an account or tag, a period and an amount. A job compares running cost, which is available hours ahead of the invoice, and a forecast against thresholds and sends notifications or triggers automated actions such as applying a restrictive policy. Because usage data is delayed, alerts lag actual spend. It is hard because cost data is eventually consistent and anomalies, such as a runaway autoscaler, can burn large sums in the lag.",
    k: ["Alert only vs act automatically: alerts never break production; automatic action actually caps spend but can stop a legitimate workload.", "Frequent cost updates vs daily: faster detection of runaways; more load on the metering and aggregation pipeline."],
    p: ["Billing data arrives a day late, so an alert for a budget fires after the money is already spent.", "A budget action that denies launches also blocks the scaling that was meant to handle an incident."],
    v: "Create a budget at a low threshold, generate usage that crosses it, and measure the time from the usage to the notification; confirm it arrives within the documented lag and names the right scope.",
    dep: ["usage-aggregation", "event-notifications", "tags-and-labels"]
  },
  "cost-allocation": {
    s: "Attributes shared and consolidated costs to teams, projects and tags, so each group can see and own what it spends.",
    d: "Cost allocation reports group line items by account, resource tag, service and period. Shared costs, such as a network gateway used by many teams, are split by rules the customer defines. Tags must be activated and applied before costs accrue, as they are not retroactive. Reports export to storage for external analysis. The difficulty is that allocation depends on the quality of tagging, and that attribution of shared infrastructure is a judgment rather than a fact.",
    k: ["Allocate by tag vs by account: tags are flexible and span accounts; they depend on discipline and cannot be enforced everywhere.", "Provider-computed splits of shared cost vs customer-computed: a standard answer in the console; customers with their own accounting still rebuild it."],
    p: ["Resources created before the tag was activated show as unallocated in historical reports.", "A shared resource's cost is split by a rule that no longer matches how it is used."],
    v: "Tag a set of resources across two accounts, run workloads, and confirm the allocation report's per-tag totals sum exactly to the invoice total with the unallocated remainder shown as its own line.",
    dep: ["tags-and-labels", "usage-aggregation"]
  },
});
