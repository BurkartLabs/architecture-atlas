// Details for the code hosting forge plate, part 2: APIs, search, identity, audit.
ATLAS.details("code-forge", {
  "rest-api": {
    s: "Resource-oriented HTTP endpoints for nearly every forge object, used by tools, bots and the forge's own front end, with pagination, conditional requests and stable error shapes.",
    d: "Each resource such as a repository, pull request or comment has URLs and JSON representations, with links to related resources and to the next page of a list. Requests authenticate with a token, resolve the actor, check permissions and call the same domain code the web interface uses. Conditional requests let clients poll cheaply. The hard parts are consistency with the web view, pagination over data that changes between pages, and keeping the surface stable while hundreds of integrations depend on exact field behavior.",
    k: ["Cursor pagination vs page numbers: cursors stay correct while data changes and cannot jump to page fifty; page numbers allow jumping and skip or repeat items under writes.", "One domain layer shared by web and API vs separate paths: sharing keeps rules identical, while separate paths drift and double the permission bugs."],
    p: ["An endpoint that omits the permission check done by the web path exposes private data to anyone with any token.", "Listing endpoints without a maximum page size let one client request a million rows and degrade the database."],
    v: "Page through a list while another client adds items and confirm no item is skipped or repeated; call an endpoint for a private repository with a token lacking access and confirm a not-found response identical to a missing repository.",
    dep: ["accounts-and-orgs","access-tokens","api-rate-limiting","metadata-database","api-versioning"]
  },
  "graphql-api": {
    s: "A single query endpoint where clients name exactly the fields and nested relations they want, reducing round trips for complex views at the cost of harder cost control.",
    d: "A typed schema describes objects and connections. The server parses each query, validates it against the schema and executes resolvers, batching lookups to avoid one database query per node. Because a single request can ask for deep or wide data, the server computes a cost estimate before running it and rejects or rate-limits expensive ones. Schema evolution is by adding fields and marking old ones deprecated, never removing silently.",
    k: ["Cost-based limits vs a flat request count: cost limits reflect real work and are harder for clients to predict; request counts are simple and let one query consume vast resources.", "Persisted queries vs arbitrary queries: persisted queries enable caching and allowlisting but reduce flexibility for ad hoc exploration."],
    p: ["A deeply nested query on a connection with no per-level limit multiplies into millions of rows and ties up the database.", "A resolver that skips the permission check leaks fields that the REST path correctly hides."],
    v: "Send a query requesting three levels of nested lists and confirm the server returns the data with a computed cost in the response; send one exceeding the cost limit and confirm it is rejected before any database work is done.",
    dep: ["metadata-database","api-rate-limiting","accounts-and-orgs","cache-layer"]
  },
  "webhook-dispatch": {
    s: "Delivers signed HTTP notifications to subscriber endpoints when events happen, with retries, delivery logs and manual redelivery.",
    d: "Each event is matched against hooks configured at repository, organization or app level, serialized to JSON, signed with a per-hook secret, and enqueued for delivery. Workers send the request with short timeouts and record the status and response. Failures retry with growing delay and, after repeated failure, the hook is disabled. Ordering is not guaranteed, so receivers must be idempotent, using the delivery id. The hard parts are noisy neighbors, slow receivers and making the sending server safe from being aimed at internal addresses.",
    k: ["At-least-once delivery vs at-most-once: at-least-once never loses events and sends duplicates; at-most-once is simpler for receivers and silently drops events on failure.", "Unordered parallel delivery vs per-hook ordering: parallel is fast and breaks receivers expecting order; ordering needs queues per hook and lets one slow endpoint stall."],
    p: ["Hook URLs pointing at internal addresses let a user make the forge probe its own network unless outbound requests are filtered.", "A slow receiver backs up a shared queue and delays events for unrelated hooks."],
    v: "Point a hook at an endpoint that fails twice then succeeds and confirm three attempts with the same delivery id and a valid signature; point another at an internal address and confirm the delivery is blocked and logged.",
    dep: ["job-queue","apps-and-oauth","load-shedding"]
  },
  "apps-and-oauth": {
    s: "The identity system for third-party integrations: apps that act as themselves or on behalf of a user, with scoped permissions, installation per account and short-lived credentials.",
    d: "An app registers with a name, callback addresses and the permissions it needs. A user or organization installs it and selects which repositories it may touch. It then authenticates with a signed assertion to obtain a short-lived installation token limited to that grant, or uses an authorization flow to act as a user. Webhooks can be configured on the app. The hard parts are least privilege, since broad scopes are convenient for developers, and revocation, which must take effect on tokens already issued.",
    k: ["Installation-scoped short-lived tokens vs long-lived user tokens: short-lived tokens limit damage when leaked and need refresh logic; long-lived are simple and dangerous.", "Fine-grained permissions vs coarse scopes: fine-grained follows least privilege and overwhelms users with choices at install time."],
    p: ["Apps request wide permissions and users approve without reading, turning one compromised app into access to every repository.", "Revoking an installation leaves already-issued tokens valid until expiry unless they are checked against a revocation list."],
    v: "Install an app on one repository, obtain a token, and confirm it can read that repository and gets refused on another; revoke the installation and confirm the token stops working within the stated bound.",
    dep: ["accounts-and-orgs","teams-and-roles","access-tokens","metadata-database"]
  },
  "access-tokens": {
    s: "Credentials that scripts and tools use instead of a password, with scopes, expiry, optional repository restrictions and the ability to be revoked individually.",
    d: "A token is generated once and shown once; only a hash is stored. Each carries an owner, scopes or fine-grained permissions, an expiry and sometimes network restrictions. On every request the forge hashes the presented value, looks it up, and intersects its permissions with the owner's current ones, so a token can never exceed what its owner can do. Repository access over HTTP also accepts tokens in place of passwords. Detecting leaked tokens is a service in itself, usually with a recognizable prefix.",
    k: ["Hash-only storage vs recoverable storage: hashing means a database leak does not expose tokens and users cannot see a token again; recoverable storage is convenient and dangerous.", "Mandatory expiry vs indefinite tokens: expiry limits leak windows and breaks automation that nobody renewed."],
    p: ["A token with no expiry used in a build system remains valid years after the person who created it left.", "Tokens logged in URLs or build output are harvested from logs because they have no recognizable prefix for scanners."],
    v: "Create a token with read-only scope, confirm a write returns a permission error, then delete the token and confirm the next request with it fails; confirm the database holds only a hash of it.",
    dep: ["accounts-and-orgs","teams-and-roles","metadata-database","secret-scanning"]
  },
  "api-rate-limiting": {
    s: "Caps how much each client may do in a time window, protecting shared capacity and slowing abuse, with headers that tell well-behaved clients when to retry.",
    d: "Limits are keyed by token, user, app installation or address, with separate budgets for reads, writes and expensive searches. A counter store, typically in memory shared across front-end servers, tracks use in a sliding or fixed window. Responses include remaining budget and reset time. Secondary limits catch bursts and concurrency that the hourly budget would not. The difficulty is fairness and precision across many servers: exact global counting is expensive, so approximations accept brief overshoot.",
    k: ["Strict global counters vs local approximate counters: global is exact and adds latency and a dependency; local is fast and lets a client exceed limits by the number of servers.", "Cost-weighted budgets vs per-request counts: weighting reflects real load and complicates client planning."],
    p: ["Limits keyed by address punish many users behind one shared network address while a single attacker rotates addresses.", "Counter store outage fails open and removes all protection exactly when load is high."],
    v: "Send requests at twice the allowed rate and confirm throttled responses carry a retry time that is accurate; then restart a front-end server mid-test and confirm the client's remaining budget is not reset.",
    dep: ["cache-layer","accounts-and-orgs","load-shedding"]
  },
  "api-versioning": {
    s: "The rules for changing public interfaces without breaking existing integrations: dated or numbered versions, deprecation notices and a long overlap period.",
    d: "Clients choose a version through a header or path, and the server routes to code that preserves that version's behavior. Changes are classified as additive, which ship to everyone, or breaking, which ship only in a new version. Deprecations are announced in responses and documentation with a removal date. The server must keep old versions running and tested, so each version adds permanent maintenance cost. Usage telemetry per version shows who would be broken by removal.",
    k: ["Date-based versions vs semantic numbers: dates make age obvious and give no hint of how large a change is; numbers signal size and tempt infrequent big breaks.", "Supporting old versions indefinitely vs scheduled removal: indefinite support protects integrators and accumulates code; removal needs communication and still breaks stragglers."],
    p: ["Adding a field that changes meaning, treated as additive, breaks clients that relied on its absence.", "Removing a version with no per-client usage data breaks a major customer's pipeline with no warning."],
    v: "Call the same endpoint under two versions and confirm each returns its documented shape; confirm a deprecated version's responses carry a notice and that usage by version is visible in telemetry before removal.",
    dep: ["observability-and-tracing"]
  },
  "code-search-index": {
    s: "A dedicated index over file contents across all repositories, supporting exact strings, regular expressions and language filters at interactive speed.",
    d: "An indexer reads blobs from the default branch, skips binaries and generated files, and builds a structure over substrings, commonly based on short character sequences, so a query narrows to candidate files before verification. The index is sharded across machines and replicated. Documents are keyed by content hash to avoid indexing identical files across forks. Queries must filter by what the viewer may see. It is hard because the data is enormous and each push changes only a little of it.",
    k: ["Indexing every branch vs only the default branch: all branches finds more and multiplies the index; the default branch keeps it manageable and misses work in progress.", "Substring-level indexes vs word-level: substring supports code-specific queries like punctuation and partial names at a heavy storage cost."],
    p: ["Results from private repositories appear to users who lost access, because permissions are checked at index time and not at query time.", "Indexing vendored or generated files fills the index with duplicates and pushes real matches off the first page."],
    v: "Push a file with a unique string, confirm a search finds it within the freshness target, then remove the viewer's access and confirm the result disappears from their next search.",
    dep: ["index-freshness-pipeline","object-database","repository-visibility","search-query-parser"]
  },
  "symbol-navigation": {
    s: "Jump-to-definition and find-references in the browser, built from parsed syntax trees of the repository rather than from text matching.",
    d: "A parser per language extracts definitions and references from each file and stores them in an index keyed by repository, commit and symbol. In the viewer, clicking a name queries for its definition in the same file, same repository or imported dependencies. Precise resolution needs build information and type analysis, so many systems use heuristic resolution and accept ambiguity. Indexes are computed per commit on the default branch and, optionally, for pull requests. The cost is parser coverage and the volume of references.",
    k: ["Heuristic name matching vs precise type-aware resolution: heuristics cover every language and are sometimes wrong; precise needs a build and works for few.", "Index at push time vs lazily on first click: push-time has instant navigation and heavy background work; lazy is cheap and slow on first use."],
    p: ["Showing a wrong definition with confidence is worse than showing none, and heuristics do this with common names.", "Language parsers run on untrusted source and need sandboxing and time limits against crashing inputs."],
    v: "Open a file, click a function name called in two places and confirm the definition and both references are found; switch to an older commit and confirm results match that commit's code.",
    dep: ["index-freshness-pipeline","object-database","file-viewer-and-blame"]
  },
  "issue-and-pr-search": {
    s: "Search over titles, bodies, comments, labels and metadata of issues and pull requests, with structured qualifiers such as author, state and date ranges.",
    d: "Documents are denormalized into a full-text engine with fields for each qualifier, updated by events as items change. Queries combine free text with filters that a parser translates into field constraints. Permission filtering is built in by indexing repository visibility and applying a membership filter at query time. The challenge is freshness and consistency: users expect a new comment to be searchable almost immediately, and counts shown on the page must agree with search results.",
    k: ["Search engine as the source of lists vs the database: engine lists are fast for complex filters and may lag writes; database lists are consistent and slow for text queries.", "Indexing on every edit vs batched updates: every edit is fresh and heavy on hot items; batching reduces load and shows stale text."],
    p: ["Issue counts on the repository page come from the database while the list comes from search, so they disagree after writes.", "Reindexing a large repository after a schema change takes days and blocks other updates unless throttled."],
    v: "Comment on an issue with a unique phrase and confirm search finds it within the freshness target; change the issue's state and confirm the state filter reflects it and the count matches the list.",
    dep: ["index-freshness-pipeline","search-query-parser","issue-model","repository-visibility"]
  },
  "search-query-parser": {
    s: "Turns what a user typed into a structured query: terms, quoted phrases, qualifiers, regular expressions and negations, then ranks results by relevance.",
    d: "A tokenizer and grammar handle quoting, operators and key-value qualifiers, falling back gracefully for malformed input. The parsed tree is compiled into index operations and a visibility filter. Ranking combines text match, recency, repository popularity and whether the match is in a definition rather than a comment. Regular expressions are restricted to forms that cannot blow up. The hard parts are explainability, since ranking surprises users, and defending against queries designed to be expensive.",
    k: ["Rich query language vs simple text box: a language serves experts and needs documentation and error handling; a plain box is approachable and cannot express precise intent.", "Popularity in ranking vs pure match quality: popularity surfaces canonical code and buries small relevant projects."],
    p: ["A catastrophic regular expression run against many shards consumes CPU across the whole cluster for minutes.", "Silently dropping an unparsable qualifier returns broad results that look like a successful narrow search."],
    v: "Run a query with a qualifier, a quoted phrase and a negation and confirm the parsed form is shown; submit a pathological regular expression and confirm it is rejected or times out within the budget without affecting other queries.",
    dep: ["load-shedding"]
  },
  "index-freshness-pipeline": {
    s: "The event-driven path that keeps search and navigation indexes current: detect a push or edit, fetch changed content, update the index and measure the lag.",
    d: "A push or metadata change emits an event that enqueues indexing work keyed by repository and commit. Workers compute which blobs are new by comparing trees, fetch only those, and update the index, deduplicating by content hash. Throttling prevents one busy repository from monopolizing workers. A lag metric compares the latest event time to the indexed time. Full reindexes for schema changes run in parallel to live updates and swap atomically. The difficulty is correctness under retries and reordering.",
    k: ["Incremental by tree diff vs full reindex per push: incremental is cheap per push and needs careful handling of lost or reordered events; full is simple and far too costly.", "Prioritizing recently active repositories vs first-come order: priority keeps hot repositories fresh and starves quiet ones."],
    p: ["A lost event leaves a repository permanently stale because nothing ever reconciles it with the actual refs.", "A force-push that removes files leaves deleted content searchable because the pipeline only adds."],
    v: "Push a change that adds one file and deletes another, and confirm the new file is searchable and the deleted file disappears within the lag target; confirm a lag metric exists and reflects the push.",
    dep: ["job-queue","object-database","hot-repository-detection"]
  },
  "accounts-and-orgs": {
    s: "The identity records for people, bots and organizations, including profile, emails, credentials, membership and the names that appear in every URL.",
    d: "Users and organizations share a namespace, so a name resolves to exactly one owner. Accounts have verified emails, two-factor settings and sessions. Organizations contain members and teams, with owners who can manage billing and policy. Renames and transfers must leave redirects, since names appear in clone URLs everywhere. The hard parts are namespace squatting, account takeover defenses, and the consequences of deletion, which affects repositories, forks and authorship records.",
    k: ["Shared namespace for users and organizations vs separate: shared gives short URLs and requires collision rules; separate avoids collisions and lengthens every address.", "Redirecting old names after rename vs freeing them: redirects keep links working and open takeover risk; freeing names prevents that and breaks links."],
    p: ["A released name is registered by an attacker and all old clone URLs and dependencies now resolve to their repository.", "Account deletion that removes commits' author links leaves history with unattributed or mislinked authors."],
    v: "Rename an account and confirm old repository URLs redirect and clone still works; attempt to register the old name and confirm refusal for a protection period.",
    dep: ["metadata-database","single-sign-on","audit-log"]
  },
  "teams-and-roles": {
    s: "The permission model: roles such as read, triage, write and admin granted to users and teams on repositories, with nested teams and inheritance.",
    d: "A permission check takes an actor, a repository and an action and returns allow or deny. Effective role is the highest among direct grants, team grants including parent teams, organization defaults and repository ownership. Roles map to actions through a fixed table. Custom roles let organizations compose actions. Evaluating this for every request and for lists of thousands of repositories needs precomputed membership and caching. The hard part is making the cached answer agree with the current grants.",
    k: ["Fixed roles vs custom roles: fixed roles are easy to explain and audit; custom roles fit real organizations and make permission reasoning harder.", "Computing on each request vs materializing effective permissions: computing is always current and slow in lists; materialized is fast and must be invalidated precisely."],
    p: ["Removing a user from a team does not invalidate cached effective permissions, so access persists for minutes or hours.", "Nested teams with cycles or deep chains make permission resolution slow or ambiguous."],
    v: "Grant a team write access, add a user, confirm they can push, then remove them and confirm a push is refused within the stated invalidation bound; check the change appears in the audit log.",
    dep: ["accounts-and-orgs","metadata-database","cache-layer"]
  },
  "repository-visibility": {
    s: "The setting that decides who can see a repository at all: public, internal to an organization, or private to listed members, enforced on every read path.",
    d: "Visibility is checked in the web layer, API, repository protocol, search indexes, notifications, feeds and package downloads, which is why it is the most frequent source of leaks. Changing visibility has side effects: forks of a private repository stay private, making a public repository private can detach its fork network, and caches and indexes must be purged. Enforcement is centralized in one function where possible, but denormalized copies of visibility in indexes must be updated by events.",
    k: ["Central permission function vs checks scattered per feature: central is auditable and becomes a performance hot spot; scattered is fast and drifts.", "Denormalizing visibility into indexes vs joining at query time: denormalizing is fast and can be stale; joining is current and costly."],
    p: ["A feature built later forgets the visibility check and exposes private titles through a new endpoint.", "Switching to private leaves old data in a search index and public caches for hours."],
    v: "Make a public repository private and confirm within the stated bound that anonymous clone, web, API, search, feed and package requests all fail, using a test that exercises each path.",
    dep: ["teams-and-roles","metadata-database","index-freshness-pipeline","cache-layer"]
  },
  "branch-protection": {
    s: "Rules attached to branches or tags that forbid direct pushes, force-pushes or deletion, and require reviews, checks, signatures or linear history before changes land.",
    d: "Rules match refs by name pattern and are evaluated in two places: in the pull request merge path for friendly messages, and in the receive path at push time, where they are authoritative. Rulesets generalize this to many repositories, with bypass lists for specific roles. Evaluation needs the pushed commits, for example to verify signatures, so it runs after objects arrive and before the ref moves. The difficulty is consistency between the two enforcement points.",
    k: ["Enforcement at push time vs at merge time only: push time is authoritative and costly; merge-time is cheap and misses direct pushes entirely.", "Organization-wide rulesets vs per-repository rules: central rules enforce policy uniformly and slow local exceptions; local rules are flexible and inconsistent."],
    p: ["Admins who can bypass rules push directly in a hurry and nobody notices because bypass is not logged prominently.", "Pattern rules that overlap produce surprising precedence, leaving a branch unprotected that everyone thought was covered."],
    v: "Protect a branch, attempt a direct push, a force-push, and a deletion, and confirm each is rejected with the rule's name in the message; confirm a pull request with passing checks and review can still merge.",
    dep: ["teams-and-roles","pre-receive-hooks","signed-commit-verification","audit-log"]
  },
  "code-owners": {
    s: "A file in the repository mapping paths to people or teams who must review changes to them, turning ownership into an enforced review requirement.",
    d: "The rules file lists path patterns and owners. When a pull request changes files, the forge computes which rules match, using the last matching pattern for each file, and requests review from those owners. Branch rules can require approval from an owner. The file is read from the target branch, not the proposal, so authors cannot edit their own gate. Evaluation must be fast over large changes and robust to invalid owners, such as people who left or teams without write access.",
    k: ["Reading ownership from the target branch vs the proposal: the target branch cannot be edited by the author and delays ownership changes until merged; the proposal is convenient and bypassable.", "Last-match-wins patterns vs all matching rules: last-match is easy to reason about and hides broader owners; all-match is thorough and noisy."],
    p: ["An owner entry for a person who left makes required review impossible and blocks every pull request touching those files.", "A malformed rule file silently disables the requirement instead of failing loudly."],
    v: "Change a file owned by a team and confirm the team is requested and merging is blocked until one member approves; change the rules file in the same proposal and confirm the old rules still apply.",
    dep: ["teams-and-roles","branch-protection","object-database"]
  },
  "ssh-and-deploy-keys": {
    s: "Public keys that authenticate people and machines over the SSH protocol, including per-repository deploy keys that grant read or write to a single project.",
    d: "Users upload public keys; the SSH endpoint looks up the presented key by fingerprint to find the account or deploy key and its permissions. Keys have types and minimum strengths, optional expiry, and can be restricted by network. Deploy keys belong to one repository and not to a person, so they survive staff changes but need clear ownership. Lookups happen on every connection, so they must be fast with millions of keys and are cached carefully.",
    k: ["Per-user keys vs deploy keys for automation: user keys give attribution and break when the person leaves; deploy keys are stable and tied to one repository.", "Looking up by fingerprint in the database vs reading authorized key files: the database scales and centralizes audit; files are simple and need syncing."],
    p: ["The same key uploaded to two accounts makes authentication ambiguous and attributes actions to the wrong one.", "Write-enabled deploy keys copied into many build systems cannot be rotated without finding each copy."],
    v: "Add a key, clone over SSH and confirm the connection resolves to the right account; delete the key and confirm the next connection is refused; add a read-only deploy key and confirm push fails.",
    dep: ["accounts-and-orgs","ssh-endpoint","metadata-database","audit-log"]
  },
  "single-sign-on": {
    s: "Authenticates members through the organization's identity provider using standard protocols, and can provision, update and remove accounts automatically.",
    d: "The forge acts as a service provider: it redirects the user to the identity provider, receives a signed assertion, maps its attributes to an account and organization membership, and starts a session. Provisioning protocols create and disable accounts and sync group membership into teams. For repository access over HTTP and SSH, which cannot follow redirects, credentials must be separately authorized, often with tokens or keys that the identity provider approves per organization. The hard parts are session lifetime and deprovisioning.",
    k: ["Just-in-time account creation vs pre-provisioning: just-in-time is simple and gives no way to disable accounts before the user returns; provisioning keeps lifecycle in sync and requires more setup.", "Authorizing tokens and keys per SSO session vs trusting them forever: per-session closes a gap and burdens automation."],
    p: ["An employee removed in the identity provider keeps access through an old token or key that was never tied to the SSO session.", "Attribute mapping by mutable email addresses lets a user take over another's account when emails are reused."],
    v: "Disable a user in the identity provider and confirm that within the stated bound their web session ends and their previously authorized token and key are refused for the organization's repositories.",
    dep: ["accounts-and-orgs","teams-and-roles","access-tokens","ssh-and-deploy-keys"]
  },
  "audit-log": {
    s: "An append-only record of security-relevant actions such as permission changes, token creation, repository deletion and visibility changes, searchable and exportable.",
    d: "Each event records actor, action, target, time, source address and relevant before and after values. Events are emitted by the code paths that perform the action, written through a reliable queue to an append-only store, indexed for search and streamable to external systems. Repository operations such as clones and pushes are far higher volume and logged separately or optionally. The difficulty is completeness and trust: any code path that forgets to emit leaves a gap, and the log itself must resist tampering.",
    k: ["Emitting from application code vs capturing at the database layer: application events carry intent and are easy to forget; database capture is complete and lacks meaning.", "Synchronous writes vs queued: synchronous guarantees the record exists before the action completes and adds latency and failure coupling; queued is fast and can lose events in a crash."],
    p: ["A newly added admin action ships without an audit event and nobody notices until an incident investigation.", "Retention shorter than the incident detection time means the evidence is gone when it is needed."],
    v: "Perform one change of each audited kind and confirm each appears with actor, address and before and after values; stream to an external collector and confirm the same events arrive.",
    dep: ["job-queue","blob-object-store","metadata-database"]
  },
  "secret-scanning": {
    s: "Detects credentials committed to repositories or pasted into comments, by pattern and by checking with the issuing provider, and can block pushes that contain them.",
    d: "Scanners run on pushes, comments and historical content using patterns for known token formats and entropy heuristics for generic ones. Partner providers can be notified so they revoke leaked tokens automatically. Push protection runs inside the receive path and rejects a push that contains a match, letting the user bypass with a reason. Historical scans process all objects of a repository, which is costly. The hard part is precision: false positives train people to bypass, and false negatives leave real leaks.",
    k: ["Blocking at push time vs scanning after the fact: blocking prevents the leak and adds latency to every push; after-the-fact is fast and the secret is already in history and in clones.", "Provider-verified detections vs generic patterns: verified finds are high precision for known formats; generic patterns catch more and flood with noise."],
    p: ["Removing the secret in a later commit leaves it in history, and clones and forks keep it; only revocation fixes it.", "Scanning binary or encoded content misses base64-wrapped credentials."],
    v: "Push a commit containing a test token in a known format and confirm the push is rejected naming the secret type and file; push with a recorded bypass and confirm an alert is created and an audit event written.",
    dep: ["pre-receive-hooks","pack-generation","audit-log","job-queue"]
  },
  "signed-commit-verification": {
    s: "Checks cryptographic signatures on commits and tags against keys registered to accounts, and marks them verified or unverified in views and rules.",
    d: "When a commit or tag object carries a signature, the forge extracts the signed payload and signature, determines the key type, and checks the signature against keys uploaded by the claimed author or committer, including expiry and revocation. Results are cached by object id. Web-made commits are signed by the forge itself with a platform key. Branch rules can require verified signatures. The hard parts are key lifecycle, because rotated or expired keys change verdicts, and the meaning of verified, which only says the key belongs to the account.",
    k: ["Verifying at push time and storing the result vs on view: push time gives a fixed record and cannot see later revocation; on view is current and recomputes constantly.", "Forge-signed web commits vs unsigned: signing shows provenance for web edits and makes the platform key a high-value target."],
    p: ["A verified badge is read as trust in the code when it only says the account's key signed it.", "Squash and rebase merges rewrite commits and drop the author's signature, so the final history appears unsigned."],
    v: "Push a commit signed with a registered key and confirm verified; remove the key from the account and confirm the badge changes on the next recomputation; push one signed with an unregistered key and confirm unverified.",
    dep: ["accounts-and-orgs","object-database","cache-layer"]
  },
  "abuse-and-spam-controls": {
    s: "Defenses against spam accounts, malicious repositories, content-policy violations and resource abuse, combining rate limits, reputation signals, reports and moderation tools.",
    d: "Signals include account age, verification, behavior patterns such as creating hundreds of repositories, and content classifiers. Actions range from friction like a challenge, through limits on mentions and notifications, to hiding content and suspending accounts. Reports flow to a moderation queue with tools for takedown and restoration. Compute abuse such as using hosted builds for mining is a separate area. The hard problem is the adversary adapts, and false positives can lock out real contributors.",
    k: ["Automated enforcement vs human review: automation reacts at scale and makes visible mistakes; human review is accurate and slow.", "Shadow limits vs visible blocks: hidden limits slow attackers from learning rules and confuse legitimate users who cannot tell why nothing works."],
    p: ["A new-account restriction that is too strict blocks genuine first-time contributors from opening their first issue.", "Takedown tooling that deletes rather than hides makes wrongful removals impossible to undo."],
    v: "Simulate an account that creates two hundred repositories and mentions a thousand users in an hour and confirm friction triggers, notifications are suppressed and the account appears in the moderation queue.",
    dep: ["api-rate-limiting","metadata-database","audit-log","job-queue"]
  },
  "data-retention-and-export": {
    s: "Policies and tools for how long data is kept, how it is deleted on request, and how a user or organization can export their repositories and metadata.",
    d: "Retention rules cover logs, deleted repositories, old attachments and backups, each with its own duration. Deleting a repository goes through a soft-delete stage that allows restore, then a purge that removes objects, metadata, search entries, caches and replicas. Export produces an archive of repositories and metadata in documented formats. Legal holds suspend purging. The hard part is completeness: data lives in many stores and backups, and deletion must reach all of them.",
    k: ["Soft delete with a grace period vs immediate purge: grace allows recovery from mistakes and delays real deletion obligations; immediate purge is final.", "Export of full metadata vs repository contents only: full export supports migration and is large and complex to keep correct."],
    p: ["A deleted repository remains in a search index, a cache or a backup and is later restored or exposed by accident.", "An export that omits comments or attachments is used for a migration and the data is lost for good."],
    v: "Delete a repository, restore it within the grace period and confirm everything returns; delete and let the purge run, then confirm its objects, search entries and cached pages are gone from every store.",
    dep: ["backup-and-restore","metadata-database","blob-object-store","audit-log"]
  },
});
