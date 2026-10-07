// Details for the team chat plate, part 4: identity, permissions, compliance, operations, cross-cutting concerns.
ATLAS.details("team-chat", {
  "user-accounts": {
    s: "The records representing people within a workspace: profile, email, role, status and settings, with lifecycle states from invited to active to deactivated.",
    d: "An account has a stable ID, one or more verified emails, a display name, time zone, role and settings. Lifecycle states matter: invited users have no access yet, deactivated users keep their history but lose access, and deleted accounts are anonymized according to policy. Identity may be per workspace or global across several. Display names and handles are mutable, so everything references IDs. Deactivation must immediately revoke sessions, tokens, push registrations and app grants, which are scattered across the system.",
    k: ["Deactivate and keep history vs delete the user: deactivation keeps conversations intact and attributable, but retains personal data that privacy rules may require removing.", "Email as the identifier vs opaque IDs: email is convenient for sign-in and invites, but changes over time and cannot be the reference stored on messages."],
    p: ["A deactivated user whose sessions or API tokens are not revoked keeps reading messages after leaving the company.", "Reusing an email for a new employee can attach the new person to the old person's history."],
    v: "Deactivate a user with open sessions on three devices and an installed app token; within seconds all connections close, tokens fail, push registrations are removed, and their old messages still display their name.",
    dep: ["workspace-model", "sessions"]
  },
  "sso": {
    s: "Sign-in through the customer's identity provider using SAML or OIDC, so the organization controls authentication, policies and the ability to cut off access.",
    d: "The platform acts as a service provider: it redirects the user to the identity provider, validates the signed assertion or token, maps attributes to an account, and creates a session. Admins configure the provider's metadata, certificate rotation and attribute mapping. Policies can require SSO for all members, which then disables other sign-in paths. Just-in-time account creation is optional. The difficulties are signature and clock validation, certificate rollover, and breaking all logins when the provider is down or misconfigured.",
    k: ["Mandatory SSO for all members vs optional: mandatory gives central control and instant offboarding, but a provider outage locks everyone out and needs break-glass accounts.", "Just-in-time account creation vs pre-provisioned only: just-in-time is easy, while pre-provisioning prevents unexpected accounts and ties to the directory."],
    p: ["An expired signing certificate on the provider side silently breaks every login at the moment it lapses.", "Weak assertion validation, such as ignoring audience or signature scope, enables account takeover."],
    v: "Sign in through a test identity provider, rotate its signing certificate, and confirm sign-in keeps working with the new one and fails with the old; assertions with a wrong audience or expired timestamp are rejected.",
    dep: ["user-accounts", "sessions"]
  },
  "scim": {
    s: "A standard API through which the customer's directory creates, updates and deactivates users and groups automatically, keeping the platform in step with the organization.",
    d: "The identity provider calls a SCIM endpoint to create users, change attributes, and set them inactive when someone leaves, and to manage groups and memberships. The platform maps these to accounts and user groups, applies the changes idempotently, and handles partial failures and ordering, such as adding a user to a group before the user exists. Deprovisioning triggers full revocation. The directory is the source of truth, so manual edits in the platform may be blocked or overwritten.",
    k: ["Directory as source of truth vs local edits allowed: strict sync prevents drift, but blocks quick admin fixes; allowing edits creates silent divergence.", "Push from the provider vs periodic pull by the platform: push is prompt and simple, while pull tolerates provider limits and failures but delays offboarding."],
    p: ["A deprovisioning call that fails and is not retried leaves a departed employee with access for weeks.", "Group sync that deletes and recreates memberships on each run breaks channel access for minutes."],
    v: "Create, rename and deactivate a user in a test directory; each change reaches the platform within the target time, repeating a call has no extra effect, and deactivation ends all of the user's sessions.",
    dep: ["user-accounts", "user-groups"]
  },
  "sessions": {
    s: "The authenticated login state per device, with tokens, expiry, revocation and the ability for users and admins to list and end them.",
    d: "After sign-in, each device gets a session with a token, often short-lived with a refresh mechanism. The server records devices, last use and location hints for the user's security page. Tokens are checked on every API call and on connection handshake. Revocation, by user, admin or policy change, must reach gateways holding open connections. Browser sessions need cookie protections against cross-site attacks; native clients use secure storage. Session length is a policy choice that customers tune.",
    k: ["Short-lived access tokens with refresh vs long-lived session tokens: short tokens limit theft impact and enable revocation, but require refresh logic and stable server state.", "Revocation checked on every request vs only at refresh: per-request checks are immediate and cost a lookup; refresh-time checks are cheap and leave a window."],
    p: ["Open real-time connections that are not closed on revocation continue receiving messages with a revoked token.", "Tokens stored unencrypted on a client or in logs let anyone who obtains them act as the user."],
    v: "Revoke one of a user's sessions from the security page: that device's API calls fail and its live connection closes within seconds, while the user's other devices remain signed in.",
    dep: ["user-accounts", "mfa"]
  },
  "mfa": {
    s: "Additional verification beyond a password, using authenticator codes, hardware keys or push approvals, enforced per user or by workspace policy.",
    d: "Users enroll factors and are challenged at sign-in or on sensitive actions. Policies require MFA for all or for admins. Recovery codes cover lost devices. When SSO is used the identity provider usually performs MFA and the platform trusts its assertion. Enrollment, recovery and reset flows are the weakest points, since attackers target them rather than the factor. Rate limits and lockouts guard against guessing codes, and every reset is audited.",
    k: ["Phishing-resistant hardware keys vs one-time codes: hardware keys defeat phishing, but cost and recovery are harder; codes are universal and phishable.", "Strict recovery with admin approval vs self-service reset: strict recovery resists social engineering, but burdens admins and slows locked-out users."],
    p: ["A recovery path that bypasses MFA through email alone makes the factor irrelevant.", "Unlimited attempts on a six-digit code allow brute force within minutes."],
    v: "Enroll a factor, require MFA by policy, then attempt sign-in with a wrong code repeatedly: attempts are throttled and logged, a correct code succeeds, and a reset requires the documented approval and appears in the audit log.",
    dep: ["sessions", "audit-log"]
  },
  "device-policy": {
    s: "Controls for managed environments: restrict which clients and versions can connect, require device compliance, block downloads, or remotely sign out lost devices.",
    d: "Admins set policies such as minimum client version, allowed networks, forbidden file download or copy on unmanaged devices, and session duration per device type. The client reports its version and posture at handshake and the server enforces or limits features. Remote sign-out and cache wipe handle loss. Integrations with device management provide a compliance signal. Policy must be enforced server-side, since a client-side check can be bypassed, and cached data on a lost device must be minimized.",
    k: ["Server-enforced restrictions vs client-enforced: server enforcement cannot be bypassed by a modified client, but limits what can be controlled to what the server sees.", "Strict minimum version vs tolerant: strict versions close security holes quickly, but lock out users on slow update cycles."],
    p: ["A policy applied only in the interface lets the same restricted action work through the API.", "A remote wipe that clears the session but not the local cache leaves messages on a lost phone."],
    v: "Mark a device as non-compliant and confirm downloads are blocked in the app and through the API, then sign it out remotely and verify the next request fails and the local cache is cleared on next launch.",
    dep: ["session-handshake", "sessions"]
  },
  "roles": {
    s: "The coarse workspace-level permission tiers, such as owner, admin, member and guest, that decide who may manage settings, users, channels and apps.",
    d: "Roles bundle capabilities: inviting users, creating channels, managing apps, exporting data, changing retention. A user has one role per workspace, sometimes with custom roles or delegated admin capabilities such as billing. Role changes take effect across sessions at once and are audited. The model has to be simple enough for admins to reason about, because most permission mistakes come from misunderstanding what a role includes rather than from software bugs.",
    k: ["Few fixed roles vs fully custom roles: fixed roles are easy to understand and audit, while custom roles fit complex organizations but make effective access hard to predict.", "Separation of admin duties vs a single super admin: separated duties limit insider risk, but increase coordination for small teams."],
    p: ["Too many owners with no review means a compromised account can export or delete everything.", "A role downgrade that does not invalidate cached permission results leaves the old access active for minutes."],
    v: "Downgrade an admin to member while they have the settings page open and an API token; the next sensitive action by either is denied, and the change is recorded in the audit log.",
    dep: ["permission-evaluator", "user-accounts"]
  },
  "channel-permissions": {
    s: "Per-channel controls over who can view, join, post, mention broadly, start threads, invite others or manage the channel.",
    d: "Settings are held on the channel and combined with workspace roles. Examples: read-only announcement channels, restricted broadcast mentions, who can add integrations, and whether guests may join. Private channel visibility is itself a permission. Evaluation takes the user's role, membership and channel settings, and returns allow or deny. Enterprise features add admin-managed channels that members cannot alter. The risk is complexity: overlapping workspace and channel rules need a defined precedence, or admins cannot predict results.",
    k: ["Channel rules narrowing workspace defaults only vs able to broaden: narrowing-only is safe and predictable, but cannot express exceptions admins sometimes need.", "Per-channel overrides vs workspace-wide policies: overrides give flexibility, while central policies are easier to audit and apply consistently."],
    p: ["A channel left writable by everyone in a workspace that intended read-only receives announcements spoofed by any member.", "Permission precedence that differs between the interface and the API gives different answers for the same action."],
    v: "Set a channel to read-only for members: a member's post is refused in the interface and via the API with the same reason, an admin's post succeeds, and the setting change appears in the audit log.",
    dep: ["roles", "channels", "permission-evaluator"]
  },
  "posting-rules": {
    s: "Rules that restrict who may send which kinds of messages, such as announcement-only, no broadcast mentions, no external links, or approval before posting.",
    d: "Rules are evaluated in the send path before the message is stored. They can limit posting by role, restrict mention scope, cap message size and rate, block link or file types, and hold messages for moderation. Rejections return a specific reason so the interface can explain. Moderation queues need a review interface and their own retention rules. Rules must apply equally to the API and to bots, which are a common way around interface-only checks.",
    k: ["Block at send time vs flag for later review: blocking prevents the harm, while flagging keeps conversation flowing and favors trust.", "Uniform rules for humans and bots vs separate: uniform rules close loopholes, but integrations that legitimately post often need specific exceptions."],
    p: ["A rule enforced only in the composer is bypassed by any API client or webhook.", "Rejections with vague errors lead users to retry or work around instead of understanding the policy."],
    v: "Enable a rule blocking broadcast mentions for members, then attempt one from the interface, from the API and from a bot token; all three are refused with the same explanation.",
    dep: ["send-path", "channel-permissions"]
  },
  "guest-accounts": {
    s: "Limited accounts for contractors and partners, restricted to specific channels, with fewer capabilities and visible marking, often priced and expiring differently.",
    d: "A guest is a member of the workspace with a restricted role: access only to assigned channels, no channel directory browsing, limited user directory visibility, and often no file download or app installation. Single-channel guests are the most restricted. Guests can have an expiry date. Search, mentions, suggestions and presence must all honor the restriction, which is hard because many features implicitly assume any workspace member can see other members. Each of those features needs a guest-aware path.",
    k: ["Guests inside the workspace with restricted roles vs separate workspaces connected by sharing: restricted roles are simple for collaborators, while separate workspaces keep stronger isolation.", "Expiring guest access by default vs open-ended: expiry limits forgotten access, but causes interruptions to ongoing projects."],
    p: ["A guest sees the full member list through autocomplete or search because a feature forgot the restriction.", "Guests keep access after a project ends since nobody owns removal."],
    v: "Invite a guest to one channel and, as that guest, try the directory, user search, mention autocomplete, search for words from other channels and direct ID requests; every one reveals nothing outside their channel.",
    dep: ["roles", "permission-filtering", "membership"]
  },
  "external-connections": {
    s: "Controlled collaboration between separate organizations, through shared channels or external direct messages, with administrators on both sides approving and governing it.",
    d: "An admin invites a partner organization; the partner's admin accepts, and approved channels become shared. The platform maps each organization's users into the other with limited profile information and enforces each side's policies. Admins can restrict which organizations connect, which channels may be shared and who can invite. Revocation ends access for the whole organization at once. It is the legitimate hole in the tenant boundary, so it needs explicit consent, visible markings, and complete audit on both sides.",
    k: ["Allowlist of approved partner organizations vs open invitations: an allowlist prevents data leaving to unknown parties, but slows legitimate collaboration.", "Show full profiles to partners vs minimal profiles: minimal profiles protect internal directories, but make external people harder to recognize."],
    p: ["A connection approved once and never reviewed leaves a partner with access to channels long after a project ends.", "External users shown without a visible marker lead employees to share internal information by mistake."],
    v: "Connect two test organizations, share a channel, then revoke from one side: both sides lose live access immediately, each keeps only what its own retention policy allows, and both audit logs record every step.",
    dep: ["shared-channels", "audit-log", "roles"]
  },
  "permission-evaluator": {
    s: "The single decision point that answers whether a given actor may perform a given action on a given resource, used by reads, sends, search, notifications and apps.",
    d: "Inputs are the actor (user, bot, guest), role, workspace policies, channel membership and settings, and resource properties. The result is allow or deny with a reason. Because it runs on nearly every request, results are cached with careful invalidation and batch-evaluated for lists. Centralizing the logic prevents each feature from implementing its own rules, which is how inconsistent leaks arise. It must be fast, deterministic and testable against a matrix of cases, and its decisions are logged for sensitive actions.",
    k: ["One central evaluator vs checks embedded in each service: central logic stays consistent and is testable, but becomes a latency-critical dependency of everything.", "Cache decisions vs evaluate fresh: caching keeps the hot path fast, but delays revocation unless invalidation is exact."],
    p: ["A service that skips the evaluator for convenience becomes the path through which data leaks.", "Cached allow decisions outlive a membership removal and keep granting access."],
    v: "Run a table of actor, resource and action combinations (members, guests, bots, removed users) through the evaluator, the API, search and the live stream; every surface gives the same decision for each row.",
    dep: ["roles", "channel-permissions", "membership"]
  },
  "retention-policies": {
    s: "Rules that define how long messages and files are kept before automatic deletion, set per workspace, channel or conversation type, to meet legal and company requirements.",
    d: "Policies specify duration by data type and scope, and may let users delete their own messages or not. A scheduled process finds expired content and passes it to the deletion engine. Where several policies apply, the rule is typically the longest hold or the most specific scope; the platform must define this clearly. Shared channels and external partners can have conflicting policies. Policy changes apply retroactively to existing content, which can destroy data permanently, so they require confirmation and clear previews.",
    k: ["Retroactive application vs forward only: retroactive meets compliance for old content but a mistake destroys irreplaceable data; forward only is safe and leaves old data.", "Per-channel policies vs a workspace default: per-channel precision matches data classification, but is hard to administer and audit."],
    p: ["A policy change that is meant to shorten future retention deletes years of existing history unrecoverably.", "Retention that covers messages but not files, previews or search indexes leaves copies after the stated deletion date."],
    v: "Set a one-day retention on a test channel with seeded old content; after the next run, the messages, files, thread replies, search entries and caches for expired items are gone, and newer items remain.",
    dep: ["deletion-engine", "legal-hold"]
  },
  "deletion-engine": {
    s: "The process that actually removes content everywhere it lives: message store, replicas, files, previews, search indexes, caches and exports, and records proof of completion.",
    d: "Deletion is a fan-out of tasks across systems. The engine takes a set of messages or a user's data, marks them, and removes from the primary store, then queues removal from indexes, caches, CDN, derived files and analytics. Backups age out on their own schedule, which policy must acknowledge. Legal holds block it. Progress is tracked per target and retried until each confirms. The challenge is completeness: every derived copy must be known, which requires an inventory of where content flows.",
    k: ["Soft delete then purge after a delay vs immediate hard delete: a delay allows recovery from mistakes, but means content exists after users think it is gone.", "Central deletion service vs each system handling its own: central coordination ensures completeness and evidence, but needs every system to expose a delete hook."],
    p: ["A new feature that copies message text to a new store without registering with deletion leaves undeletable copies.", "Deletion that ignores backups claims compliance it does not have."],
    v: "Delete a message that was edited, unfurled, reacted to and exported, then check every store and index for its text and ID; none contain it, and the engine's record lists each target as confirmed.",
    dep: ["message-store", "search-indexer", "file-store", "legal-hold"]
  },
  "legal-hold": {
    s: "A freeze that preserves specified users', channels' or date ranges' content from deletion, including edits and deletions, for litigation or investigation.",
    d: "An authorized administrator creates a hold with scope and reason. While active, retention deletion, user deletes and account removals are intercepted: content is preserved, often by retaining all revisions and tombstoned originals in a separate protected store. The hold must override every deletion path, including the deletion engine and user-initiated delete, while users still see the content as deleted. Releasing the hold returns affected items to normal policy. Holds are audited, and access to held data is restricted.",
    k: ["Preserve in place vs copy into a separate vault: in-place is simple but mixes held and normal data; a vault isolates it and needs a pipeline and extra storage.", "Scope by user vs by channel and time: user scope follows custodians, while channel scope catches everything said in a place but may over-preserve."],
    p: ["A deletion path added later that does not check holds destroys evidence, with serious legal consequences.", "Hold scope that misses direct messages or edits omits precisely what an investigation needs."],
    v: "Place a hold on a user, then have them edit and delete messages and the retention job run; the original and edited content remain retrievable by the compliance export, while ordinary users see them as deleted.",
    dep: ["deletion-engine", "audit-log"]
  },
  "ediscovery-export": {
    s: "Produces complete, structured exports of messages, files and metadata for a scope and time range, for legal review or archiving, with integrity evidence.",
    d: "An authorized compliance officer defines scope by users, channels, keywords and dates. A job reads from the store (including held and edited revisions), resolves user names and attachments, and writes files in a standard layout with a manifest and checksums. Direct messages and private channels are included only when policy and law allow, with approvals. The export is itself sensitive, so it is encrypted, time-limited and audited. Large exports run for hours and must be resumable and consistent.",
    k: ["Export through the product interface vs a continuous feed to a third-party archive: on-demand exports are simple, while a feed supports ongoing supervision but streams all content out of the platform.", "Include all revisions vs the latest only: all revisions give a complete record, but produce larger and more complex output."],
    p: ["An export that silently omits private conversations or deleted content gives a false picture in a legal matter.", "Export files left in accessible storage after download become a data leak."],
    v: "Export a test channel with edits, deletions and files; the manifest lists every item, checksums match, deleted and edited content appears per policy, and the export access appears in the audit log.",
    dep: ["message-store", "legal-hold", "audit-log"]
  },
  "audit-log": {
    s: "An append-only record of security and administrative events, such as logins, permission changes, exports and app installs, who did them and when, kept for investigation.",
    d: "Services emit structured events with actor, action, target, time, source address and result. A collector stores them in tamper-evident, time-ordered storage, searchable and exportable to the customer's monitoring tools through an API or stream. Retention is long and independent of message retention. Completeness matters more than speed: a missing event is worse than a delayed one. The log must record privileged actions on content, such as reading someone's messages for a compliance export, as well as changes to settings.",
    k: ["Synchronous write in the request path vs asynchronous emission: synchronous guarantees every action is logged but slows and couples requests; asynchronous may lose events on a crash.", "Log reads of sensitive data vs only changes: logging reads supports investigations but produces large volume."],
    p: ["An admin action path that forgets to emit an event creates an invisible capability.", "An audit log that administrators can edit or delete is not evidence."],
    v: "Perform a set of privileged actions (role change, export, token revocation, policy edit) and check each appears with the right actor and time in the log and in the exported stream, and that an attempt to alter an entry fails.",
    dep: ["observability"]
  },
  "dlp": {
    s: "Detects sensitive content such as card numbers or secrets in messages and files, and blocks, redacts, flags or reports it according to policy.",
    d: "Policies define patterns and classifiers with actions. Scanning happens at send time for blocking or after commit for flagging, and on file upload. Matches create alerts for compliance staff, may hide content pending review, and can notify the sender. Customers can supply their own detection service through hooks. False positives frustrate users, and false negatives give false assurance. Content already sent before a policy existed needs a retroactive scan, and redaction must apply to every copy, including search and exports.",
    k: ["Block at send time vs detect after the fact: blocking prevents exposure but adds latency and false-positive friction; after-the-fact detection is silent and leaves a window.", "Built-in patterns vs customer classifiers: built-ins are easy and generic, while customer classifiers fit their data and add an external dependency."],
    p: ["Redacting the visible message but leaving the original in search and exports leaves the secret exposed.", "Overly broad patterns flag so many messages that reviewers ignore all alerts."],
    v: "Post a test card number and a fake secret key: the policy blocks or redacts as configured, an alert reaches compliance, and a search and an export both show the redacted form.",
    dep: ["send-path", "search-indexer", "audit-log"]
  },
  "key-management": {
    s: "Lets a customer hold and control the encryption keys for their data, revoking them to render stored content unreadable, with envelope encryption and key rotation.",
    d: "Data keys encrypt content per workspace; those are wrapped by a customer-managed key held in the customer's key service. The platform requests unwrapping when needed and caches data keys briefly. Revoking the customer key makes data unreadable after caches expire. Rotation re-wraps data keys without re-encrypting content. Every datastore, file, backup and search index must follow the scheme. The cost is availability: if the customer's key service is down or access is revoked by mistake, their workspace stops working.",
    k: ["Customer-held keys vs provider-held keys: customer control satisfies strict regulators and enables revocation, but makes outages and mistakes in their key service become our outage.", "Encrypt field-level content vs whole-volume: content-level encryption protects against more threats, but breaks server-side search and processing unless extra work is done."],
    p: ["Search indexes or caches holding plaintext defeat the purpose of the customer-managed key.", "Revoking a key without notice makes a workspace unreadable with no recovery path."],
    v: "Revoke a test customer's key and confirm reads fail once cached keys expire, with a clear error, then restore it and confirm access returns; rotate the key and confirm content stays readable.",
    dep: ["file-store", "message-store"]
  },
  "job-queue": {
    s: "A durable queue and worker pool for asynchronous tasks such as unfurls, notifications, indexing, exports and scheduled sends, with retries, priorities and tenant fairness.",
    d: "Producers enqueue tasks with a type, payload and delay. Workers pull, run and acknowledge; failures retry with backoff and eventually move to a dead-letter set for inspection. Queues are separated by priority and kind so slow exports cannot delay notifications, and fairness limits stop one tenant's flood from starving others. Tasks must be idempotent because delivery is at least once. Visibility and alerting on queue age, not just depth, show when work is late.",
    k: ["Per-type queues vs one shared queue: separate queues isolate slow work and permit tuning, but multiply operational surface.", "Per-tenant fairness vs global first-in-first-out: fairness protects small tenants from big imports, but makes ordering across tenants less predictable."],
    p: ["A non-idempotent task retried after a timeout sends duplicate notifications or emails.", "A poison task that fails forever and retries immediately saturates workers."],
    v: "Enqueue a mix of fast and slow tasks from two tenants, one flooding; fast tasks stay within their latency target, the quiet tenant is unaffected, and a deliberately failing task lands in the dead-letter set after the retry limit.",
    dep: ["observability"]
  },
  "rate-limiter": {
    s: "Enforces per-user, per-workspace, per-IP and per-method limits at the edge and in services to keep any single caller from degrading the system.",
    d: "Counters or token buckets track requests over time windows in a fast shared store. Limits differ by method cost, authentication state and tenant tier. Responses carry retry guidance. Limits apply to humans, bots and unauthenticated sources, with stricter ones on sign-in and invitation endpoints. Distributed counting must be approximate enough to be fast and accurate enough to be fair. Overload protection goes beyond fixed limits to load shedding of low-priority work when the system is under stress.",
    k: ["Token bucket allowing bursts vs fixed window: buckets allow natural bursts and smooth limits, while fixed windows are simple but permit double bursts at boundaries.", "Central counters vs local approximate counters: central is accurate but a hot dependency; local is fast and may admit slightly more than the limit."],
    p: ["Limits keyed only by IP penalize everyone behind one corporate network address.", "A limiter store outage that fails closed blocks all traffic, and failing open allows an abuse flood."],
    v: "Send requests from one user, one IP and one app at above their limits: each is limited at its own threshold with correct retry hints, others remain unaffected, and behavior during a simulated limiter store outage follows the documented policy.",
    dep: ["observability"]
  },
  "abuse-spam": {
    s: "Detects and limits spam, phishing, and harassment, including through invites, shared channels, bots and links, using signals, reputation and reporting tools.",
    d: "Signals include rates of invites, messages with links, new-account age, repeated content and reports from users. Responses are graduated: rate limits, challenge, quarantine of links, and suspension. Phishing links are checked against reputation lists, and unfurls are suppressed for risky ones. Workspace admins get reporting and moderation tools. In a workplace product most abuse comes from compromised accounts and from free workspaces, not from members, so the controls focus on account takeover and invitations.",
    k: ["Aggressive automatic blocking vs flagging for review: automatic blocking stops campaigns quickly, but false positives disrupt legitimate customers.", "Signals shared across tenants vs per-tenant only: shared signals catch campaigns faster, but require careful handling of cross-tenant data privacy."],
    p: ["Invitation features abused to send email through the platform damage its mail reputation.", "A compromised account posting phishing links to many channels spreads before detection if links are unfurled automatically."],
    v: "Simulate a compromised account that posts one phishing link to twenty channels and sends bulk invites; the system limits it within the target time, suppresses the unfurl and alerts admins.",
    dep: ["rate-limiter", "link-unfurling"]
  },
  "observability": {
    s: "Metrics, logs and traces that show whether delivery, sends and searches are healthy, measured from the user's view, such as send-to-delivered latency.",
    d: "Key indicators include message send latency, end-to-end delivery latency from commit to client, connection counts, reconnect rates, queue age, notification delay and search freshness. Synthetic clients send and receive continuously to measure the real experience per cell. Traces follow a message through send, fanout, indexing and push. Logs avoid message content to protect privacy. Alerts are tied to service-level objectives rather than internal counters, and dashboards break results down by cell, region and client version.",
    k: ["Synthetic end-to-end probes vs only internal metrics: probes see what users see and catch gaps between components, but cover limited paths.", "Log message content for debugging vs never: content makes debugging easier, but turns logs into an unmanaged copy of private data."],
    p: ["Healthy server metrics while mobile push is failing leave users missing messages with no alert.", "Logs that include message text or tokens create a compliance and security exposure."],
    v: "Inject a delay into one cell's fanout and confirm the probe-based delivery latency alert fires, the trace shows which hop is slow, and no message content appears in any log line.",
    dep: []
  },
  "feature-rollout": {
    s: "Flags and staged rollouts that release changes to a small set of workspaces first, widening gradually, with fast rollback independent of deploys.",
    d: "Features are wrapped in flags evaluated per workspace, user or client version. Rollouts start with internal workspaces, then a small percentage of cells or tenants, monitored against health metrics, before general release. Protocol and storage changes use expand-and-contract: ship readers first, then writers, then remove old paths. Rollback by turning a flag off must be safe, which means the data written under the new path must remain readable. Flags need owners and removal dates to avoid permanent complexity.",
    k: ["Rollout by workspace vs by user: workspace-level rollout keeps a team's experience consistent, while user-level exposes mixed behavior inside one conversation.", "Long-lived flags for customer controls vs short-lived release flags: separating them keeps release flags disposable and customer settings stable."],
    p: ["A flag turned off after data was written in a new format leaves records that old code cannot read.", "Stale flags accumulate until nobody knows which combinations were ever tested."],
    v: "Roll a feature to one percent of cells, then disable it while users are active; behavior reverts within seconds without redeploy and data written during the exposure remains readable.",
    dep: ["cells", "observability"]
  },
  "schema-migrations": {
    s: "Changing database structure and data formats while the service runs, using backward-compatible steps and background backfills, without long locks or downtime.",
    d: "Changes follow expand, migrate and contract: add new columns or tables, deploy code that writes both and reads either, backfill existing data in throttled batches, switch reads, then remove the old structure. Shard-by-shard execution limits risk. Large tables make single statements dangerous because of locks and replication lag, so tools create shadow copies and swap. Version skew between servers and old clients means any format must be readable by two code versions at once.",
    k: ["Online shadow-table migrations vs maintenance windows: online migrations keep service continuous, but take longer and need careful tooling; windows are simple and unacceptable for a global chat product.", "Backfill in the background vs lazily on read: background backfill ends in a clean state, while lazy migration spreads load but leaves old formats forever."],
    p: ["A migration that locks a hot table for seconds blocks every send and triggers a retry storm.", "Dropping the old column before all code versions stop using it breaks older servers mid-deploy."],
    v: "Run a column change on a large test table under write load; message sends continue with unchanged latency, replication lag stays within bounds, and the data after backfill matches a checksum of the old.",
    dep: ["tenant-sharding", "feature-rollout"]
  },
  "backup-restore": {
    s: "Regular copies of the message store, files and configuration, with tested procedures to restore a single workspace, a shard or a whole cell.",
    d: "Continuous log shipping plus periodic snapshots allow point-in-time recovery. Because tenants are co-located, restoring one customer's accidental deletion means extracting only their data from a backup into the live system, which is far harder than restoring a whole database. Backups are encrypted, stored across regions and subject to retention and deletion rules: deleted data still exists in backups until they expire, which policy must state. Restores must be rehearsed, since an untested backup is only a hope.",
    k: ["Whole-shard restore vs per-tenant export and replay: whole-shard is simple but affects every tenant on it; per-tenant restore is precise and needs special tooling.", "Long backup retention vs short: long retention helps recover from slow-discovered errors, but conflicts with deletion promises."],
    p: ["Backups that were never restored turn out to be incomplete or corrupt when an incident demands them.", "Customer deletion requests ignore backups, leaving content that survives past the promised date."],
    v: "Restore one test workspace to a point an hour ago into a separate environment and into the live system, and compare messages, files, memberships and settings to the recorded state; they match and other tenants are untouched.",
    dep: ["message-store", "file-store", "key-management"]
  },
  "ordering-and-consistency": {
    s: "The decision about what order messages and events have, for whom, and how long different views may disagree, which every layer from clients to storage must honor.",
    d: "Strong order within a channel and loose order across channels is the usual choice: it matches what people need and what partitions allow. Edits, reactions and read markers are events layered on messages with their own rules. Eventual consistency is accepted for counts, search and presence, but not for membership removal or permission changes. Writing these promises down is necessary, because clients, caches, indexes and bots all make assumptions that break when two components interpret order differently.",
    k: ["Per-channel total order vs global order: per-channel scales and fits partitioning, but gives up cross-channel causality; global order is far costlier.", "Strong consistency for permissions vs eventual: strong checks keep removal immediate, at a latency and availability cost on every request."],
    p: ["Components that each assume a different notion of order, such as timestamp versus position, show conflicting histories.", "Counts treated as exact in one place and approximate in another produce visible mismatches."],
    v: "Run a concurrent workload from several devices and bots, then verify that every surface (client, search, export, replay) shows the same per-channel order, and that permission removal took effect everywhere within its stated bound.",
    dep: ["channel-ordering", "event-sequencing"]
  },
  "delivery-guarantees": {
    s: "What the platform promises about a message reaching each recipient: at least once with deduplication, how failures are reported, and which signals, like typing, may be lost.",
    d: "Messages and edits are durable and delivered at least once, with clients and idempotency keys removing duplicates. Realtime delivery is best effort; correctness comes from sequence gaps, replay and resync, not from a reliable transport. Notifications and webhooks are at least once and may be late. Typing and presence are lossy by design. Users see honest states: sending, sent, failed. The decision determines retry logic, client state machines, and what an operator may claim during an incident.",
    k: ["At-least-once with deduplication vs exactly-once claims: at-least-once is achievable and robust, while exactly-once needs coordination that fails in practice.", "Lossy ephemeral signals vs reliable everything: dropping typing and presence under load protects the messages that matter."],
    p: ["Treating the live connection as reliable means a missed event is never repaired until the next refresh.", "Showing a message as delivered when only accepted by the server misleads people about whether anyone saw it."],
    v: "Inject packet loss, duplicate deliveries and a gateway crash during a conversation; every message ends up on every client exactly once in order, and the failed ones are visibly marked.",
    dep: ["idempotency", "resume-replay", "event-sequencing"]
  },
  "tenant-isolation": {
    s: "The guarantee that one customer's data and load cannot reach or harm another's, enforced by identifiers in every query, partitioned storage, per-tenant limits and separate cells.",
    d: "Every record is scoped by workspace and every query includes it, ideally enforced by the data access layer rather than by each developer. Storage, search and caches partition by tenant. Resource isolation uses per-tenant rate limits, queues and fair scheduling. Cells bound failure. Some customers pay for dedicated infrastructure and keys. Intended crossings, such as shared channels and organization-wide features, are explicit and audited. A single missing filter is the most severe bug class this product can have.",
    k: ["Enforce scope in a shared data layer vs in each query: central enforcement prevents omissions, but constrains how developers write queries.", "Shared infrastructure with logical isolation vs dedicated per customer: shared is efficient, while dedicated gives stronger guarantees and costs much more."],
    p: ["A cache keyed without the workspace returns one tenant's response to another.", "One tenant's bulk import or flood fills a shared queue and delays everyone's notifications."],
    v: "Run cross-tenant probes: request every resource type with another tenant's IDs, from the API, search, files and live stream; each is refused. And flood one tenant while measuring another's latency, which stays within target.",
    dep: ["workspace-model", "tenant-sharding", "cells"]
  },
  "permission-checks-everywhere": {
    s: "The rule that every read path, including history, search, notifications, files, exports and event delivery, evaluates access, so no feature bypasses the policy applied elsewhere.",
    d: "Permissions are easy to enforce on the main read and easy to forget on the side doors: a push notification preview, a search snippet, an unfurl, a thread summary, a reaction list, a typing indicator, an export. Each derived view is a copy that can outlive or ignore a change. The design response is a single evaluator, tests that run the same matrix against each surface, and treating any new place that stores message text as requiring a permission and deletion story before launch.",
    k: ["Central evaluator called by all surfaces vs per-feature rules: central logic stays consistent, but each new surface must be integrated and cannot be forgotten.", "Check at write time and bake into indexes vs check at read time: baked-in access is fast but stale after membership changes; read-time checks are exact and costlier."],
    p: ["A push notification showing text from a channel the user was just removed from leaks content through a side door.", "A new derived view, such as an analytics export, ships without any access check."],
    v: "Take one private message and remove a user from its channel; then probe every surface that could still show it: history, search, push, email digests, unfurls, thread lists, files and exports. None may reveal it.",
    dep: ["permission-evaluator", "permission-filtering", "file-access-control"]
  },
  "multi-device-state": {
    s: "The requirement that a person's read position, drafts, notification state, preferences and layout stay consistent across the phone, laptop and browser they use at once.",
    d: "Each device is a client with its own cache and connection. State that belongs to the person, not the device, travels through the server and is pushed as events: read markers, drafts, sidebar layout, mute settings, status. Conflicts are resolved by rules suited to each type: markers take the maximum, layouts merge or take last write, drafts per device or synced. Notifications consider all devices, suppressing mobile alerts when the desktop is active. Offline devices catch up through replay.",
    k: ["Server-held per-user state synced to all devices vs device-local state: server state follows the person, but needs sync paths and conflict rules for each field.", "Suppress alerts when another device is active vs alert everywhere: suppression avoids duplicates, but relies on activity signals that may be wrong."],
    p: ["Last-write-wins on a whole settings object loses concurrent changes made on two devices.", "A device that never reconnects keeps stale credentials and pending drafts indefinitely."],
    v: "Use three devices at once: read, mute, edit a draft and reorder the sidebar on different ones; within seconds all devices agree, and an offline device converges after reconnecting.",
    dep: ["read-markers", "client-sync", "sidebar-sections"]
  },
  "fanout-cost": {
    s: "The awareness that one message becomes many deliveries, counters, notifications and index updates, and that cost per message grows with audience, so every feature is designed against audience size.",
    d: "A post to a thousand-member channel can mean a thousand live deliveries, a thousand unread updates, hundreds of notification evaluations and several index writes. Designs choose where work happens: on write for small audiences, on read for large ones, and never per member for broadcast channels. Limits on audience-sized features, such as broadcast mentions, user groups, presence and reactions, exist to cap this multiplication. Capacity planning is done in deliveries per second, not messages per second.",
    k: ["Precompute per-member state on write vs derive on read: precomputing makes reads trivial and amplifies writes; deriving keeps writes constant and costs on each read.", "Cap features by audience size vs allow everything: caps keep cost bounded and disappoint some users, while open features can take down a shard."],
    p: ["A feature designed with a ten-member channel in mind becomes a major incident in a hundred-thousand-member one.", "Capacity measured in messages per second hides that a few huge channels produce most of the load."],
    v: "Measure database writes, events and notifications per message at channel sizes of ten, one thousand and one hundred thousand; the per-message cost must stay bounded for large channels rather than growing with membership.",
    dep: ["big-channel-fanout", "event-fanout", "unread-state"]
  }
});
