// Details for the identity provider plate, part 1: administration, provisioning, audit, sign-in experience.
ATLAS.details("identity-provider", {
  "admin-console": {
    s: "The web interface and matching programmatic API that operators use to configure tenants, applications, policies and users, with every action checked against the operator's role.",
    d: "The console is a client of the same management API that automation uses, so each screen has a scripted equivalent. Every call is authenticated as an administrator, authorized against delegated roles, validated against a schema and written to the audit log. Bulk operations such as imports run as background jobs with progress and rollback information. It is hard because it is the most powerful surface in the system: a stolen administrator session can mint tokens for anyone, so it needs the strongest authentication and the narrowest network exposure.",
    k: ["Console built on the public management API vs a private back door: one authorization path and one audit trail, but the API must expose everything the console can do.", "Immediate application of changes vs staged review and apply: immediate is fast to fix mistakes, while staging prevents a single typo from locking out every user."],
    p: ["Administrator accounts that skip the multi-factor rules applied to ordinary users become the preferred target.", "Bulk actions without a preview or undo let one wrong filter disable thousands of accounts."],
    v: "Perform a configuration change through the console, then repeat it through the API with a narrower role and confirm the second is refused, and both attempts appear in the audit log with actor and before and after values.",
    dep: ["administrator-roles","audit-event-log","tenant-configuration"]
  },
  "client-registry": {
    s: "The store of registered applications: their identifiers, secrets or public keys, allowed redirect addresses, permitted grant types and the scopes each may request.",
    d: "Each entry describes one relying application: whether it is confidential or public, how it authenticates to the token endpoint, which redirect addresses it owns, which grants it may use and what token lifetimes apply. Registration can be manual, through templates, or dynamic through a registration protocol. The authorization and token endpoints load an entry on every request, so it is cached and invalidated on change. The risk is drift: stale entries with broad scopes and forgotten secrets outlive the projects that created them.",
    k: ["Dynamic client registration vs administrator-only registration: dynamic scales to many integrators, but anyone can create entries, so it needs software statements, quotas and review.", "Per-client settings overriding tenant defaults vs one policy for all: overrides fit odd applications but make behavior hard to predict and audit."],
    p: ["Wildcard redirect addresses in an entry turn the provider into an open redirector that leaks authorization codes.", "Client secrets with no expiry or owner remain valid long after the application is retired."],
    v: "Register a public client with one redirect address, request authorization with a different address, and confirm the request is refused before any login page appears.",
    dep: ["tenant-configuration","user-store"]
  },
  "tenant-configuration": {
    s: "The per-tenant settings that decide which sign-in methods, policies, domains, token rules and branding apply to a set of users and applications.",
    d: "A tenant, realm or organization is the unit of configuration. Its record holds password policy, allowed factors, session lengths, enabled federation connections, verified email domains and defaults inherited by clients. Reads happen on every request and must be cheap, so configuration is cached with version stamps. Writes need validation of combinations, since individually valid settings can lock everyone out when combined, such as requiring a factor no user has enrolled. Export and import let teams promote configuration between environments.",
    k: ["Configuration as versioned data with promotion between environments vs click-through editing: versioning gives review and rollback, at the cost of tooling and slower emergency changes.", "Inheritance from a global default vs full copies per tenant: inheritance lets fixes roll out everywhere, but a global change can break tenants that relied on the old default."],
    p: ["Requiring a factor before any user can enroll it locks out every account including the administrators.", "Cached configuration that lags behind a policy change leaves the old, weaker rule in force on some nodes."],
    v: "Change a session lifetime for one tenant and confirm that new sessions in that tenant use it within the documented propagation time, while another tenant's sessions are unchanged.",
    dep: ["user-store","audit-event-log"]
  },
  "administrator-roles": {
    s: "Delegated permissions that let different operators manage users, applications or policy within defined scopes without all holding full control of the provider.",
    d: "Roles bundle management permissions such as reading users, resetting factors or editing applications, and are granted for a scope: the whole system, one tenant or one group. Each management call checks the caller's role against the resource. Support staff typically need to reset factors without reading attributes, and application owners need to edit only their own clients. The difficulty is preventing escalation: anyone who can assign roles, edit a policy or register a client with powerful scopes can often grant themselves more than the role was meant to allow.",
    k: ["Fine-grained permissions vs a few coarse roles: fine-grained fits least privilege, but nobody can reason about hundreds of combinations and reviews degrade.", "Standing roles vs time-boxed elevation: elevation limits exposure and leaves a reason on record, but adds a step during incidents when speed matters."],
    p: ["A role allowed to edit applications can register a client with administrative scopes and use it to become a full administrator.", "Roles granted once and never reviewed accumulate on staff who changed jobs."],
    v: "Sign in as a support-scoped operator, attempt to read a user's profile attributes and to reset their factor, and confirm the reset succeeds while the read is denied, with both recorded.",
    dep: ["user-store","group-store"]
  },
  "user-lifecycle-workflows": {
    s: "Rules and automated steps that move an account through its states: invited, active, suspended, deactivated and deleted, including who or what triggers each transition.",
    d: "An account carries a state, and transitions run workflows: send an invitation, require first-login enrollment, suspend after inactivity, deactivate when an upstream record ends, delete after a retention period. Triggers include administrators, provisioning events, schedules and risk signals. Each transition updates sessions and tokens, notifies downstream applications and writes audit events. The difficulty is that states interact with everything else: a suspended user must lose refresh tokens and sessions immediately, and a deleted user's identifier must not be reissued to a different person.",
    k: ["Soft deactivation with later deletion vs immediate deletion: soft states allow reversal and legal holds, but retain personal data longer than some regulations allow.", "Event-driven transitions vs scheduled sweeps: events react at once, but a missed event leaves an account in the wrong state, which sweeps eventually correct."],
    p: ["Deactivation that blocks new sign-in but leaves existing refresh tokens valid keeps a departed employee's access alive for weeks.", "Reusing a deleted identifier lets a new person inherit the old person's permissions in downstream systems."],
    v: "Deactivate a user holding an active session and a refresh token, and confirm the next token refresh and the next protected request both fail within the documented revocation time.",
    dep: ["user-store","session-store","token-revocation","deprovisioning-propagation"]
  },
  "branding-and-templates": {
    s: "Customizable logos, colors, text, message templates and custom domains that let each tenant present the sign-in experience as its own.",
    d: "Hosted pages and outgoing messages are rendered from templates with variables for tenant name, language, links and codes. Tenants can set colors and logos, supply custom page templates, and serve the provider from their own domain with its own certificate. Templates are sandboxed so tenant-provided markup cannot run scripts or read credentials, and messages are checked so a link always points to a trusted address. The challenge is that customization is an attack surface: a page that looks identical to the real one is also what a phishing page looks like.",
    k: ["Full template control vs a fixed layout with limited theme settings: full control satisfies enterprise designers, while a fixed layout is far easier to secure and keep accessible.", "Custom domain vs shared provider domain: a custom domain builds trust and makes cookies first-party, but adds certificate management and takeover risk when records are left dangling."],
    p: ["Tenant-supplied scripts on the login page can capture passwords, so templates must not allow active content.", "A custom domain whose DNS record is abandoned can be claimed by an attacker who then serves the login page."],
    v: "Upload a template containing a script tag and confirm the rendered page strips or blocks it, then confirm the password-reset message shows the tenant's name and a link on the tenant's domain.",
    dep: ["tenant-configuration","hosted-login-pages"]
  },
  "scim-service": {
    s: "A standard HTTP interface that lets an external system create, update, query and remove users and groups in the provider, authenticated as a trusted provisioner.",
    d: "The service exposes resource endpoints for users and groups with a defined schema, filtering, patch operations and bulk requests. Callers authenticate with a long-lived token or client credentials and are scoped to a tenant. Each operation maps onto the user store and triggers lifecycle workflows. The difficulty is semantic mismatch: different callers send partial updates, omit fields, send groups and members in different orders, and assume different behavior on conflicts, so the endpoint must be strict about validation yet forgiving about ordering.",
    k: ["Accepting the standard schema with extensions vs a custom schema: the standard works with many callers, but extensions drift and each caller interprets optional fields differently.", "Synchronous apply vs queued apply with status: synchronous gives clear errors, while queued absorbs bulk load but returns success before the change is visible."],
    p: ["A provisioning token with tenant-wide write access, left in a third-party configuration, lets anyone create administrator accounts.", "Treating a patch that removes a member as a replacement drops every other member of the group."],
    v: "Send a create, a partial update and a delete for one user through the endpoint and confirm the user store, group membership and audit log reflect each, and that a repeat of the create is rejected as a conflict.",
    dep: ["user-store","group-store","user-lifecycle-workflows","audit-event-log"]
  },
  "outbound-connectors": {
    s: "Components that push account changes from the provider to downstream applications through their own APIs, tracking what each one has been told.",
    d: "For applications that do not pull from the provider, a connector maps provider attributes to the application's schema, calls its API on create, update and disable events, and keeps a record of the remote identifier. Work runs from a queue with retries, backoff and per-target rate limits, and a periodic reconciliation compares both sides to repair drift. It is hard because remote systems are unreliable and inconsistent: calls partially succeed, rate limits vary, and the remote account may have been changed by hand.",
    k: ["Event-driven push with periodic reconciliation vs reconciliation only: push is timely, while reconciliation alone is simple and self-healing but leaves a window of stale access.", "Connector writes overriding remote edits vs the remote side being authoritative for some fields: override keeps data consistent but surprises application owners who edited locally."],
    p: ["Retrying a failed create without checking for a partial success creates duplicate remote accounts.", "A disable event dropped by an unavailable target is never retried and the remote account stays live."],
    v: "Disable a user while a target application is returning errors, restore the target, and confirm the retry queue delivers the disable and a reconciliation report shows no remaining difference.",
    dep: ["group-and-role-mapping","event-streaming","user-store"]
  },
  "inbound-directory-sync": {
    s: "A scheduled or event-driven import that mirrors users and groups from an authoritative external directory or human-resources source into the provider's own store.",
    d: "An agent or connector reads the source, computes the difference from the last run using a stable key, and applies creates, updates and deactivations. Attribute mapping and filters decide which entries come in. Runs record counts and errors, and guards stop a sync that would delete an unusual share of accounts. The hard part is identity matching: a rename, a rehire or a merge of two directories can look like a delete plus a create unless the source offers an immutable identifier.",
    k: ["Mirroring with deletion vs additive-only import: mirroring keeps the provider accurate, but a source outage or bad filter can deactivate a whole company.", "Polling vs change notifications: polling works with any source and is easy to reason about, while notifications are faster but can be missed and still need a full sync."],
    p: ["Matching on email address instead of an immutable key attaches a new hire to a former employee's account when addresses are reused.", "A filter change that excludes a large group is read as mass deletion and applied."],
    v: "Run a sync where the source omits half the users and confirm the deletion guard halts the run and raises an alert instead of deactivating them, then run a normal sync and confirm only the changed entries are updated.",
    dep: ["user-store","group-store","external-directory-bridge","identifier-normalization"]
  },
  "group-and-role-mapping": {
    s: "Rules that translate group membership and attributes into roles and entitlements, both for the provider's own permissions and for claims sent to applications.",
    d: "Source groups from directories, federation assertions and local assignment are mapped by rules to application roles or claim values. Rules can match names, patterns or attributes, and may be nested or computed. The result is evaluated at provisioning time and again at token issuance. The challenge is predictability: overlapping rules, nested groups with cycles and case-sensitive names produce surprises, and a rule that grants access must be traceable to the membership that caused it.",
    k: ["Evaluating mappings at token time vs storing results at sync time: token-time reflects current state, but costs latency and gives different answers across applications.", "Pattern-based rules vs explicit lists: patterns scale to naming conventions, while explicit lists are safer but fall behind as groups change."],
    p: ["A pattern rule matching a name prefix grants a role to a group a user created themselves with a similar name.", "Nested group cycles cause unbounded expansion that slows or fails token issuance."],
    v: "Add a user to a source group mapped to an application role and confirm the next token carries the role claim, then remove the membership and confirm the claim disappears with a trace of which rule applied.",
    dep: ["group-store","claims-mapping","inbound-attribute-mapping"]
  },
  "deprovisioning-propagation": {
    s: "The set of actions that make a removed or suspended account lose access everywhere: sessions, tokens, downstream accounts and delegated credentials.",
    d: "When an account is disabled the provider ends sessions, revokes refresh tokens, marks the account so future sign-in fails, emits a security event to subscribed applications and queues downstream disable calls. Access tokens already issued remain valid until expiry unless applications check revocation or lifetimes are short. The measure that matters is time to full loss of access. It is hard because access lives in many places the provider does not control: application sessions, long-lived API keys and local accounts created at first login.",
    k: ["Short access token lifetimes vs introspection on every call: short lifetimes need no extra traffic but leave a window, while introspection closes it at a latency and availability cost.", "Pushing logout and revocation events vs waiting for applications to poll: push is fast but depends on each receiver implementing it correctly."],
    p: ["Applications that mint their own long-lived sessions after the first login ignore the provider's later disable event.", "Revoking sessions but not delegated API keys leaves a working back door."],
    v: "Disable a test user and measure the time until a held access token is rejected, a session is ended in a downstream application and the downstream account is disabled, and compare each with the stated target.",
    dep: ["session-store","token-revocation","back-channel-logout","outbound-connectors","event-streaming"]
  },
  "audit-event-log": {
    s: "An append-only record of authentication attempts, token issuance, administrative changes and security decisions, with actor, target, time, source and outcome.",
    d: "Every component emits structured events with a common schema and a correlation identifier that ties together the steps of one sign-in. Events are written before the response returns for security-critical actions, then shipped to durable storage and optionally signed or chained to show tampering. Content must be useful without leaking secrets: it records that a password failed, never the password. The difficulty is completeness and volume together, since the log must capture denials and background actions, and sign-in traffic is large and bursty.",
    k: ["Synchronous write for critical events vs asynchronous for all: synchronous guarantees a record exists for each action, but couples availability and latency to the log store.", "Chained or signed records vs ordinary storage controls: tamper evidence matters for investigations, though key management and verification add operational cost."],
    p: ["Logging full request bodies on error paths writes passwords and tokens into the log.", "Events missing a correlation identifier cannot be joined, so an incident reconstruction stalls at the second step."],
    v: "Perform one failed and one successful sign-in with a second factor and confirm the log shows each step under one correlation identifier, with no secret values, and that deleting a stored record is refused or detected.",
    dep: []
  },
  "event-streaming": {
    s: "A feed of identity events delivered to subscribers in near real time, used by security tooling, downstream applications and automation.",
    d: "Selected audit and lifecycle events are published to a stream or webhook with a stable schema, signed so receivers can trust the sender. Subscribers include threat detection, applications that need to react to session or credential changes, and workflow tools. Delivery is at least once with ordering per user, retries and a dead-letter store for failures. The hard parts are schema stability, since consumers break when fields change, and backpressure when a subscriber is slow or down.",
    k: ["At-least-once delivery with idempotent consumers vs exactly-once claims: at-least-once is realistic and simple to operate but pushes duplicate handling onto every receiver.", "Push webhooks vs pull streams: push is easy to adopt, while pull lets consumers control rate and replay at the cost of managing offsets."],
    p: ["Unsigned webhooks let anyone forge a revocation or login event to a receiver.", "A subscriber outage longer than retention silently loses the security events it most needs."],
    v: "Trigger a password change and confirm a signed event arrives at a test subscriber once, then take the subscriber down, trigger another, bring it back and confirm the missed event is delivered.",
    dep: ["audit-event-log"]
  },
  "sign-in-analytics": {
    s: "Aggregated views of sign-in volume, success and failure rates, factor use, latency and errors by tenant, application and region, for operators and customers.",
    d: "Events are aggregated into time series and breakdowns: failures by reason, factor method, device and country, and funnels showing where users abandon a flow. Dashboards serve tenant administrators and the operating team, and the same metrics drive alerts. Aggregation must respect tenant boundaries and minimize personal data. The main difficulty is interpretation: a rise in failures can be an attack, a broken release, a certificate expiry at a federated partner or a changed prompt that confuses users.",
    k: ["Pre-aggregated counters vs querying raw events: counters are cheap and fast, but cannot answer a new question about an incident without the raw log.", "Per-tenant dashboards for customers vs operator-only views: customer views reduce support load, but expose data that needs strict isolation and filtering."],
    p: ["Averages hide a total outage for one small tenant inside healthy global numbers.", "Unbounded label values such as raw user agents explode metric storage."],
    v: "Generate a known number of failures with a wrong password for one tenant and confirm the dashboard shows that count under the correct reason for that tenant only, within the expected delay.",
    dep: ["audit-event-log","event-streaming"]
  },
  "log-retention-and-export": {
    s: "Policies and tooling that decide how long identity logs are kept, where they are archived, and how tenants and auditors can export them.",
    d: "Retention periods differ by event type and by regulation: security events are kept long, while records tied to personal data may need to expire. Storage tiers move old data to cheaper media, and export jobs deliver logs to a tenant's own storage or monitoring system. Deletion requests must be honored without destroying the integrity of the trail. The conflict is built into the work: investigators want long history, privacy rules want short retention, and both apply to the same records.",
    k: ["Pseudonymizing users in old logs vs deleting entries: pseudonyms keep the pattern for investigation, but may still count as personal data in some interpretations.", "Provider-hosted retention vs customer-owned export: hosted is simple, while export gives customers control and shifts cost and responsibility to them."],
    p: ["Keeping logs forever by default creates a large store of personal data that nobody has a reason to hold.", "An export that silently truncates at a size limit gives auditors an incomplete record."],
    v: "Request an export for a date range containing a known event count and confirm the delivered file contains exactly those events, then confirm events past retention are absent from storage.",
    dep: ["audit-event-log"]
  },
  "alerting-and-detection": {
    s: "Rules and models that turn identity events into alerts for the operating team and for customers, such as impossible travel, mass failures and administrator changes.",
    d: "Detections run on the event stream, combining thresholds, sequences and baselines per user and tenant. Examples are a successful sign-in after many failures, a new factor added then a password reset, a new administrator, or a sudden jump in token requests from one client. Alerts carry enough context to act and can trigger automatic responses such as step-up or lockout. It is hard because noise erodes trust: a rule that fires constantly gets ignored, and a rule that fires rarely may never be tested against a real attack.",
    k: ["Static thresholds vs learned baselines: thresholds are explainable and cheap, while baselines catch unusual behavior but need history and are hard to debug.", "Automatic response vs human review: automation limits damage at machine speed, but a false positive can lock out a real executive during an incident."],
    p: ["Alerts routed to a shared mailbox nobody watches turn a detection into a record of a missed breach.", "Rules written against one log format stop firing silently when the event schema changes."],
    v: "Replay a recorded sequence of many failures followed by a success and confirm the expected alert fires once with the user, source and sequence, and that a normal day's traffic produces none.",
    dep: ["event-streaming","anomaly-scoring"]
  },
  "hosted-login-pages": {
    s: "The provider-served pages where users enter credentials and approve prompts, kept on the provider's own domain so applications never handle passwords.",
    d: "An application redirects the browser to the provider, which renders the sign-in, factor and consent pages, sets its session cookie and redirects back with a code. Keeping the credential prompt on one domain trusted by the browser lets users, password managers and passkeys recognize it, and keeps passwords away from relying applications. Pages must resist framing, injection and scraping, and degrade for assistive technology. The cost is a visible redirect, so branding and speed matter as much as security.",
    k: ["Redirect to a hosted page vs embedding the form in the application: hosting keeps credentials off application servers and supports single sign-on, while embedding gives seamless design and widens the attack surface.", "One shared page vs tenant-specific pages: a shared page is easier to harden, while per-tenant pages improve recognition and trust."],
    p: ["Allowing the login page to be framed lets an attacker overlay it with a clickjacking layer.", "Pages that behave differently for existing and unknown identifiers reveal which accounts exist."],
    v: "Load the login page inside a frame on another origin and confirm the browser refuses it, then submit a wrong password for a real and a nonexistent user and confirm identical responses and timing.",
    dep: ["flow-orchestration","branding-and-templates","sso-cookie"]
  },
  "identifier-first-flow": {
    s: "A sign-in pattern that asks for the username first, then chooses the next step, such as password, passkey or redirect to a company's provider, based on who the user is.",
    d: "The first screen accepts an identifier and sends it to the server, which looks up the account and its tenant's policy and returns the method to use: password, a passkey prompt, a federated redirect, or a generic response. This allows different methods per user and per domain, and allows passkey autofill. It must not reveal whether an account exists. The difficulty is that the screen that chooses is the one that leaks: differing messages, timing or available methods can enumerate accounts.",
    k: ["Identifier-first vs a single form with both fields: identifier-first supports per-user methods and federation, but adds a step and a lookup that must be hardened.", "Returning a generic method list for unknown identifiers vs failing early: a generic list resists enumeration, though it wastes the user's time when the identifier is mistyped."],
    p: ["Offering a passkey prompt only for existing accounts reveals which usernames are real.", "Honoring the identifier's domain without verification sends a user to an attacker-configured federation target."],
    v: "Submit one existing and one random identifier and confirm the responses have the same shape and similar timing, then submit an identifier whose domain is federated and confirm the redirect.",
    dep: ["home-realm-discovery","user-store","factor-policy-engine"]
  },
  "flow-orchestration": {
    s: "The engine that decides which step comes next in a sign-in or registration: it holds the state of one attempt and consults policy after each answer.",
    d: "A flow is a state machine with steps such as collect identifier, check password, require factor, accept terms and complete. The state of the attempt is held server-side or in a signed token, bound to the browser, and each step validates its inputs and the previous state. Policy, risk and application hints choose the path. Custom hooks can add steps. It is hard because attackers move between steps out of order, replay old states and race parallel tabs, so every transition must be checked against what has already been proven.",
    k: ["Declarative flows as data vs flows written as code: data is easy to review and change safely, while code can express anything but is difficult to test and secure.", "Server-side attempt state vs signed client state: server state is simpler to invalidate, while signed client state scales without a lookup but can be replayed."],
    p: ["A step that can be reached directly, skipping the factor, turns a policy into a suggestion.", "Custom hook code that makes a slow outbound call stalls sign-in for every user of that tenant."],
    v: "Attempt to request the final step of a flow without completing the factor step and confirm the server refuses it, then replay a captured earlier step after completion and confirm it is rejected.",
    dep: ["factor-policy-engine","adaptive-authentication","session-store","consent-screens"]
  },
  "consent-screens": {
    s: "Screens that show a person which application wants which access, record their decision and let them review or withdraw it later.",
    d: "When an application requests scopes the user has not granted, the provider shows the application's name, publisher and requested permissions in plain language, and stores the grant against the user and client. First-party applications may skip the screen by policy, and administrators can approve on behalf of a whole tenant. Later requests for the same scopes need no prompt. The difficulty is meaning: users approve what they do not understand, scope names are technical, and a screen that appears too often trains people to click through.",
    k: ["Per-scope grants remembered for reuse vs prompting on every request: remembering reduces fatigue, though it makes a later scope change easy to miss.", "Administrator pre-approval vs user consent: pre-approval removes prompts in managed fleets, but removes the user's chance to refuse an application they do not recognize."],
    p: ["Allowing arbitrary application names on the screen lets a malicious application impersonate a trusted one.", "Granting that cannot be listed or withdrawn leave third parties with access long after the user stopped using them."],
    v: "Authorize a new test application requesting two scopes, confirm both appear in plain language with the application's verified name, then revoke the grant and confirm the next request prompts again and old tokens stop working.",
    dep: ["client-registry","scopes-and-audiences","user-store"]
  },
  "device-code-screens": {
    s: "The pages where a person enters or confirms a short code displayed by a television, command-line tool or other device that has no good way to type a password.",
    d: "The device shows a code and an address. On a phone or computer the user visits the provider, signs in normally, enters the code and sees which application and device they are approving. The provider links the approval to the waiting device, which then receives tokens. The page must make it hard to approve a code someone else displayed. The difficulty is social: attackers start a flow on their own device and trick a victim into entering the code.",
    k: ["Short human-friendly codes vs long codes: short codes are easy to type, but require rate limits and short lifetimes to resist guessing.", "Confirming the device's details on the approval page vs only the code: details help a careful user spot a stranger's request, but depend on the user reading them."],
    p: ["Codes with a low entropy and a long lifetime can be guessed by trying many against the page.", "Approval pages that omit the requesting application's name make phishing by code trivial."],
    v: "Start a device flow, enter the code on a signed-in browser, and confirm the page names the application before approval, then try five wrong codes in a minute and confirm rate limiting engages.",
    dep: ["device-authorization-flow","rate-limiting","consent-screens"]
  },
  "embedded-sign-in-sdks": {
    s: "Libraries for web, mobile and server applications that start sign-in, handle the redirect, store tokens and refresh them, so developers do not build the protocol by hand.",
    d: "An SDK generates state and PKCE values, opens the system browser or a redirect, validates the response and tokens, stores them in the platform's secure storage and refreshes silently. Server-side libraries verify incoming tokens against published keys. They hide protocol detail but also carry its security: a faulty SDK reproduces the same flaw in every application using it. They must track each platform's browser and storage changes, and avoid embedded web views that hide the address bar.",
    k: ["System browser sign-in vs an embedded web view: the system browser enables shared single sign-on and passkeys, while a web view is smoother but lets the application read credentials.", "Maintaining official libraries vs relying on community ones: official libraries are consistent and patched quickly, but are costly across many platforms."],
    p: ["Tokens stored in browser storage readable by any script are stolen by a single cross-site scripting flaw.", "An SDK that skips verifying the nonce or issuer accepts forged responses."],
    v: "Run the sample application against a test tenant, sign in, inspect where tokens are stored, and confirm a response with a modified state value or a wrong issuer is rejected by the library.",
    dep: ["authorization-code-flow","pkce-verification","id-tokens"]
  },
  "error-and-message-design": {
    s: "The wording and structure of errors, prompts and notifications, which must help legitimate users recover without telling an attacker anything useful.",
    d: "Every failure maps to a user message and a separate internal reason. Public messages are deliberately uniform for bad identifier and bad password, while the log keeps the real cause. Messages for blocked, expired and unverified states give a next action. Security notifications such as new sign-in or factor changes tell the owner what happened and how to respond. The conflict is between helpfulness and secrecy, and between support staff who need detail and responses that must not provide it.",
    k: ["Uniform public errors with detailed logs vs specific messages: uniform messages block enumeration, at the price of frustrated users and more support requests.", "Notifying on every sign-in vs only on unusual ones: constant notices are ignored, while only unusual ones depend on accurate detection."],
    p: ["A message that says the password is wrong for known accounts and the user is not found for others enumerates the directory.", "Notification emails that contain a clickable reset link teach users to click links in emails."],
    v: "Trigger each failure type for a real and a missing account and compare the public responses for equality, then confirm the internal log records the distinct reason for each.",
    dep: ["audit-event-log","hosted-login-pages"]
  },
  "password-reset-flow": {
    s: "The sequence that lets someone who forgot their password prove control of another channel and set a new one, without exposing whether an account exists.",
    d: "The user requests a reset for an identifier. The provider always answers the same way, and if the account exists it sends a single-use, short-lived token through a verified channel. The token is stored hashed, bound to the request and consumed on use. Setting the password ends existing sessions and refresh tokens and notifies the owner. It is the highest-value target in the system because it bypasses the password and often the second factor, so the channel's own security caps the account's.",
    k: ["Resetting without touching the second factor vs requiring it: skipping it is friendlier, but lets a mailbox takeover bypass the factor entirely.", "Link containing a token vs a code typed into the page: links are convenient, while codes avoid links being logged, previewed or scanned by mail filters."],
    p: ["Reset tokens that survive a second request let an attacker use an old one the victim never saw.", "Putting the token in a URL that is sent to third-party analytics leaks account takeover to them."],
    v: "Request two resets, use the second token and confirm the first is rejected, confirm sessions and refresh tokens from before the reset stop working, and confirm the owner receives a notice.",
    dep: ["credential-store","contact-verification","message-delivery","session-store"]
  },
  "recovery-codes": {
    s: "A set of single-use codes given to a user at enrollment, to be stored offline and used to regain access when every other factor is lost.",
    d: "On enrolling a second factor the provider generates several random codes, shows them once, and stores only hashes. Using one consumes it, notifies the user and may require a new set. Codes serve as the last-resort factor and have the strength of whatever protects the paper or file they are written to. It is hard because users do not keep them, and because a code works for anyone who has it, so it must be treated as equivalent to a password and be rate limited.",
    k: ["Offering recovery codes vs relying on support-assisted recovery: codes are self-service and cheap, but users often lose them, which pushes volume to a weaker human process.", "Few long codes vs many short ones: long codes resist guessing, while short ones are usable but need strict attempt limits."],
    p: ["Storing the codes in plain form means a database leak defeats the second factor for every user.", "Codes that never expire and are never regenerated keep working on an old printed sheet."],
    v: "Generate a set, use one code to sign in, confirm it cannot be used again, confirm the owner is notified and the remaining count decreases, and confirm the database holds only hashes.",
    dep: ["factor-enrollment","credential-store","rate-limiting"]
  },
  "contact-verification": {
    s: "Checks that an email address or phone number really belongs to the account holder before it is trusted for sign-in, recovery or notifications.",
    d: "After a user adds or changes a contact, the provider sends a code or link and marks the contact verified only when it is returned in time. Verified contacts can then be used for recovery and for matching federated identities. Changing a contact is itself sensitive, so it requires recent authentication and notifies the old address. The difficulty is that contacts are reused and recycled: phone numbers are reassigned and mailboxes are taken over, so verification today does not prove ownership next year.",
    k: ["Treating email as a durable identifier vs an attribute that can change: durable is simple, but a changed or recycled address then identifies the wrong person.", "Reverifying contacts periodically vs once: periodic checks catch recycled numbers, at the cost of friction and delivery spend."],
    p: ["Accepting an unverified email from a federated provider lets an attacker link to an existing account that uses that address.", "Sending the confirmation to the new address only means a hijacked session can silently change the recovery email."],
    v: "Add a new email, confirm the account cannot use it for recovery until the link is followed, then change the address and confirm the previous address receives a notice with a way to undo.",
    dep: ["message-delivery","user-store","step-up-authentication"]
  },
  "assisted-recovery": {
    s: "A human or automated process for restoring access when a person has lost every factor, using identity checks that are weaker than a factor but still resist impersonation.",
    d: "Support staff or a recovery service verify identity using prior knowledge, documents, a trusted colleague or a manager's approval, then perform a controlled reset with a waiting period and notification to existing contacts. Every step is recorded. It is both the last line and the easiest to abuse: attackers target the helpdesk with plausible stories because it bypasses the cryptography. Controls such as delays, dual approval and reduced privileges after recovery limit the damage.",
    k: ["Delayed recovery with notification vs immediate recovery: a delay gives the real owner time to object, but frustrates people locked out of urgent work.", "Staff discretion vs fixed scripted checks: scripts are consistent and auditable, while discretion handles odd cases and invites social engineering."],
    p: ["A helpdesk that can reset a factor on a phone call is the cheapest path into any account.", "Recovered accounts that immediately regain full privileges give an attacker everything the original owner had."],
    v: "Run a recovery drill with a staff member impersonating a user and confirm the process requires the scripted checks, applies the waiting period, notifies the old contacts and logs each approver.",
    dep: ["administrator-roles","audit-event-log","factor-enrollment"]
  },
  "self-service-profile": {
    s: "The page where a person manages their own attributes, factors, sessions, connected applications and grants, with sensitive changes requiring fresh authentication.",
    d: "Users update names and contacts, enroll and remove factors, see active sessions and devices, and review which applications hold access. Changes to credentials or contacts demand recent proof and produce notifications. Which attributes are editable is controlled by policy, since some come from an authoritative directory. It is useful as a security tool as much as a convenience: showing users their own sessions and sign-ins lets them notice a stranger first.",
    k: ["Letting users edit all attributes vs only those not owned by a source system: full editing is flexible, but edits are overwritten by the next sync and confuse users.", "Listing sessions and devices with locations vs hiding them: transparency helps users spot compromise, but location data adds privacy burden and wrong guesses cause alarm."],
    p: ["Removing a user's last factor without recent authentication lets a hijacked session lock the real owner out.", "Editable email or username attributes that feed federation matching enable account takeover by editing."],
    v: "Open the profile in a session older than the recency limit, try to remove a factor, and confirm a fresh authentication is required first, then confirm the removal is logged and notified.",
    dep: ["step-up-authentication","session-store","factor-enrollment","user-store"]
  },
  "account-linking": {
    s: "The logic that associates several sign-in methods or external identities with one account, and decides when two identities are safely the same person.",
    d: "A person may sign in with a password, a passkey and one or more external providers. The provider stores each as a linked identity under one account identifier. Linking happens when a signed-in user adds a method, or automatically when an incoming identity matches an existing account by a verified attribute. Automatic linking is convenient and dangerous: it trusts that the external provider verified the attribute. Unlinking must not leave the account without any way to sign in.",
    k: ["Automatic linking on matching verified email vs requiring the user to sign in first: automatic is smoother, but depends on every upstream provider checking email ownership.", "One account per person vs separate accounts per method: one account keeps data together, while separate ones avoid takeover through a weak method."],
    p: ["Linking by an unverified email claim from an upstream provider lets an attacker take over a victim's account by registering that address there.", "Unlinking the only method strands the account with no way to authenticate."],
    v: "Sign in through an upstream provider returning an unverified email that matches an existing account, and confirm no link is made and the user is asked to authenticate to the existing account first.",
    dep: ["social-login","upstream-oidc-connections","user-store","contact-verification"]
  }
});
