// Details for the identity provider plate, part 4: sessions, federation, directory, platform.
ATLAS.details("identity-provider", {
  "session-store": {
    s: "The server-side record that a user authenticated, holding when, how, from where, which applications joined it and which tokens depend on it.",
    d: "On successful sign-in the provider creates a session with a random identifier, subject, authentication time, methods used, assurance level, device and a list of participating clients. It is read on every authorization request and refresh, so it lives in a fast replicated store with expiry. Logout, revocation and lifecycle workflows operate on it. It is hard because it is shared mutable state on the hot path: it must be consistent enough that a logout takes effect everywhere, and cheap enough to scale to millions of concurrent users.",
    k: ["Server-side sessions vs stateless signed cookies: server-side sessions can be revoked and inspected, while stateless ones scale without storage and cannot be recalled before expiry.", "In-memory replicated store vs durable database: memory is fast and loses sessions on failure, while a database survives restarts and costs latency."],
    p: ["A session store outage logs out every user at once when sessions are not persisted anywhere else.", "Session identifiers that are not rotated after sign-in allow fixation by an attacker who planted the value."],
    v: "Sign in and confirm a session record exists with method and time, restart one service node and confirm the session survives, then end it from the admin console and confirm the next request prompts for login.",
    dep: ["cache-layer","sso-cookie"]
  },
  "sso-cookie": {
    s: "The browser cookie that identifies the provider's session, letting the user skip sign-in when another application redirects them there.",
    d: "After login the provider sets a cookie on its own domain, marked secure, inaccessible to scripts and restricted by site policy, naming the session. When another application starts a flow, the browser sends the cookie and the provider can issue a code without a prompt. This is single sign-on. Browsers now restrict cross-site cookies and third-party contexts, which breaks silent re-authentication in embedded frames. The difficulty is keeping it both usable in changing browser rules and safe from theft.",
    k: ["Strict same-site settings vs lax: strict blocks cross-site requests carrying the cookie, but breaks redirects from other sites unless the flow is designed for it.", "A host-prefixed cookie on the exact domain vs a wide domain cookie: exact domain prevents sibling subdomains from overwriting it, while wide domains are convenient and exposed."],
    p: ["A cookie without the secure and script-hiding flags can be stolen over a plain connection or by injected script.", "Silent re-authentication through hidden frames stops working when browsers block third-party cookies, and nobody tested the fallback."],
    v: "Inspect the set cookie for secure, script-hiding and same-site attributes and a host prefix, then start a second application's flow and confirm sign-in without a prompt, and fail with the cookie removed.",
    dep: ["session-store","hosted-login-pages"]
  },
  "session-lifetime-policy": {
    s: "Rules for how long a session lasts: idle timeout, absolute maximum, and different limits for sensitive applications or untrusted devices.",
    d: "A session ends after inactivity, after a hard maximum since sign-in, or earlier by policy for specific clients. Activity extends idle time only through the provider, so applications that work offline do not keep it alive. Policies can vary by device trust, risk and tenant. Applications maintain their own sessions too, so the effective life is the longest of several. The conflict is between users who hate repeated prompts and security teams that want short limits, with applications each doing something different.",
    k: ["Idle plus absolute limits vs idle only: an absolute limit forces periodic proof even for continuous users, but interrupts long work sessions.", "Provider session longer than application sessions vs shorter: longer is convenient and lets applications refresh quietly, while shorter makes the provider the stricter gate."],
    p: ["An application session that outlives the provider session keeps working after logout, so the policy is only nominal.", "Long default lifetimes picked at launch are never revisited and become the weakest setting."],
    v: "Set a one-minute idle limit in a test tenant, wait two minutes, and confirm the next authorization request prompts for login, and that a request within the limit does not.",
    dep: ["session-store","tenant-configuration"]
  },
  "session-binding": {
    s: "Tying a session or token to attributes of the client, such as a device key or network characteristics, so that stolen session material is harder to reuse elsewhere.",
    d: "At sign-in the provider records attributes such as a device-bound key, the address range or client characteristics. Later requests are compared with them, and mismatches lower trust or end the session. Cryptographic binding, where the browser holds a private key and proves possession on each use, is much stronger than comparing addresses, which change legitimately on mobile networks. It is a response to session theft by malware, which bypasses passwords and factors altogether.",
    k: ["Cryptographic device binding vs address and fingerprint checks: cryptographic binding resists theft robustly, but needs browser and platform support, while heuristics work everywhere and generate false alarms.", "Ending the session on mismatch vs asking for step-up: ending is safer, while step-up spares users who changed networks."],
    p: ["Strict address matching breaks sessions every time a phone moves between networks.", "Binding checked only at sign-in and not on later requests protects nothing after the cookie is stolen."],
    v: "Copy a session cookie to another client in a test, make a request and confirm it is rejected or triggers step-up, while the original client continues to work after switching networks.",
    dep: ["session-store","device-recognition","sender-constrained-tokens"]
  },
  "single-logout": {
    s: "The coordinated end of a user's sign-in across the provider and all the applications that joined the session, triggered from any one of them.",
    d: "A logout request ends the provider session and then notifies each participating application through the browser or the back channel, so each clears its own session. Applications may also check the provider session periodically. Some applications never receive the notice, so single logout is best effort. The provider tracks which clients joined and which have confirmed. It is hard because it spans systems with different capabilities, and because users who see a logout confirmation assume everything has ended.",
    k: ["Best-effort propagation with short application sessions vs guaranteed logout: guarantees are impossible across independent systems, so bounding the time is the practical goal.", "User-initiated logout everywhere vs logout of one application: global logout is safer on shared computers, while per-application logout avoids surprising people."],
    p: ["A logout page that shows success while some applications never got the notice gives false assurance.", "Logout that clears only the provider's cookie leaves each application's own session fully usable."],
    v: "Sign in to three test applications, log out from one, and confirm the provider session ends, each application is notified or loses access within the bound, and the logout page lists any that did not confirm.",
    dep: ["session-store","front-channel-logout","back-channel-logout"]
  },
  "front-channel-logout": {
    s: "Logout notification delivered through the user's browser, by loading each application's logout address in hidden frames or redirects during the provider's logout.",
    d: "On logout the provider renders a page that loads each participating application's registered logout address, so the browser sends that application's own cookies and the application clears its session. It needs no direct network path from provider to application. It depends on the browser: modern browsers block third-party cookies in frames, which stops the application's cookies from being sent and silently breaks this method. It also relies on the page staying open long enough to finish.",
    k: ["Browser-carried notices vs server-to-server: browser-carried ones reach applications behind firewalls and use their cookies, but break under cookie restrictions and closed tabs.", "Sequential redirects vs parallel frames: sequential redirects work with cookie restrictions, but are slow and fail if one hop fails."],
    p: ["Third-party cookie blocking makes the frames succeed visually while the application sessions remain.", "Closing the tab after clicking logout stops the notices partway, leaving some applications live."],
    v: "Log out with three applications joined in a browser with third-party cookies blocked, and record which applications actually lost their session, comparing with the number the provider believes it notified.",
    dep: ["single-logout","client-registry"]
  },
  "back-channel-logout": {
    s: "Logout notification sent directly from the provider's servers to each application's registered address as a signed token naming the session or user.",
    d: "The provider posts a logout token signed with its key to each application's back-channel address. The application verifies it, finds sessions matching the subject or session identifier and ends them. It does not depend on browsers, so it works with blocked cookies and closed tabs, but requires the application to be reachable and to store a mapping from provider session to its own. Failed deliveries are retried. It is the more reliable method, with the cost of application work and network paths.",
    k: ["Back-channel with retries vs front-channel only: back-channel is reliable independent of browsers, but needs reachable endpoints and an application-side session index.", "Notifying on every logout vs only on security events: every logout keeps sessions tight, while limiting it reduces load and leaves normal logouts to expiry."],
    p: ["Applications that accept the logout token without verifying issuer, audience and signature let anyone log out any user.", "A receiving endpoint behind a login wall rejects the provider's call and fails silently."],
    v: "Trigger logout and confirm each test application receives a signed token once, verifies it and ends the matching session, then take one application down and confirm the provider retries and eventually reports failure.",
    dep: ["single-logout","jwks-publishing","token-endpoint"]
  },
  "trusted-device-memory": {
    s: "Remembering that a user chose to trust a device, so that a second factor is skipped there for a limited time.",
    d: "After a successful factor check the user can opt in, and the provider issues a token or stores a record tied to the user and device with an expiry. Later sign-ins from that device with a valid password skip the second factor. Policy sets how long trust lasts and which applications honor it. Users can list and revoke trusted devices. It trades security for friction: the memory itself is a bearer artifact, so its theft recreates the password-only attack.",
    k: ["Remembering for days or weeks vs every sign-in: remembering suits daily use, but widens the window if the device or cookie is stolen.", "Trust tied to the account and device key vs a bare cookie: a bound key is hard to move to another computer, while a cookie is simple and portable."],
    p: ["Trust that survives a password reset lets an attacker who knows the old password keep skipping the factor.", "Offering remember-me on shared computers by default leaves trust on machines the user does not own."],
    v: "Trust a test device, sign in again and confirm no factor prompt, then change the password or revoke trust and confirm the factor prompt returns on the next sign-in.",
    dep: ["device-recognition","session-store","factor-policy-engine"]
  },
  "saml-support": {
    s: "Issuing and consuming signed XML assertions for enterprise applications and partners that do not speak the newer token protocols.",
    d: "As an identity provider it receives authentication requests from applications, authenticates the user and returns a signed assertion with subject, attributes and conditions through the browser. As a service it accepts assertions from partners' providers, validating signature, issuer, audience, time and replay. Metadata documents exchange keys and endpoints. It is hard because the format is large and signature handling is notoriously subtle: wrapping attacks move signed content around a document, and parsers resolve external entities if not locked down.",
    k: ["Supporting the older format vs OpenID-based federation only: support unlocks large enterprise estates, but carries a bigger, harder-to-secure code path.", "Signing the assertion and the response vs only one: signing both protects more of the message, while one is sufficient if verifiers check which element was signed."],
    p: ["Verifying a signature without checking that the signed element is the one actually used allows signature wrapping.", "An XML parser with external entities enabled lets a crafted request read files or call internal services."],
    v: "Send a test assertion with the assertion body altered after signing, with a wrapped duplicate, and an expired one, and confirm all three are rejected, then confirm a correct assertion yields a session.",
    dep: ["federation-trust-metadata","signing-key-store","inbound-attribute-mapping"]
  },
  "upstream-oidc-connections": {
    s: "Configured connections that delegate authentication to another OpenID-based provider, which a customer or partner operates, and accept its tokens as proof.",
    d: "An administrator registers the upstream's issuer, client credentials and mapping rules. When a user is routed there, the provider acts as a client: runs the code flow, validates the identity token against the upstream's keys, maps claims to a local account and creates its own session. Trust is limited by configuration: which issuers are accepted, for which domains and with which claims. Hard parts are mix-up attacks between multiple upstreams and wrongly trusting attributes the upstream does not control.",
    k: ["Linking by the upstream's stable subject vs by email: the subject is safe and tied to that issuer, while email is convenient and open to takeover.", "One connection per customer vs shared connections: per customer isolates trust and keys, but multiplies configuration for the operations team."],
    p: ["Accepting tokens from any configured issuer for any tenant lets one customer's provider assert identities in another.", "Not checking which issuer a response came from lets a malicious upstream's response be processed as another's."],
    v: "Configure a test upstream, sign in through it, confirm the local account is keyed by issuer and subject, and confirm a token from a different issuer with the same subject creates a separate identity.",
    dep: ["inbound-attribute-mapping","federation-trust-metadata","account-linking","jwks-publishing"]
  },
  "social-login": {
    s: "Letting people sign in with an account from a large consumer provider, reducing registration friction at the cost of depending on that provider's rules and data.",
    d: "The provider registers as a client of each consumer provider and offers buttons on the login page. After the upstream authenticates the person, claims are mapped to a local profile, and often a first-time flow collects missing attributes. Policies decide whether to link to existing accounts and whether those identities may reach sensitive applications. Each provider differs in claim quality, email verification and API terms. It reduces password handling but couples availability and privacy to others.",
    k: ["Offering social login vs only own credentials: social increases conversion and removes passwords, but leaves users reliant on accounts the provider cannot support or recover.", "Treating social identities as lower assurance vs equal: lower assurance reflects weaker verification, but requires policy to demand extra proof for sensitive actions."],
    p: ["Trusting an unverified email from a consumer provider enables takeover of an account with that address.", "A change in the upstream's terms or scopes breaks sign-in for a large user group overnight."],
    v: "Sign in with a test upstream account, confirm a local account is created with the upstream subject recorded, then sign in with an upstream account that has an unverified matching email and confirm no automatic link.",
    dep: ["upstream-oidc-connections","account-linking","inbound-attribute-mapping"]
  },
  "home-realm-discovery": {
    s: "Choosing which upstream or tenant should authenticate a user, based on the email domain, an application hint or a prior choice.",
    d: "When an organization has several identity sources, the provider must decide where to send the person. It matches the domain of the identifier against verified domain claims, honors a hint from the application, or shows a chooser. The mapping from domain to connection is configuration the tenant owns. It is hard because the mapping is a trust decision: whoever can claim a domain controls where its users authenticate, and ambiguity or unverified claims lead to misrouting.",
    k: ["Domain-based routing vs a chooser page: routing is seamless, while a chooser avoids guessing but exposes which connections exist.", "Requiring proof of domain ownership vs trusting the tenant: proof prevents one tenant claiming another's domain, at the cost of onboarding steps."],
    p: ["Accepting an unverified domain claim lets an attacker route a company's users to their own provider.", "Discovery responses that vary with connection existence disclose which customers use the service."],
    v: "Register a domain without proof and confirm routing for it is refused, verify it with a DNS record, then submit an identifier with that domain and confirm the redirect to the tenant's connection.",
    dep: ["tenant-configuration","upstream-oidc-connections","saml-support","identifier-first-flow"]
  },
  "inbound-attribute-mapping": {
    s: "Rules that translate attributes and groups arriving from an upstream provider into the local profile and roles, deciding which of them to trust.",
    d: "Each connection has mappings from upstream claim names and formats to local attributes, with rules about overwrite on each sign-in, trust per attribute and defaults. Attributes the upstream cannot authoritatively state should be ignored: a partner may assert its users' names but not their roles in your system. Transformations normalize case and format. Errors are quiet and consequential: a missing mapping yields empty fields, and a too-generous one grants privileges.",
    k: ["Updating attributes on each login vs only at creation: updating keeps data current and lets the upstream remove access, but overwrites local edits.", "Allow-list of mapped claims vs mapping everything: an allow-list prevents a hostile upstream from setting sensitive fields, but requires configuration for each new need."],
    p: ["Mapping an upstream's group claim directly to local administrator roles lets that upstream's admins administer your system.", "Not updating groups on login leaves a removed member with their old access."],
    v: "Send test assertions with extra claims, including one naming a local administrator role, and confirm only allow-listed attributes are stored and the role claim is ignored for that connection.",
    dep: ["directory-schema","group-and-role-mapping","identifier-normalization"]
  },
  "just-in-time-provisioning": {
    s: "Creating a local account automatically at the first successful federated sign-in, using the attributes the upstream provided.",
    d: "When an authenticated identity has no local match, the provider creates an account, records the link to the upstream identity, applies defaults and mapped groups, and may start a profile-completion flow. Policy can restrict it to allowed domains, require approval or place the user in a limited group. It avoids pre-loading directories and keeps removal in the upstream's hands. It is hard because creation is a trust grant: any identity the upstream authenticates becomes an account, so the upstream's own onboarding sets the bar.",
    k: ["Creating accounts on first login vs pre-provisioning: just-in-time is lightweight and needs no directory feed, but cannot deprovision when the person leaves unless a separate signal arrives.", "Default minimal access vs access from upstream groups: minimal is safer, while upstream groups save administration but import the upstream's decisions."],
    p: ["Accounts created for every authenticated upstream user, including contractors and test accounts, flood the directory with unowned identities.", "Without a removal signal, a departed user's local account and tokens persist indefinitely."],
    v: "Sign in through a test upstream as a person with no local account and confirm an account is created with the linked identity and the restricted default group, and that a disallowed domain is refused.",
    dep: ["user-store","inbound-attribute-mapping","user-lifecycle-workflows"]
  },
  "federation-trust-metadata": {
    s: "The records of each trusted partner's identifiers, endpoints and public keys, with rules for refreshing them and detecting changes.",
    d: "For each connection the provider stores the partner's issuer or entity identifier, endpoints, signing certificates and which bindings and algorithms to accept. Documents may be fetched on a schedule from the partner's address or from an aggregate of many partners. Key changes need coordination: expiring certificates cause sudden outages, and automatic updates are a trust risk. The central problem is trust bootstrap, since the first copy of a partner's keys must be authenticated out of band.",
    k: ["Automatic refresh of partner metadata vs manual approval: automatic avoids expiry outages, but lets a compromised partner endpoint replace keys unnoticed.", "Pinning specific keys vs trusting any key in the document: pinning limits what an altered document can do, while trusting is easier across rotations."],
    p: ["An expired partner certificate with no alert ends sign-in for that whole organization at midnight.", "Fetching metadata over an unauthenticated channel lets an on-path attacker substitute keys."],
    v: "List each connection's key expiry dates, confirm alerts exist thirty days before the earliest, and confirm that altering the fetched document without the expected signature leaves the stored keys unchanged.",
    dep: ["tenant-configuration","audit-event-log"]
  },
  "user-store": {
    s: "The authoritative database of accounts: stable identifiers, status, attributes, linked identities and timestamps for every user and, often, every workload.",
    d: "Each account has an immutable internal identifier, status, profile attributes, verified contacts, linked external identities and timestamps. Reads happen on every sign-in, token issuance and lookup, so indexes cover identifiers and contacts, and caches absorb repeated reads. Writes come from sign-up, profile edits, provisioning and federation. Tenancy columns separate customers. It is hard because identifier choices are permanent: an internal key unrelated to email or username allows renames, and uniqueness rules must hold under concurrent creation.",
    k: ["Immutable internal identifier vs email as key: an internal key survives renames and reassignments, while email is simpler but causes identity confusion when addresses change.", "Relational schema vs document store: relational enforces uniqueness and joins cleanly, while documents allow flexible attributes at the cost of weaker constraints."],
    p: ["Races on concurrent sign-up create two accounts for one identifier unless uniqueness is enforced by the database.", "Soft-deleted rows that still occupy identifiers block re-registration or enable resurrection of old data."],
    v: "Create the same identifier from two parallel requests and confirm exactly one account results, rename the email and confirm the internal identifier and all tokens' subjects are unchanged.",
    dep: ["identifier-normalization","directory-schema","attribute-encryption","tenant-isolation"]
  },
  "directory-schema": {
    s: "The definition of user and group attributes: their names, types, validation, who may read or write each, and which can be extended by tenants.",
    d: "A core set of attributes is fixed, and tenants add custom attributes with types and constraints. Each attribute carries rules: required, unique, user-editable, sensitive, returned in tokens or hidden. The schema drives forms, APIs, provisioning and claims. Changes must be backward compatible with stored data and with clients that read them. The tension is flexibility against safety, since each tenant-defined attribute can become a security-relevant claim in some application.",
    k: ["Fixed core with typed extensions vs fully free-form attributes: typed extensions can be validated and mapped, while free-form is flexible and hard to secure or query.", "Per-attribute access rules vs role-based access to the whole record: per-attribute rules enforce least privilege, but add configuration and evaluation cost."],
    p: ["A user-writable attribute that another system treats as authoritative lets users edit their own permissions.", "Removing or retyping an attribute breaks tokens and mappings that referenced it, usually unnoticed until sign-in fails."],
    v: "Define a custom attribute marked admin-only, attempt to write it as the user and as an administrator, and confirm only the second succeeds and the value is absent from the user's own profile view.",
    dep: ["tenant-configuration"]
  },
  "group-store": {
    s: "Stores groups, their members and nesting, and answers who belongs to what for authorization claims and administration.",
    d: "Groups are named sets of users, possibly nested, and may originate locally, from directories or from federation. The store resolves effective membership, including nested groups, quickly enough for token issuance. Membership changes emit events so applications and caches update. Large groups with hundreds of thousands of members need paging and incremental sync. The difficulty is cycles, depth and size: nested expansion can blow up, and tokens listing all groups grow too large for headers.",
    k: ["Resolving nested membership at read time vs precomputing: read time is always current, while precomputing makes token issuance fast and needs invalidation when any ancestor changes.", "Group claims in tokens vs lookup by applications: claims avoid lookups but bloat tokens and go stale, while lookups stay fresh and add calls."],
    p: ["Tokens carrying hundreds of groups exceed header limits and cause intermittent failures for the most privileged users.", "Cycles in nested groups cause unbounded loops during expansion."],
    v: "Create a three-level nest including an attempted cycle, confirm the cycle is rejected, add a user at the bottom, and confirm effective membership at the top within the expected time.",
    dep: ["user-store","directory-schema"]
  },
  "identifier-normalization": {
    s: "Canonical handling of usernames and emails so that visually or technically different spellings of one identifier resolve to the same account, and lookalikes do not.",
    d: "Identifiers are trimmed, case-folded and normalized to a defined Unicode form before storage and lookup, and uniqueness is enforced on the normalized value. Rules decide what to do with dots, plus-tags and domains, and reject mixed-script lookalikes. Internationalized names and addresses need care. It looks minor, but differences in normalization between components produce duplicate accounts and impersonation, such as a user registering a name that renders identically to an administrator's.",
    k: ["Strict normalization with rejection of confusables vs permissive acceptance: strict prevents impersonation by lookalikes, but rejects some legitimate names.", "Treating plus-tags as the same mailbox vs distinct addresses: treating as the same blocks multiple sign-ups, but incorrectly merges addresses at providers where they differ."],
    p: ["Normalizing at sign-up but comparing raw values at login makes some users unable to sign in.", "Mixed-script lookalike names let an attacker register as a visually identical administrator."],
    v: "Register a name, then try the same with different case, a combining character variant and a mixed-script lookalike, and confirm all resolve to the existing account or are rejected.",
    dep: []
  },
  "external-directory-bridge": {
    s: "A connector that verifies credentials or fetches attributes against an existing directory service, so the provider can front systems it does not own.",
    d: "For organizations with an existing directory, the provider binds to it with the user's credentials, or reads accounts and groups through a read-only service account. A bridge agent running inside the customer's network avoids opening inbound firewall paths. Mapping, paging, failover and timeouts matter: the directory's latency becomes the provider's. It is hard because it carries passwords through the provider's memory when passthrough is used, and because directories apply their own lockout rules, so a stuffing attack can lock real users there.",
    k: ["Passthrough authentication vs importing hashes: passthrough keeps the directory authoritative, but depends on its availability and passes plaintext in transit.", "An agent inside the network vs direct access: an agent avoids exposing the directory, but adds a component to operate and update."],
    p: ["Failed passthrough attempts count against the directory's lockout and let an attacker lock out staff.", "A directory outage becomes a total sign-in outage for users who exist only there."],
    v: "Sign in a test user through the bridge, confirm success and that failed attempts are rate limited before reaching the directory, then stop the directory and confirm the failure mode matches the documented policy.",
    dep: ["user-store","rate-limiting","credential-store"]
  },
  "attribute-encryption": {
    s: "Encryption of sensitive attributes and secrets before storage, with keys managed separately, so database access alone does not reveal them.",
    d: "Selected fields, such as phone numbers, seeds and government identifiers, are encrypted by the application with per-tenant data keys wrapped by a master key held in a key service. Searching needs deterministic encryption or blind indexes made with a separate key. Rotation re-wraps data keys without rewriting every row. It is hard because it conflicts with querying, indexing and sorting, and because key loss makes data permanently unreadable.",
    k: ["Application-level field encryption vs storage-level encryption: field-level protects against database access and snapshots, but complicates queries, while storage-level is transparent and does not stop a database reader.", "Blind index for lookup vs plaintext index: a blind index permits exact matching without revealing values, but allows no partial matching and needs its own key."],
    p: ["Losing or deleting a data key without backups makes the affected users' data unrecoverable.", "Using the same key for the blind index and encryption allows an attacker with one to attack the other."],
    v: "Read the raw database row for an encrypted attribute and confirm ciphertext, then rotate the master key and confirm the application still reads the value and the stored wrapped key changed.",
    dep: ["tenant-isolation"]
  },
  "stateless-service-tier": {
    s: "The horizontally scaled application servers that run the endpoints and flows, keeping no authoritative state locally so any instance can handle any request.",
    d: "Requests arrive through load balancers to interchangeable instances that read configuration, sessions and users from shared stores and caches. Deployments roll gradually, with instances draining in-flight sign-ins. Autoscaling responds to load, and password hashing and signing make requests CPU-heavy. The hard part is the dependencies: each request touches several stores and may call mail or federation services, so slow dependencies pile up connections, and a retry storm can turn a brownout into an outage.",
    k: ["Strictly stateless instances vs local caching of hot data: stateless is simple to scale and replace, while local caches cut latency and risk stale policy.", "Isolating expensive endpoints on separate pools vs shared capacity: isolation stops a flood of logins starving token requests, but wastes some capacity."],
    p: ["No timeouts on outbound calls lets one slow upstream exhaust every worker.", "Autoscaling that reacts to CPU alone responds too late to a sudden spike in logins."],
    v: "Under a load test of steady and spike traffic, confirm latency percentiles stay within budget, kill an instance mid-request and confirm clients recover by retry, and confirm a slow federated upstream does not affect other tenants.",
    dep: ["cache-layer","user-store","session-store"]
  },
  "cache-layer": {
    s: "In-memory caches and shared stores for hot reads such as configuration, client records, keys, sessions and rate counters, kept fresh enough not to violate policy.",
    d: "Caches sit in-process and in a shared tier. Entries carry versions or lifetimes, and writes publish invalidations. Rate limits and sessions use the shared store directly with atomic operations. The design question is staleness: serving an old client record or policy after a change means serving the old rule. Failure matters too, since a cold cache sends a flood to the database, and a split cache can give different answers to different nodes.",
    k: ["Short lifetimes vs explicit invalidation: short lifetimes are simple and bound staleness, while invalidation is precise and fails silently when messages are lost.", "Fail open vs fail closed when the shared store is down: open keeps users signing in but removes limits, while closed protects the system and stops sign-in."],
    p: ["A cold start after a restart sends every request to the database at once.", "Caching negative lookups for too long keeps a newly created account from signing in."],
    v: "Change a client's redirect list, measure how long until all nodes enforce it, and compare with the documented bound; flush the cache under load and confirm the database stays within capacity.",
    dep: []
  },
  "multi-region-replication": {
    s: "Copying identity data and sessions across regions so sign-in continues after a regional failure and users are served near where they are.",
    d: "Users, credentials, client records and keys replicate between regions, with sessions and counters either replicated, pinned to a home region or rebuilt on failover. Choices of leader and follower regions, conflict handling and replication lag decide what a user sees after failover: a password changed seconds before may be lost, and a revoked session may reappear. Data residency rules may restrict which data may leave a region. It is hard because identity is both read-heavy and security-critical, so stale reads matter more than elsewhere.",
    k: ["Single write region with regional readers vs multi-writer: single writer avoids conflicts and sends writes far, while multi-writer is local and needs conflict rules for credentials and revocations.", "Replicating sessions vs forcing re-login on failover: replicating hides failover from users, but spreads sensitive state and adds lag."],
    p: ["Replication lag lets a revoked token or removed factor remain valid in another region for minutes.", "Failing over without checking that keys were fully replicated makes every token from the other region unverifiable."],
    v: "Fail the primary region in a drill and measure the time to resume sign-in elsewhere, confirm a password change made just before failover survives or that its loss is bounded as documented, and confirm tokens still verify.",
    dep: ["user-store","session-store","signing-key-store","backup-and-restore"]
  },
  "tenant-isolation": {
    s: "The controls that keep one customer's data, load, configuration and keys separate from every other customer's within shared infrastructure.",
    d: "Isolation operates at several levels: tenant identifiers enforced in every query, separate encryption keys, per-tenant rate limits and quotas, separate issuers and signing keys, and optional dedicated databases or clusters for sensitive customers. Administrative access to one tenant cannot reach another. The challenge is that a single missed filter breaks the boundary: cross-tenant leaks usually come from one query written without the tenant clause, so isolation is enforced below the application where possible.",
    k: ["Shared tables with tenant keys vs database per tenant: shared tables are efficient and rely on every query being correct, while separate databases isolate strongly at higher cost and operational load.", "Per-tenant quotas vs a shared pool: quotas stop a noisy customer harming others, but need tuning and reject legitimate bursts."],
    p: ["One query without the tenant filter exposes every customer's users to any tenant's administrator.", "A large customer's import job slows sign-in for all others in a shared pool."],
    v: "As an administrator in tenant A, request users, applications and logs of tenant B by identifier through each API and confirm all return not found, and run a load test in A and confirm B's latency is unaffected.",
    dep: ["user-store"]
  },
  "message-delivery": {
    s: "Sending email and text messages for codes, links and notifications through carriers and gateways, with tracking, retry and abuse controls.",
    d: "Messages are rendered from templates and handed to email relays and messaging gateways, with sender authentication records, bounce and complaint handling and per-destination limits. Delivery is slow and unreliable: carriers delay or filter, and some regions block certain senders. Providers use multiple vendors with failover and monitor delivery rates by country. The conflict is that recovery and verification depend on these channels, which are the least reliable and most abused parts of the system.",
    k: ["Multiple delivery vendors with failover vs one: multiple vendors improve delivery and survive outages, but add integration, cost and inconsistent behavior.", "Synchronous send in the request vs queued: synchronous gives immediate failure feedback, while queued protects latency and delays the message under load."],
    p: ["Missing sender authentication records send verification mail to spam, and users blame the provider.", "Unbounded sends to arbitrary numbers can be used to cause large bills."],
    v: "Trigger a verification message to a test inbox in several regions, measure delivery time and spam placement, and confirm the sender passes authentication checks and the per-destination cap stops a burst.",
    dep: ["rate-limiting","branding-and-templates"]
  },
  "backup-and-restore": {
    s: "Regular copies of identity data and keys, and tested procedures to bring the service back after corruption, deletion or loss of a region.",
    d: "The directory, credential store, configuration and audit log are backed up with point-in-time recovery, encrypted and held separately from production. Signing keys are protected in escrow according to hardware module procedures. Restore plans list order and dependencies. The key problem is meaning: restoring an old state brings back passwords and factors that users changed or removed, and revoked sessions and credentials, so a restore needs a follow-up that re-applies revocations since the snapshot.",
    k: ["Point-in-time recovery vs periodic snapshots: point-in-time loses little and costs storage, while snapshots are simple and lose everything since the last one.", "Restoring and then force-resetting affected credentials vs restoring as is: resets are safer after a compromise, but cause large user disruption."],
    p: ["A restored snapshot silently reactivates accounts that were disabled since the backup.", "Backups never test-restored turn out to be unreadable when needed."],
    v: "Restore the latest backup into an isolated environment, run a sign-in for a known user, and confirm the recovery time and data loss meet the stated objectives, with revocations since the snapshot replayed.",
    dep: ["user-store","credential-store","audit-event-log"]
  },
  "trust-model": {
    s: "The decision about who may assert identity to whom: which issuers, applications, partners and administrators are trusted, for which attributes, and how that trust is limited and revoked.",
    d: "Every token, assertion and attribute carries an implicit claim of trust. The model states which parties can create accounts, which can set roles, which keys are accepted for which issuers, and what an application may assume from a token. It extends across federation, provisioning, support staff and the provider's own operators. It shapes audience checks, claim minimization and key scope. Weak models trust everything by default and surface only after one compromised partner can impersonate users across the whole system.",
    k: ["Explicit per-issuer and per-attribute trust vs a global allowance: explicit trust limits what a compromised partner can claim, but needs configuration and review.", "Trusting the network or the provider's operators vs verifying everything cryptographically: assumed trust is simple, while verification limits insider and lateral risk and adds cost."],
    p: ["A partner trusted for names is accidentally trusted for roles through a shared mapping.", "Trust granted for a project and never reviewed outlasts the relationship."],
    v: "Write the trust matrix for each issuer, attribute and operator, then test one violation per row, such as an upstream asserting an administrator role, and confirm each is refused.",
    dep: ["federation-trust-metadata","scopes-and-audiences","inbound-attribute-mapping"]
  },
  "fail-open-or-closed": {
    s: "The policy for what each component does when a dependency or check is unavailable: deny access for safety, or allow it to preserve continuity.",
    d: "Each dependency has a stated failure behavior: risk scoring, breach check, rate-limit store, message delivery, key service, federated upstream, directory bridge. Defaults differ by component, from sign-in that continues without a risk score to token issuance that stops without a signing key. The choice affects attackers as well as outages, since forcing a dependency to fail can disable a defense. It must be decided deliberately and tested, because under pressure operators override defaults in the unsafe direction.",
    k: ["Fail closed on authentication checks vs fail open: closed protects accounts and turns dependency outages into sign-in outages, while open keeps users working with weaker protection.", "Per-dependency behavior vs one global switch: per-dependency matches risk precisely, but is more to document and test than a single mode."],
    p: ["A rate-limit store failure that fails open removes protection exactly when an attack saturates it.", "An unreviewed emergency bypass left enabled becomes the permanent configuration."],
    v: "Take each dependency down in a test environment in turn and record the actual behavior of sign-in, token issuance and recovery, then compare with the written policy and fix any mismatch.",
    dep: ["rate-limiting","anomaly-scoring","signing-key-store","message-delivery"]
  },
  "multi-tenancy-model": {
    s: "The decision on whether customers share infrastructure, data stores, issuers and keys, or are separated, and how tenants relate to organizations and users inside them.",
    d: "Choices include a shared platform with logical separation, pooled with dedicated options, or full separate deployments. Related decisions: whether a user can belong to several tenants, whether issuers and keys are per tenant, and what a tenant administrator can do. These choices set cost, noisy-neighbor exposure, residency options and the blast radius of a defect. They are expensive to change later because tenant identifiers run through every table, token and cache key.",
    k: ["Shared infrastructure with logical isolation vs dedicated deployments: shared is efficient and fast to onboard, while dedicated limits blast radius and meets strict customers at higher cost.", "Users belonging to many tenants vs one tenant per account: many-to-many fits consultants and shared users, but complicates identity, consent and billing."],
    p: ["Tenant identifiers added late leave caches and logs keyed without them and leaking across customers.", "Per-tenant customization that grows unbounded makes every release a risk."],
    v: "Create two tenants with overlapping usernames and confirm sign-ins, tokens, keys, caches and logs stay separate, and that one tenant's configuration changes never change the other's behavior.",
    dep: ["tenant-isolation","tenant-configuration","signing-key-store"]
  },
  "data-minimization": {
    s: "The discipline of collecting, storing, logging and releasing the least personal data needed, and deleting it when the purpose ends.",
    d: "It applies to attributes stored, claims placed in tokens, data kept in logs and analytics, data shared with federation partners and the lifetime of deleted accounts. It is driven by privacy law and by risk: data not held cannot leak. Tools include per-client claims, pairwise identifiers, short log retention, pseudonymization and field encryption. It conflicts with investigations, features such as location alerts and fraud scoring, so each retention decision needs a named purpose.",
    k: ["Collecting richer data for risk scoring vs minimal data: richer data detects more fraud, but creates a larger privacy and breach liability.", "Hard deletion vs retention for audit: deletion honors users and regulation, while retention supports investigations and requires careful handling."],
    p: ["Tokens that include full profiles send personal data to every application and log that sees them.", "Deleting an account while its identifiers persist in logs and backups does not satisfy the request."],
    v: "Delete a test account and search the stores, caches, logs, analytics and a backup copy for its identifiers, and confirm each is removed, anonymized or covered by a documented retention reason.",
    dep: ["claims-mapping","log-retention-and-export","attribute-encryption"]
  },
  "cryptographic-agility": {
    s: "The ability to replace algorithms, key sizes and parameters, such as signing and hashing, across tokens, assertions, stored secrets and transport without breaking clients.",
    d: "Every use of cryptography records which algorithm and parameters it used: password hashes carry parameters, tokens name their algorithm and key identifier, metadata lists supported options. Changing means supporting old and new in parallel, migrating stored data over time and giving clients warning. Agility conflicts with security as well as helping it: accepting many algorithms invites downgrade and confusion attacks, so verifiers must use an allow-list rather than trusting what the token says.",
    k: ["Supporting several algorithms at once vs a single fixed choice: several allow migration without a flag day, but widen attack surface and test matrix.", "Verifier-chosen algorithm allow-list vs token-declared algorithm: an allow-list stops downgrade and none-algorithm attacks, but requires coordinated updates when the list changes."],
    p: ["Verifiers that trust the token's declared algorithm accept forged tokens signed with a weaker or no algorithm.", "A migration path never exercised is missing when a weakness is announced and a rapid change is needed."],
    v: "Switch a test tenant's signing algorithm, confirm old tokens verify during the overlap and new ones use the new algorithm, and present a token with a swapped or none algorithm and confirm it is rejected.",
    dep: ["key-rotation","password-hashing","discovery-metadata"]
  },
  "availability-budget": {
    s: "The target for how available the provider must be and how its failure affects everything that depends on it, which sets redundancy, caching and fallback design.",
    d: "Sign-in is on the critical path of every application, so the provider's availability caps theirs. The budget names targets for authentication, token issuance, refresh and key publishing separately, because applications with valid tokens and cached keys keep working while new sign-ins fail. It drives choices such as token lifetimes, regional failover, static fallback of key sets and degradation of optional checks. It is hard because the dependencies are many and a third-party failure, such as message delivery, can still block recovery.",
    k: ["Longer token lifetimes for resilience vs shorter for security: longer tokens survive provider outages, but delay revocation and lengthen exposure.", "Static fallback for key publishing vs dynamic only: static fallback keeps verification running during outages, but must be updated with every rotation."],
    p: ["Applications that call the provider on every request turn its short outage into theirs.", "Measuring availability by the health endpoint rather than by successful sign-ins hides outages users actually see."],
    v: "Run a synthetic sign-in and token refresh from outside every minute, measure success per capability, and compare the monthly numbers with each target, including a drill that blocks the primary dependency.",
    dep: ["multi-region-replication","token-lifetimes","jwks-publishing","stateless-service-tier"]
  }
});
