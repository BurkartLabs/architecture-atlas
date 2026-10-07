// Details for the API gateway plate, part 1: developer onboarding, analytics, authentication, authorization.
ATLAS.details("api-gateway", {
  "developer-portal": {
    s: "The web front end where outside developers sign up, browse APIs, read documentation, get credentials and see their own usage, without involving an operator.",
    d: "The portal is a separate application that talks to the gateway's admin API and the identity system. It handles sign-up, email verification, team membership and approval workflows, and shows each developer their apps, keys, plans and usage. It is hard because it holds the only human-facing path to credentials, so it inherits all the account-takeover, abuse and support problems of any consumer website while also needing to stay consistent with what the gateway actually enforces.",
    k: ["Self-service approval versus manual approval: instant keys maximize adoption but invite abuse, while manual review protects quotas and slows every legitimate developer.", "Portal as part of the gateway versus a separate product: a built-in portal stays consistent with enforcement, a separate one can be themed and run by a different team but must sync state."],
    p: ["Portal shows an API as available after the route was removed, because the catalog and the gateway configuration drift apart.", "Open sign-up with automatic keys lets scripted accounts farm free-tier quota."],
    v: "Sign up as a new developer, register an app, subscribe to a plan and call a documented endpoint with the issued key. The call succeeds, and the same request appears in that developer's usage page.",
    dep: ["api-catalog", "app-registration", "key-issuance", "admin-api"]
  },
  "api-catalog": {
    s: "The browsable list of published APIs with their descriptions, specifications, versions and terms, generated from the same definitions the gateway routes on.",
    d: "Each API is described by a machine-readable specification plus human documentation, owner, lifecycle state and access policy. The catalog renders reference pages, try-it consoles and changelogs, and filters by what a given developer is allowed to see. It is hard because documentation and behavior drift: a specification written once and never checked against live traffic quietly becomes wrong, and private APIs must not leak through search or listings.",
    k: ["Specification as source of truth versus gateway configuration as source of truth: one generates the other, avoiding drift, but the generator limits what can be expressed.", "Public catalog versus per-developer visibility: open listings help discovery, filtered ones prevent leaking internal or partner-only endpoints at the cost of more access logic."],
    p: ["Deprecated versions remain listed with no warning, so new integrations are built on endpoints scheduled for removal.", "Try-it consoles send real requests with real keys to production backends."],
    v: "Publish a new API version, then confirm the catalog lists it with the right access rules. Request a listing as a developer without access and confirm the private API is absent.",
    dep: ["declarative-config", "version-routing", "schema-validation"]
  },
  "app-registration": {
    s: "The record that represents a consuming application: an owner, callback addresses, subscribed APIs and the credentials attached to it.",
    d: "An app is the unit to which credentials, plans and quotas attach, and it is distinct from the human developer and from the consumer identity the gateway sees at runtime. Registration captures redirect addresses for token flows, contact details and the APIs requested. The gateway needs a fast lookup from credential to app, so the registry is replicated to nodes. The difficulty is lifecycle: apps are abandoned, transferred between teams and compromised, and each case needs revocation that takes effect everywhere quickly.",
    k: ["One credential per app versus many: a single credential is simple to track, while several let one be rotated or revoked without breaking the whole integration.", "Strict redirect address validation versus patterns: exact matches block open-redirect abuse but frustrate teams with many environments."],
    p: ["An app owned by a departed employee keeps working forever because nobody is responsible for it.", "Redirect addresses are validated loosely and let an attacker capture authorization codes."],
    v: "Register an app, disable it from the portal and confirm the next request with its credential is rejected within the documented propagation time on every node.",
    dep: ["consumer-identity", "state-store", "config-distribution"]
  },
  "key-issuance": {
    s: "Creating, delivering, rotating and revoking the secrets or certificates that apps use to call the gateway, with an audit record of each change.",
    d: "Keys are generated with enough entropy, shown once, and stored only as a salted hash or digest so a database leak does not expose them. Rotation allows two valid credentials during an overlap window. Revocation must reach every node, not just the store. Key formats often embed a prefix identifying the type and owner so leaked keys can be found by scanners. It is hard because secrets leak into repositories and logs, and because rotation breaks callers who never planned for it.",
    k: ["Hashed keys versus encrypted keys: hashing means a breach reveals nothing but support cannot show a key again; encryption allows display but concentrates risk.", "Long-lived keys versus short-lived tokens: keys are easy for clients but dangerous when leaked, tokens limit exposure but require a refresh flow."],
    p: ["Keys are accepted in query strings and end up in proxy logs and browser history.", "Revocation updates the store but nodes keep a cached positive result for minutes."],
    v: "Issue a key, call successfully, rotate with an overlap window, confirm both keys work then only the new one, and confirm a revoked key is refused on all nodes within the stated delay.",
    dep: ["app-registration", "api-key-auth", "secrets-store", "audit-trail"]
  },
  "subscription-plans": {
    s: "Named bundles of limits, features and price that bind an app to what it may call and how much, with rules for upgrades, overages and expiry.",
    d: "A plan lists permitted APIs, rate limits, quotas, support tier and cost. Subscribing attaches the plan to an app and the gateway reads it at request time to choose limits. Plans may need approval, trials or time windows. The hard parts are mid-cycle changes, which must prorate billing and limits consistently, and keeping the commercial definition, the enforced limits and the invoice in agreement, because three systems each hold part of it.",
    k: ["Plan limits enforced in the gateway versus in billing only: enforcing blocks overuse immediately, while billing-only allows overage charges but exposes backends to abuse.", "Plans per API versus plans across the whole catalog: per-API is flexible and complex, catalog-wide is simple but bundles unrelated products."],
    p: ["Downgrading a plan leaves old, higher limits cached on nodes until the next full config push.", "Trial plans without an expiry job become permanent free tiers."],
    v: "Subscribe an app to a low plan, exceed its limit and confirm the documented rejection. Upgrade the plan and confirm the higher limit applies on the next request and the invoice reflects the change.",
    dep: ["app-registration", "quota-enforcement", "billing-export"]
  },
  "sandbox-environments": {
    s: "A separate, safe copy of an API with fake data and relaxed limits where developers can test integrations before using production credentials.",
    d: "The sandbox is either the same gateway with a separate route set and credentials, or a distinct deployment pointing at stub backends. It returns realistic but synthetic data, resets state, and supports forced error scenarios for testing. It is hard because it must match production behavior closely enough to be trusted while sharing no data, and because stubs tend to rot as the real API changes.",
    k: ["Mock backends versus a full staging stack: mocks are cheap and stable but diverge from real behavior, staging is faithful but costly and shared.", "Shared gateway with separate routes versus separate gateway: sharing reduces cost but a sandbox misconfiguration can touch production policy."],
    p: ["Sandbox keys work against production because routing is decided only by path.", "The sandbox accepts requests production would reject, so integrations pass tests and fail on launch."],
    v: "Call the sandbox with a sandbox key and get synthetic data, then use the same key on the production endpoint and confirm it is rejected as unknown.",
    dep: ["route-matching", "key-issuance", "fault-injection"]
  },
  "usage-metering": {
    s: "Counting billable and limit-relevant events per consumer, API and time window, accurately enough to invoice and to enforce quotas.",
    d: "The gateway emits a record per request with consumer, route, status, bytes and cost units. Records are batched and sent to an aggregator, with local buffering for outages. Metering differs from logging because it must not lose or double count: it needs idempotent event identifiers and a defined rule for failed, retried and cached requests. It is hard because exactly-once counting across many nodes and restarts is not free, so systems choose between slight undercounts and slight overcounts.",
    k: ["Count at the gateway versus at the backend: the gateway sees every call uniformly, the backend knows the true cost of the work performed.", "At-least-once with deduplication versus best-effort: deduplication keeps invoices correct and needs durable identifiers, best-effort is simpler and drifts."],
    p: ["Requests rejected by rate limits are billed as usage because counting happens before policy.", "A node crash loses its in-memory batch and silently undercounts."],
    v: "Send a known number of requests across several nodes, kill one mid-run, and compare the aggregated count with the client's own count. The difference stays within the documented tolerance.",
    dep: ["filter-chain", "analytics-pipeline", "consumer-identity"]
  },
  "analytics-pipeline": {
    s: "The path that moves request events from nodes to storage and rollups, so dashboards and reports can query traffic by consumer, route and time.",
    d: "Nodes push events to a collector through a queue, which writes to a store optimized for time-series aggregation and keeps raw events for a short retention. Rollups by minute, hour and day serve dashboards cheaply. The pipeline must be isolated from the request path so that analytics outages never slow traffic. It is hard because cardinality grows with consumers and routes, and because late or duplicated events change numbers already reported.",
    k: ["Push from each node versus a log shipper: pushing is direct but couples nodes to the collector, shipping decouples at the cost of delay.", "Pre-aggregated rollups versus raw event queries: rollups are fast and cheap but cannot answer questions nobody planned, raw events can but cost more to store."],
    p: ["Collector slowness backs up into the node and adds request latency because emission is synchronous.", "Unbounded label values such as full paths explode storage."],
    v: "Stop the collector, send traffic and confirm latency and error rates are unchanged. Restart it and confirm buffered events arrive and the dashboard totals catch up.",
    dep: ["usage-metering", "state-store", "access-logs"]
  },
  "billing-export": {
    s: "Turning aggregated usage and plan terms into invoice lines or a feed for an external billing system, on a defined cycle.",
    d: "At the end of each cycle the system sums usage per app and plan, applies tiers, free allowances and overage rates, and emits line items. Exports are versioned and reproducible so disputes can be replayed. It is hard because the numbers must agree with what customers saw in quota reports, late-arriving events must either be included or deliberately cut off, and corrections need credit notes instead of silent edits.",
    k: ["Closed cycle cutoff versus rolling corrections: a hard cutoff gives stable invoices and may miss late events, rolling corrections are accurate and confusing.", "Billing from raw events versus from rollups: raw events allow audit and replay, rollups are cheaper and harder to explain."],
    p: ["Time zones differ between metering and billing, so usage near midnight lands in the wrong month.", "Test or sandbox traffic is exported to the invoice."],
    v: "Replay one closed cycle from stored events and compare totals per customer with the exported invoice lines. They must match exactly, and a deliberately injected duplicate must not change them.",
    dep: ["usage-metering", "subscription-plans", "analytics-pipeline"]
  },
  "quota-reporting": {
    s: "Showing consumers and operators how much of each limit has been used, how much remains and when it resets.",
    d: "Reports read from the counter store or rollups and are exposed in the portal and often as response headers giving limit, remaining and reset time. Operators see top consumers and those nearing limits. The difficulty is that the numbers shown are read from a distributed, approximate counter, so they can disagree with enforcement by small amounts, and users treat any disagreement as a bug.",
    k: ["Headers on every response versus portal only: headers let clients self-throttle and add a read of the counter on each call, portal-only is cheaper and less useful.", "Exact figures versus approximate: exact numbers require consistency across nodes, approximate ones are fast and occasionally off."],
    p: ["Reset time is reported in server local time and clients wait the wrong amount.", "Reports show account-wide usage but limits are per key, confusing the owner."],
    v: "Make a known number of calls, then compare the remaining count in the response headers, the portal and an independent client tally. All three agree to within the documented margin.",
    dep: ["counter-store", "rate-limiter", "analytics-pipeline"]
  },
  "anomaly-alerts": {
    s: "Automatic notices when a consumer or route departs from its normal traffic, error or cost pattern, such as sudden spikes or credential abuse.",
    d: "Detectors compare current rates to baselines by consumer, route and time of day, and raise alerts on spikes, drops, new geographies and rising error ratios. Alerts route to operators or to the consumer. It is hard because normal traffic is seasonal and bursty, so fixed thresholds either page constantly or miss attacks, and because the alert must carry enough context, such as which key and which route, to act on.",
    k: ["Static thresholds versus learned baselines: thresholds are predictable and noisy, baselines adapt and can be trained by slow-growing abuse.", "Alert the consumer versus only the operator: consumer alerts speed up fixes for leaked keys and expose internal signals."],
    p: ["A launch day or marketing event triggers alerts that train operators to ignore them.", "Alerts fire on aggregate traffic and hide one abusive key inside a large healthy consumer."],
    v: "Replay a recorded abuse pattern, such as a tenfold request spike from one key, and confirm an alert naming that key arrives within the target time while normal peaks raise none.",
    dep: ["analytics-pipeline", "consumer-identity", "gateway-metrics"]
  },
  "error-analytics": {
    s: "Aggregated views of error rates, latency distributions and failing routes, split by consumer and by whether the gateway or the backend caused the failure.",
    d: "Each event records the status, upstream status, gateway-added latency and upstream latency. Dashboards show percentiles, not averages, and attribute errors to rejection by policy, upstream failure or timeout. Separating gateway time from backend time is the main value, because teams otherwise blame the gateway for slow services. It is hard because clients disconnecting, retries and cached responses blur what counts as an error.",
    k: ["Percentile histograms versus averages: histograms expose the slow tail that users feel and cost more to store and merge.", "Classifying by status code versus by cause: codes are simple, causes such as policy rejection versus upstream timeout are what operators need and require richer events."],
    p: ["Gateway-generated 5xx and backend 5xx are counted together, so a backend outage looks like a gateway fault.", "Percentiles are averaged across nodes, which is mathematically meaningless."],
    v: "Make one backend return errors and confirm the dashboard attributes them to that upstream, with the gateway's own latency shown separately and unchanged.",
    dep: ["analytics-pipeline", "gateway-metrics", "access-logs"]
  },
  "api-key-auth": {
    s: "Looks up a presented key and maps it to a consumer, rejecting unknown, expired or revoked keys before any other work is done.",
    d: "The key arrives in a header, preferably, and is hashed and looked up in a local cache backed by the state store. A hit returns the consumer, plan and status, and the identity is attached to the request for later policies. It is cheap and universal, but a key is a bearer secret with no built-in expiry or scope. The hard parts are cache freshness for revocation, constant-time comparison, and not revealing through error messages whether a key exists.",
    k: ["Keys versus tokens: keys are simple and long-lived, so leaks last, while tokens expire by design but need an issuer and a refresh flow.", "Cache positive lookups versus always check the store: caching is fast and delays revocation, checking is exact and makes the store a hard dependency."],
    p: ["Keys in URLs appear in access logs and referrer headers.", "Different error text for unknown versus revoked keys lets attackers enumerate valid keys."],
    v: "Send requests with a valid, unknown, expired and revoked key and confirm 200, then identical rejection for the other three, with the revoked key refused within the documented delay.",
    dep: ["consumer-identity", "state-store", "key-issuance"]
  },
  "token-validation": {
    s: "Verifies a signed bearer token locally: signature, issuer, audience, expiry and not-before, then turns its claims into the request identity.",
    d: "The gateway parses the token, checks the algorithm against an allowlist, verifies the signature with a cached public key, and validates standard claims with a small clock skew allowance. Because no network call is needed, it scales with the proxy. It is hard because tokens cannot be revoked before expiry without extra machinery, and because misconfigured validation, such as accepting any algorithm or skipping audience checks, is a classic way to bypass authentication entirely.",
    k: ["Local signature verification versus introspection: local checks add microseconds and cannot see revocation, introspection is current and adds a network round trip.", "Short token lifetimes versus long: short limits the damage of theft and increases refresh traffic on the identity provider."],
    p: ["The gateway honors the algorithm named inside the token, including none or a symmetric one using the public key.", "Audience is not checked, so a token minted for another service is accepted."],
    v: "Present tokens with a tampered signature, wrong audience, expired time and a swapped algorithm. Each must be rejected with an authentication error, and a correct token must pass.",
    dep: ["jwks-cache", "consumer-identity", "listeners-and-tls"]
  },
  "jwks-cache": {
    s: "Holds the identity provider's current public signing keys so tokens can be verified without a network call, refreshing when keys rotate.",
    d: "Keys are fetched from a well-known endpoint, selected by key identifier, and cached with a lifetime. When a token names an unknown key identifier, the gateway refreshes once, with rate limiting, to cover rotation. If the endpoint is down, it continues with stale keys for a bounded time. The hard part is balancing: refreshing too often creates load and an attack path, refreshing too rarely makes rotation cause outages.",
    k: ["Refresh on unknown key identifier versus on a timer only: on-demand handles rotation instantly and can be abused with random identifiers, timers are safe and lag.", "Serve stale keys when the provider is down versus fail: stale keys keep traffic flowing and delay noticing a compromised key."],
    p: ["Attackers send tokens with random key identifiers, driving a fetch per request against the provider.", "A rotation removes the old key before cached tokens expire and valid users are rejected."],
    v: "Rotate the provider's signing key and confirm tokens signed by the new key pass within the refresh interval, with no more than one fetch per interval even when invalid key identifiers are flooded.",
    dep: ["listeners-and-tls", "connection-pools"]
  },
  "token-introspection": {
    s: "Asks the identity provider whether an opaque token is still active and what it grants, caching the answer for a short time.",
    d: "Opaque tokens carry no data, so the gateway calls an introspection endpoint with its own credentials and receives the active flag, scopes, subject and expiry. Results are cached keyed by token, with a lifetime shorter than the token's remaining life. It gives immediate revocation but makes the identity provider part of every request path. It is hard because latency and availability of that endpoint become the gateway's, and a cache hides revocations for its lifetime.",
    k: ["Opaque tokens with introspection versus signed self-contained tokens: opaque ones are revocable and hide claims, signed ones are faster and exposed to theft until expiry.", "Cache duration: longer caches protect the provider and delay revocation, none gives exactness and multiplies load."],
    p: ["The provider slows down and every API slows with it because introspection calls are synchronous.", "A cached active result outlives a revoked token for its full cache lifetime."],
    v: "Revoke a token at the provider and measure how long the gateway keeps accepting it. The time is no longer than the configured cache lifetime, and provider downtime follows the documented policy.",
    dep: ["connection-pools", "consumer-identity", "retries-and-timeouts"]
  },
  "mutual-tls": {
    s: "Authenticates the client by its certificate during the TLS handshake, binding identity to a private key that is never sent on the wire.",
    d: "The listener requests a client certificate, validates the chain against configured trust anchors, checks validity dates and revocation status, and maps the subject or a subject alternative name to a consumer. It is common for machine-to-machine and regulated APIs. It is hard operationally: certificate issuance, expiry and revocation checking are a lifecycle, and when a load balancer in front terminates TLS the identity must be forwarded in a header the gateway can trust.",
    k: ["Verify at the edge versus pass through: edge verification centralizes policy, passthrough preserves end-to-end identity and is harder to configure.", "Revocation lists versus short-lived certificates: lists reflect compromise quickly and must be distributed, short lifetimes make revocation almost unnecessary and require automation."],
    p: ["A front balancer terminates TLS and the gateway trusts a client-certificate header that outside callers can also send.", "Certificates expire on a weekend because nobody owned renewal."],
    v: "Connect with a valid certificate, an expired one, one from another authority and none. Only the first succeeds, and the consumer shown in the access log matches the certificate subject.",
    dep: ["listeners-and-tls", "secrets-store", "consumer-identity"]
  },
  "request-signing": {
    s: "Verifies that a request was signed with a shared secret or private key over its method, path, selected headers, body hash and time.",
    d: "The caller signs a canonical form of the request and sends the signature and a timestamp. The gateway rebuilds the canonical form, verifies the signature, and rejects stale timestamps and repeated nonces to stop replay. Signing protects against tampering and works across proxies where bearer tokens would be exposed. It is hard because both sides must canonicalize identically, proxies that reorder or rewrite headers break signatures, and body hashing needs the full body buffered.",
    k: ["Sign the body versus only headers: signing the body detects tampering and forces buffering, header-only signing streams but leaves content unprotected.", "Nonce store versus timestamp window only: nonces prevent replay inside the window and need shared state, windows are stateless and allow short replays."],
    p: ["A proxy normalizes header case or whitespace and every request fails verification.", "Clock drift on a client larger than the window makes valid traffic look like replay."],
    v: "Send a correctly signed request, then alter one byte of the body, replay it, and shift its timestamp past the window. The first passes and the other three are rejected.",
    dep: ["buffer-management", "consumer-identity", "secrets-store"]
  },
  "credential-exchange": {
    s: "Converts one kind of credential into another at the edge, such as an external token into a short-lived internal token, so backends see one identity format.",
    d: "After validating the outside credential, the gateway mints or requests an internal token that carries only the claims backends need, with a short lifetime and a different audience. It hides outside identity systems from services and lets internal trust rules differ from public ones. It is hard because the exchange point becomes a high-value signing authority, internal tokens can outlive the user's session, and claim mapping errors become privilege escalation.",
    k: ["Mint internal tokens at the gateway versus forward the original: minting limits exposure and adds a signing key to protect, forwarding is simple and spreads outside tokens inside.", "Per-request tokens versus cached tokens: per-request is precise and costs signing time, cached saves work and extends the lifetime of stale claims."],
    p: ["Internal tokens carry the full set of external claims, exposing data backends should never see.", "The internal signing key is stored on every node with no rotation plan."],
    v: "Call with an external token and inspect what the backend receives: a signed internal token with only the mapped claims, the correct audience and a short expiry, and none of the original credential.",
    dep: ["token-validation", "secrets-store", "header-manipulation"]
  },
  "consumer-identity": {
    s: "The gateway's internal record of who is calling: a consumer with groups, plan and metadata that every credential type resolves to.",
    d: "Whatever the credential, key, token or certificate, authentication ends by attaching a consumer to the request. Policies, limits, analytics and logs all refer to that consumer rather than the raw credential. This indirection allows several credentials per consumer, anonymous consumers for public routes, and consistent reporting. It is hard because mapping external subjects to consumers is often manual, and because mismatched identities across layers cause limits to apply to the wrong party.",
    k: ["Consumer per app versus per user: per app is simple and coarse, per user gives precise limits and floods the registry and counters.", "Create consumers on demand from tokens versus pre-register: on demand scales to many users and gives no control over who exists."],
    p: ["Anonymous traffic shares one consumer and one rate limit, so a single abuser blocks everyone unauthenticated.", "Two credentials for one person map to two consumers and double their quota."],
    v: "Call with each credential type for the same party and confirm the access log, limit counters and analytics all show one consumer identifier.",
    dep: ["state-store", "config-distribution"]
  },
  "route-level-acl": {
    s: "Static allow and deny lists that say which consumers or groups may call which routes and methods.",
    d: "Each route lists permitted consumers or groups, evaluated after authentication from data already in memory. It handles the common cases, internal-only, partner-only and admin-only, without calling out to a policy service, and its decisions are easy to audit. It is hard at scale: lists grow stale, group membership changes must propagate, and deny rules interacting with allow rules produce surprising results unless the order is defined and tested.",
    k: ["Allow-list default versus deny-list default: allow-lists fail safe and need every grant spelled out, deny-lists are easy to start with and leak new routes.", "Per-route lists versus group-based roles: groups reduce maintenance and hide which route is reachable by whom."],
    p: ["A new route is added without an ACL and inherits a default that allows everyone.", "Group changes take effect only on the next config push, leaving removed users with access."],
    v: "For each route, call as a permitted consumer, a forbidden consumer and an anonymous caller, and confirm 200, 403 and 401 respectively, then remove a consumer from a group and confirm it loses access.",
    dep: ["consumer-identity", "route-matching", "config-distribution"]
  },
  "scope-and-claim-checks": {
    s: "Requires that the caller's token carry particular scopes, roles or claim values before a route is allowed.",
    d: "Each route or operation declares required scopes or claim conditions, and the gateway compares them with the validated token. It enforces coarse capability, for example read versus write, close to the edge and cheaply. It is hard because scopes tend to be defined by the identity team and consumed by the API team, drift apart in naming, and cannot express per-object permissions. Missing checks on one route are invisible until abused.",
    k: ["Gateway checks scopes versus backend checks everything: the gateway rejects early and consistently, the backend knows the object and sees decisions the gateway cannot make.", "Fine scopes per operation versus a few broad ones: fine scopes limit damage and multiply consent prompts and configuration."],
    p: ["A scope is checked on the read route but not the write route of the same resource.", "Scope strings compared with prefix matching grant admin where only admin-read was intended."],
    v: "Call each operation with a token lacking the required scope and confirm 403 with the missing scope named in the error, then with the scope present and confirm success.",
    dep: ["token-validation", "route-matching", "consumer-identity"]
  },
  "policy-engine": {
    s: "Hands a decision to a dedicated policy service or library that evaluates rules over the request, identity and context, and returns allow or deny.",
    d: "The gateway builds an input document with method, path, headers, identity claims and sometimes attributes, sends it to a local or remote policy evaluator, and enforces the result. Rules are written in a policy language, versioned and tested separately from the gateway. It centralizes logic shared with other systems. It is hard because every decision adds latency and a dependency, and policies are code that can fail open by accident.",
    k: ["In-process library versus a sidecar or remote service: in-process is fast and couples versions, remote shares one policy across systems and adds a network hop.", "Fail closed versus fail open on engine errors: closed protects data and turns a policy outage into an API outage, open keeps traffic and risks exposure."],
    p: ["A syntax or data error in a policy update silently evaluates to a default allow.", "Decisions are cached by path only and reused across users."],
    v: "Run the policy test suite against recorded requests, then stop the engine in staging and confirm the gateway follows the configured fail mode and logs the cause, not an empty denial.",
    dep: ["consumer-identity", "retries-and-timeouts", "declarative-policies"]
  },
  "ip-and-geo-filtering": {
    s: "Allows or blocks requests by source address, network range or country, as a coarse first filter.",
    d: "Lists of ranges are compiled into a prefix lookup structure and matched against the client address, after working out which address is real when proxies sit in front. Geographic rules use a location database that needs regular updates. It is useful for partner allow-lists and sanctions, and cheap to evaluate early. It is hard because the client address depends on trusted forwarding headers, mobile and shared addresses blur identity, and location data is approximate.",
    k: ["Block early at the listener versus after authentication: early rejection saves work and gives attackers no information, later checks can be per consumer.", "Trust forwarded headers versus the socket address: headers are needed behind a balancer and are forgeable unless the hop count is fixed."],
    p: ["The gateway trusts any X-Forwarded-For value and attackers write an allowed address into it.", "A stale location database blocks a country's new address ranges for months."],
    v: "Send requests from an allowed range, a blocked range and with a forged forwarding header from outside the trusted proxies. Only the first passes, and the log shows the real source address.",
    dep: ["listeners-and-tls", "http-parser", "config-distribution"]
  },
});
