// Details for the zero-trust access proxy plate, part 4: identity provider integration, control plane.
ATLAS.details("zero-trust-proxy", {
  "idp-federation": {
    s: "The trust relationship through which the proxy accepts the identity provider's signed statement about who a user is.",
    d: "The proxy is registered with the identity provider as a client or service provider, exchanging metadata, keys and redirect addresses. At login it sends the user to the provider and validates the signed response: signature, issuer, audience, expiry and the nonce it sent. Standard protocols make this interchangeable across providers. The work is in the details: signing key rotation by the provider, clock skew, differences in claim names and attribute formats, and rejecting responses meant for another application.",
    k: ["Token-based federation versus assertion-based federation: token flows are lighter and suit modern clients; assertion flows are widely deployed in older systems and heavier.", "Fetch provider keys dynamically versus pin them: dynamic fetch survives rotation and trusts the endpoint; pinning is tight and breaks when the provider rotates."],
    p: ["Skipping audience validation accepts a token that was issued to a different application.", "Provider key rotation breaks login because the proxy cached the old key set forever."],
    v: "Present a response with a wrong audience, an expired one and one signed by an unknown key. All must be rejected. Rotate the provider's signing key and confirm login continues without manual change.",
    dep: ["signing-key-management"]
  },
  "multi-idp-routing": {
    s: "Supporting more than one identity provider, such as employees, contractors and partners, and choosing the right one for each user.",
    d: "Organizations often have several sources of identity after acquisitions or for external parties. The proxy picks a provider from the hostname, the user's email domain, a chosen tile on a login page or application settings. Each provider maps to different claims and trust levels, and policy must know which provider authenticated the user so partner accounts do not receive employee access. Account linking, two accounts for one person, and discovery of the right provider without leaking which exist are the hard parts.",
    k: ["Home-realm discovery by email domain versus an explicit choice: domain discovery is smooth and reveals which domains are customers; an explicit choice is transparent and adds a step.", "Merge identities across providers versus keep separate: merging simplifies policy and risks cross-provider takeover; separate keeps boundaries and duplicates rules."],
    p: ["Two providers issue the same email address, and policy treats the partner as an employee.", "A user's identity from an untrusted provider is matched by email to a privileged account."],
    v: "Sign in as a partner user whose email matches an employee's, and confirm the session is bound to the partner provider with no employee group membership.",
    dep: ["idp-federation","claim-and-group-mapping"]
  },
  "claim-and-group-mapping": {
    s: "Translating the provider's attributes and group names into the identities and roles the proxy's policy refers to.",
    d: "Providers send claims such as email, groups, department and authentication method, in different names and formats. A mapping layer converts them into a standard internal form: a stable user identifier, normalized groups, an authentication strength. Policy is written against the internal form, so a provider change does not rewrite every rule. Mapping must use immutable identifiers, not changeable ones like email, handle missing claims and cope with large group sets that providers send by reference rather than in the token.",
    k: ["Stable internal identity versus using the provider's raw claims: internal identity decouples policy from the provider and needs a mapping to keep correct; raw claims are direct and brittle.", "Map groups by name versus by identifier: names are readable and break on rename; identifiers are stable and unreadable."],
    p: ["Keying on email lets a recycled address inherit a previous employee's access.", "A renamed group silently stops matching, and everyone loses access."],
    v: "Rename a mapped group in the provider and confirm policy outcomes do not change when identifiers are used. Send a token missing a required claim and confirm a defined deny, not an error or a default allow.",
    dep: ["idp-federation"]
  },
  "user-provisioning-sync": {
    s: "Keeping the proxy's user records in step with the directory as people join, move and leave, ideally within minutes.",
    d: "Through a standard provisioning interface or periodic directory reads, the proxy learns of new accounts, changed attributes and disabled users. Deprovisioning is the critical case: a disabled account must lose sessions and devices quickly, not at the next login or token expiry. Without sync the proxy only learns about changes when the user next authenticates. Delays, partial failures and large organizations make this a reconciliation problem as much as an event stream.",
    k: ["Event-driven provisioning versus periodic full sync: events are prompt and can miss changes; full sync is the safety net that corrects drift, with a delay.", "Delete records on removal versus disable: deletion cleans up and loses audit history; disabling keeps logs attributable."],
    p: ["A missed deprovisioning event leaves a former employee's sessions valid until they expire.", "Reusing a username for a new employee attaches old records and permissions to the new person."],
    v: "Disable a test user in the directory and measure the time until their sessions and device bindings are revoked at the edge, comparing it to the documented target.",
    dep: ["session-revocation","directory-lookup-cache"]
  },
  "authentication-strength": {
    s: "A measure of how strongly the user proved identity, such as password only, one-time code, or a hardware-bound credential, kept with the session.",
    d: "The identity provider reports the methods used and when. The proxy maps them into levels that policy can require: ordinary applications accept a basic multi-factor method, sensitive ones require a phishing-resistant credential. Not every method is equal, and the level should reflect resistance to interception and replay and not just the number of factors. Strength decays with time, so the level and its age are both stored. Inconsistent reporting between providers makes comparison unreliable.",
    k: ["Level names defined by the proxy versus the provider's own: proxy levels give consistency across providers and need a mapping to maintain; provider levels are direct and not comparable.", "Require phishing-resistant methods broadly versus only for sensitive apps: broad requirement removes a class of attack and needs hardware for everyone; targeted keeps cost down and leaves most apps exposed."],
    p: ["Counting a text-message code as strong authentication leaves users open to simple real-time phishing.", "A provider that does not report the method makes every login appear weak or every login appear strong."],
    v: "Sign in using each supported method and inspect the stored strength. Confirm an application requiring a hardware-bound credential denies the weaker methods with a step-up reason.",
    dep: ["idp-federation","claim-and-group-mapping"]
  },
  "authentication-context-requests": {
    s: "Asking the identity provider for a specific level or recency of authentication when a policy needs more than the existing login provides.",
    d: "During step-up the proxy sends the provider a request specifying the needed method class and maximum age of the last authentication. The provider prompts accordingly and states in its response what it actually did, which the proxy verifies, since a provider may ignore the request. The proxy then updates the session. It must handle providers that cannot satisfy a request, and prevent loops where a requirement can never be met.",
    k: ["Ask for a specific context versus a generic prompt: specific requests give predictable results where providers support them; generic prompts work everywhere and may not raise strength.", "Verify the provider's reported context versus trust the redirect: verification catches ignored requests; trust is simpler and assumes the provider complied."],
    p: ["The provider returns a response without performing the requested method, and the proxy accepts it.", "An unsatisfiable requirement sends the user around the login in a loop."],
    v: "Request a stronger method from a provider and confirm the response lists it and the session is updated. Use a provider configured to ignore the request and confirm the proxy refuses to upgrade.",
    dep: ["idp-federation","authentication-strength"]
  },
  "directory-lookup-cache": {
    s: "A cache of directory data, such as group membership and attributes, that the edge consults at decision time instead of querying the directory.",
    d: "Fetching group membership on every request would overload the directory and add latency, so the proxy keeps a cache filled by sync and by lookups at login and refreshed on events or a short timer. The cache stores only what policy uses, with timestamps. Staleness is the tradeoff: a user removed from a group retains access until the entry refreshes. Cache size, nested groups and the cost of expanding membership for very large groups are the hard parts.",
    k: ["Short cache lifetime versus long: short is current and loads the directory; long is fast and keeps removed rights alive longer.", "Store expanded membership versus resolve at request time: expanded is fast and large and stale; resolving is current and slow."],
    p: ["A directory outage with an expired cache either blocks everyone or silently keeps old rights.", "Cached negative answers keep a newly added user denied after they join the group."],
    v: "Add and remove a user from a group and measure the time until decisions change in each direction. Take the directory offline and confirm the configured behavior holds past cache expiry.",
    dep: ["user-provisioning-sync"]
  },
  "workload-identity-tokens": {
    s: "Short-lived tokens that identify programs and services, issued by a trusted platform and accepted by the proxy in place of a user login.",
    d: "A cloud platform, orchestrator or build system can issue a signed token stating which workload is running. The proxy trusts the issuer, validates the token and its claims, such as repository, namespace or service account, and maps them to a service identity that policy can reference. Tokens last minutes, so theft is of limited use. The configuration must be precise about which claims are required, since a loose match can let any workload on the platform act as a specific one.",
    k: ["Federated workload tokens versus stored client secrets: federation removes long-lived secrets and needs a trust setup per issuer; secrets are simple and leak.", "Match on narrow claims versus on the issuer alone: narrow claims limit which workload can act; issuer-only trusts everything the platform runs."],
    p: ["Trusting any token from the issuer lets every workload on the platform assume every service identity.", "Tokens accepted for any audience can be replayed against unrelated systems."],
    v: "Use a token from the expected workload and one from another workload on the same platform. Only the first must be accepted, and the log must name the service identity and claims matched.",
    dep: ["idp-federation","signing-key-management"]
  },
  "admin-console-and-api": {
    s: "The interface and programmatic API through which administrators define applications, policy, connectors and settings.",
    d: "The console is the human view, and the API is the primary interface that automation, policy-as-code pipelines and integrations use. Both enforce administrator authentication, authorization and logging identically, so nothing is possible only through one. Operations are validated before they apply, return clear errors, and are idempotent for automation. The API must be versioned carefully because pipelines depend on it, and rate limits protect the control plane from a runaway script.",
    k: ["API first with console on top versus separate paths: one path means equal controls and testing; separate paths allow quick console features and drift in behavior.", "Fine-grained API permissions versus a few broad roles: fine grains support least privilege and are laborious; broad roles are easy and give too much."],
    p: ["The API lacks an audit trail that the console has, so scripted changes go unrecorded.", "Unvalidated changes saved through the API break routing for live applications."],
    v: "Make the same change through the console and the API and confirm both are validated identically, produce the same stored result and appear in the audit log with the actor.",
    dep: ["configuration-store","admin-roles-and-change-control","admin-audit-log"]
  },
  "configuration-store": {
    s: "The durable, versioned record of every application, policy, connector and setting, from which the edge configuration is built.",
    d: "The store keeps each object with history, so a past state can be restored and changes compared. It enforces referential integrity: an application cannot point to a policy that does not exist. Writes are transactional so a multi-object change either applies fully or not at all. Because it is the source of truth for security configuration, it needs backups, tight access control and a recovery process tested before it is needed. It is not read on the request path, which keeps its performance requirements modest.",
    k: ["Immutable versions versus in-place updates: versions allow rollback and audit and take more storage; in-place edits are simple and lose history.", "A single store versus per-region stores: single is consistent and a global dependency; per-region survives local failure and needs reconciliation."],
    p: ["Restoring an old backup brings back deleted access and nobody notices until a user reports it.", "A partial write leaves an application pointing at a missing policy, which then defaults to deny or allow unpredictably."],
    v: "Make a change, then restore the prior version and confirm the edge returns to the previous decisions. Restore the whole store from backup into a test environment and confirm it serves the current configuration.",
    dep: ["tenant-isolation"]
  },
  "configuration-distribution": {
    s: "Compiling configuration and delivering it to every edge node and connector with versions, integrity checks and fast revocation updates.",
    d: "The control plane compiles the stored configuration into the form edge nodes use, signs it, and distributes it by push or by nodes pulling on change notifications. Nodes verify the signature, apply it atomically and report the version in use. Different data has different urgency: revocations must arrive within seconds, while application definitions can take minutes. The distribution network has to cope with nodes that are offline and must catch up in order without applying an old version over a newer one.",
    k: ["Push versus pull: push is prompt and needs connection tracking; pull is simple and robust and delays updates by the polling interval.", "Whole snapshots versus incremental updates: snapshots are easy to verify and heavy; incremental updates are small and can leave a node in an unknown state after missing one."],
    p: ["An unsigned distribution channel lets an attacker push policy that allows everything.", "A node applies an older snapshot received late, undoing a revocation."],
    v: "Change a rule and confirm every node reports the new version within the target time. Replay the previous version to a node and confirm it is rejected as older.",
    dep: ["configuration-store","signing-key-management"]
  },
  "admin-roles-and-change-control": {
    s: "Who may change what in the control plane, with approvals for risky changes and separation between those who write policy and those who approve it.",
    d: "Administrators hold roles scoped to applications, tenants or functions: read-only, application owner, policy editor, security administrator. Dangerous changes, such as editing a global rule or adding a connector, require a second person's approval. Administrator sessions use strong authentication and are limited by device and network. This matters because the control plane can grant anyone access to anything, so compromising an administrator is equivalent to compromising every protected application.",
    k: ["Two-person approval versus single administrator: two-person limits mistakes and abuse and slows urgent changes; single is fast and trusts one account.", "Scoped roles versus a small group of superusers: scoped roles limit exposure and take design effort; superusers are easy and a prime target."],
    p: ["Too many superusers means an administrator's laptop compromise becomes a company-wide breach.", "Approval workflows applied to every trivial change get bypassed by sharing credentials."],
    v: "Attempt a global policy change as an application owner, and as a policy editor without approval. Both must be refused or held pending, and the attempts must appear in the audit log.",
    dep: ["authentication-strength","admin-audit-log"]
  },
  "application-certificate-management": {
    s: "Obtaining, storing, renewing and deploying the certificates the edge presents for each protected hostname.",
    d: "Each application hostname needs a valid certificate. The control plane requests them from a certificate authority through an automated protocol, proves control of the domain, stores private keys protected, and distributes them to the edge. Renewal runs well before expiry with monitoring for failures. For private applications the organization may use its own authority and deploy its root to devices. Large numbers of hostnames hit issuance rate limits and make a single expiry a visible outage.",
    k: ["Public authority versus private authority: public certificates work with every browser unmodified; a private authority gives control and requires distributing trust to devices.", "Wildcard certificates versus one per hostname: a wildcard simplifies issuance and widens the damage of a leaked key; per-host narrows it and multiplies renewals."],
    p: ["An unmonitored failed renewal turns into an expired certificate and an outage on one hostname.", "Private keys copied into a ticket or configuration repository for troubleshooting."],
    v: "List every hostname with its certificate expiry and confirm the shortest is still beyond the renewal threshold. Force a renewal in staging and confirm edge nodes serve the new certificate without dropped connections.",
    dep: ["signing-key-management","configuration-distribution"]
  },
  "tenant-isolation": {
    s: "Keeping one customer's or business unit's configuration, keys, logs and traffic separate from another's in a shared deployment.",
    d: "In a multi-tenant service or a large organization with divisions, each tenant has separate configuration namespaces, keys and log storage, and queries are always scoped to a tenant identifier. Isolation must hold in the control plane, the edge's caches and the logs. Mistakes are typically missing tenant filters in one code path. A request routed to the wrong tenant's policy is a severe failure, since it grants access using another organization's rules.",
    k: ["Strong isolation with separate stores versus shared stores with tenant filters: separate stores limit the blast radius and cost more; shared stores are efficient and rely on every query being correct.", "Per-tenant keys versus shared keys: per-tenant keys contain compromise and multiply key operations."],
    p: ["A query path without a tenant filter returns another tenant's logs.", "A shared cache keyed only by hostname serves one tenant's policy to another."],
    v: "Create two tenants with the same hostname and application name, then confirm that each sees only its own configuration, logs and decisions, and that a crafted request cannot select the other tenant.",
    dep: ["configuration-store","signing-key-management"]
  },
  "signing-key-management": {
    s: "Generating, protecting, rotating and retiring the keys that sign sessions, assertions, configuration and device certificates.",
    d: "The proxy signs session tokens, identity assertions, distributed configuration and sometimes issues certificates. These keys sit in hardware modules or a key management service, with access limited to specific components. Verification keys are published to nodes with identifiers so signers and verifiers agree. Rotation must overlap: new keys sign while old keys still verify until their tokens expire. The consequence of a leaked signing key is that anyone can mint a valid session, so detection and emergency rotation procedures need rehearsal.",
    k: ["Hardware-protected keys versus software keys: hardware keys resist extraction and limit throughput and portability; software keys are easy to use and easy to steal.", "Frequent rotation versus rare rotation: frequent rotation limits exposure and tests the process; rare rotation is quiet and unpracticed when it is urgent."],
    p: ["A rotation that retires the old verification key too early invalidates every live session.", "Emergency rotation has never been rehearsed and takes a day instead of minutes."],
    v: "Rotate the session signing key in staging while sessions are active. Confirm existing sessions keep working during the overlap, new sessions use the new key, and a token signed with the retired key is rejected afterward.",
    dep: []
  },
});
