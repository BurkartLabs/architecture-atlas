// Details for the BI & dashboard plate, part 1: cross-cutting concerns, embedding, scheduled reports and alerts.
ATLAS.details("bi-dashboards", {
  "metric-consistency": {
    s: "The decision to define each business number once and compile every chart, export and answer from that definition, so two screens never disagree about the same metric.",
    d: "Inconsistency enters wherever a calculation is retyped: in a saved question, a spreadsheet export, a calculated field or a natural language answer. Consistency needs one definition store, a rule that every query path compiles through it, and a way to see which charts use which definition. The hard part is organizational as much as technical, because the people who need a number this week will fork the logic rather than wait for the owner of the definition to change it.",
    k: ["Central definitions vs local calculations: central gives one answer everywhere, but a slow review queue pushes authors toward private copies that quietly drift.", "Strict compiled-only access vs raw SQL escape hatch: strictness protects numbers, but without an escape hatch power users export data and rebuild the logic elsewhere."],
    p: ["Two dashboards both titled revenue use different date fields, and the gap is found by a customer.", "A calculated field copied from a definition is not updated when the definition changes."],
    v: "Pick one governed metric and request it from a dashboard, an export, the metric API and a typed question for the same filters. All four return identical values, and changing the definition changes all four.",
    dep: ["metric-definitions", "semantic-model-definition", "dependency-and-impact-tracking"]
  },
  "freshness-vs-cost": {
    s: "The decision about how old a displayed number may be, traded against query cost, source load and interactive speed, made per dataset rather than for the whole tool.",
    d: "Every layer can serve data older than the source: result caches, extracts, pre-aggregated tables and scheduled snapshots. Each needs a stated maximum age and a way to show it on screen. Fresh data costs a source query per view, and with many viewers the cost multiplies. The decision is also visible to users, who interpret a stale number as a wrong number unless the age is displayed next to it.",
    k: ["Time-based expiry vs event-driven invalidation: time rules are simple and bound staleness, but event-driven refresh gives fresher data only if the pipeline can signal reliably.", "Live queries vs extracts: live is always current but slow and costly under load, while extracts are fast and cheap but add a refresh job to operate."],
    p: ["A cache hides a pipeline failure: the dashboard keeps showing yesterday's numbers with no warning.", "A refresh scheduled at the same minute as the source load job reads half-loaded tables."],
    v: "Update one source row, then watch each surface. Every dashboard shows its last-refreshed time, changes within its stated maximum age, and the age shown matches the source load time, not the cache write time.",
    dep: ["result-cache", "extracts-and-materialization", "cache-invalidation"]
  },
  "security-propagation": {
    s: "The decision about whose identity and permissions apply at each hop, from viewer to application to cache to source database, so a user never sees rows they could not query directly.",
    d: "A user's identity must survive the whole path. Options include running every query as one service account and filtering in the tool, running as the user through impersonation, or injecting filter predicates compiled from the user's attributes. Caches add a second trap: a stored result is only safe to reuse for someone whose permissions would produce the same result. Exports, alerts and embedded views each take a different path through these choices.",
    k: ["Service account with tool-side filters vs per-user source credentials: a shared account pools connections well, but the tool becomes the only barrier, while per-user credentials reuse source rules at higher connection cost.", "Permission-aware cache keys vs per-user caches: sharing among equivalent users saves queries, but key mistakes leak data across users."],
    p: ["A scheduled report runs as its owner and mails a full-access table to a distribution list.", "A cached result computed for an administrator is served to a restricted user."],
    v: "Open the same dashboard as two users with different row rules, directly from a cold and a warm cache, and export it. Each user sees only their rows in all three cases, and the source log shows the expected identity or predicate.",
    dep: ["row-level-security", "query-impersonation", "cache-key-derivation"]
  },
  "multi-tenancy": {
    s: "The decision about how customers or business units sharing one installation are kept apart in content, data access, caches, schedules and resource use.",
    d: "Tenancy can be a separate installation per tenant, a shared installation with a tenant column on every metadata row, or a shared installation over per-tenant source databases. The choice shapes the permission model, the cache keys, the quotas and the upgrade process. Embedded analytics usually needs many tenants with identical dashboards but different data, which makes templated content and tenant-scoped data rules central instead of optional.",
    k: ["Installation per tenant vs shared installation: separate installs isolate failures and data strongly but multiply upgrades, while shared installs are cheap but one noisy tenant affects all.", "Tenant filter in generated queries vs separate source schemas: filters need one schema and rely on the compiler never omitting them, while separate schemas make leaks structurally harder at the cost of provisioning."],
    p: ["A new query path forgets the tenant predicate, and one customer sees another's totals.", "One tenant's large scheduled export saturates the shared worker pool for everyone."],
    v: "Create two tenants with an overlapping dashboard and distinct data. Query each through every path (page, export, alert, embed, typed question) and confirm no row, cache entry or metadata name from one tenant appears in the other.",
    dep: ["tenant-isolation", "embedded-tenant-mapping", "row-level-security"]
  },
  "scale-and-concurrency": {
    s: "The decision about what the tool does when data grows tenfold or a hundred people open the same dashboard at once: limits, queues, pre-aggregation and graceful degradation.",
    d: "Cost grows along three axes: rows scanned per query, queries per dashboard view, and viewers per minute. Each has its own remedy: pre-aggregation and pushdown for rows, tile scheduling and coalescing for queries per view, and caches and queues for concurrency. Without limits, an accidental cross join or an unfiltered export runs until the source is slow for everyone, so limits and cancellation have to be designed in, not added after an incident.",
    k: ["Pushing work to the source vs pulling rows into the tool: pushdown scales with the source engine, while pulling is flexible for joins across sources but limited by tool memory.", "Rejecting expensive queries vs queueing them: rejection protects interactive users with a visible error, while queueing completes more work but can hide minute-long waits."],
    p: ["A Monday-morning dashboard opening by hundreds of users sends hundreds of identical queries at once.", "Row limits applied after the source has computed everything save memory but not source cost."],
    v: "Load test one dashboard with a hundred simultaneous viewers on a cold cache. The source sees one query per distinct tile, p95 page time stays within target, and a deliberately huge query is stopped by the guard with a readable message.",
    dep: ["query-coalescing", "query-limits-and-cost-guard", "async-query-queue", "query-pushdown"]
  },
  "trust-and-lineage": {
    s: "The decision to record where every number comes from and who vouches for it, so readers can tell certified content from experiments and authors can see what a change breaks.",
    d: "Trust needs three things: a lineage graph from source columns through definitions to charts, visible certification status on content, and usage data that shows what is actually relied on. Without them, hundreds of near-duplicate dashboards accumulate and nobody knows which to believe. Lineage must be computed from the same definitions the compiler uses, not drawn by hand, or it drifts from reality as soon as someone edits a field.",
    k: ["Computed lineage vs documented lineage: computed stays correct but only sees what the tool parses, while documentation covers external steps but goes stale.", "Open creation vs gated publishing: open creation encourages exploration, while gating raises quality at the cost of a review bottleneck."],
    p: ["A source column is renamed and forty dashboards break silently because no one could list its dependents.", "Certified badges are granted once and never reviewed, so they stop meaning anything."],
    v: "Rename one source column in a test environment and ask the tool for its dependents. It lists every definition, chart and alert that uses the column, and each has an owner and a certification state.",
    dep: ["dependency-and-impact-tracking", "glossary-and-certification", "usage-analytics"]
  },

  "signed-embed-tokens": {
    s: "Short-lived signed tokens that tell the BI tool who the embedded viewer is and which content and data rules apply, issued by the host application's backend.",
    d: "The host server signs a payload containing a user or tenant identifier, the permitted dashboard or question, attribute values for row rules, and an expiry. The BI tool verifies the signature with a shared secret or public key, then builds a session scoped to that payload. Parameters in the payload can lock filters so the viewer cannot change them. The difficulty is that the browser sees the token, so scope and lifetime must be tight, and filters must be enforced server-side.",
    k: ["Shared-secret signing vs public-key signing: shared secrets are simple, but every verifier also holds signing power, while public keys let the BI tool verify without being able to mint tokens.", "Locked parameters in the token vs parameters in the URL: locked values cannot be tampered with, but each change of scope needs a fresh token from the host."],
    p: ["Long expiry times let a leaked link keep working for days.", "Row-rule values placed in a plain URL parameter instead of the signed payload are editable by the viewer."],
    v: "Open an embedded dashboard with a valid token, then alter one character of the payload, replace the tenant value and replay it after expiry. The first works, and the other three are rejected with an authorization error.",
    dep: ["authentication-and-sso", "row-level-security", "embedded-tenant-mapping"]
  },
  "iframe-and-web-component": {
    s: "The simplest embedding surface: the dashboard served inside a frame or custom element on the host page, with message passing for size, events and filter changes.",
    d: "The BI tool serves a chrome-free view at an embed URL, and the host page includes it in a frame or wraps it in a custom element. A messaging channel between the two carries resize requests, load events, click events and requests to change filters. Isolation is good because the frame is a separate origin, but styling, navigation and single sign-on across origins are limited by browser rules on cookies in third-party contexts.",
    k: ["Frame vs web component: a frame gives strong isolation with limited styling, while a component integrates visually but shares the page's scripting environment.", "Cookie-based session in the frame vs token in the URL: cookies hide credentials but are blocked in many cross-site settings, while tokens work everywhere but leak into logs and history."],
    p: ["The frame's height is fixed, so content is clipped or shows double scrollbars on small screens.", "Message handlers accept any origin, so another page can drive the embedded dashboard."],
    v: "Embed a dashboard in a page on a different origin in a current browser with third-party cookie blocking on. The dashboard loads, resizes to its content, and a filter change sent from the host updates the charts.",
    dep: ["signed-embed-tokens", "theming-and-white-label", "application-api"]
  },
  "embedding-sdk": {
    s: "A client library that renders charts and dashboards as native components of the host application, fetching data through the tool's API instead of loading a full page.",
    d: "The SDK exposes components for a dashboard, a single question and sometimes the explorer, plus hooks for events and parameter changes. It authenticates with a signed token, calls the tool's query API, and draws charts in the host's own page, inheriting its styles and routing. It avoids frame limitations but couples the host to the SDK version, and every host build must track API changes. It is hard to keep behavior identical with the standalone app.",
    k: ["Native components vs frame: components feel integrated and are fast to interact with, but ship client code that must be versioned and can diverge from the tool's UI.", "Thin client vs rich client: a thin client keeps logic in the server, while a rich client can do more offline but duplicates formatting and aggregation code."],
    p: ["Host and SDK upgrade at different times, and a removed field in the query API breaks every embedded chart.", "Bundle size grows with the chart library and slows the host's first load."],
    v: "Mount a dashboard component in a test host application, then upgrade the tool by one minor version without rebuilding the host. The component still renders, receives the same data and emits its click events.",
    dep: ["application-api", "signed-embed-tokens", "chart-type-library"]
  },
  "theming-and-white-label": {
    s: "Configuration that makes the tool match a host product or customer brand: colors, fonts, logos, chart palettes, labels and removal of the vendor's own branding.",
    d: "Themes are stored as named token sets applied to the chrome, charts and exported files. A tenant can have its own theme, selected at login or from the embed token. Charts need palette and font settings applied inside the rendering library, and exports must pick up the same theme in the headless renderer. The difficulty is coverage: every surface, including error pages, emails and exported files, needs to honor the theme or the seams show.",
    k: ["Token-based themes vs custom stylesheets: tokens are safe across upgrades but limited, while custom CSS reaches everything and breaks when markup changes.", "Per-tenant theme at login vs at embed time: login-time is simple, while embed-time supports one tenant showing different brands by context."],
    p: ["Scheduled emails go out with the default branding because the renderer never loaded the tenant theme.", "A theme with low-contrast colors passes brand review but fails accessibility checks."],
    v: "Apply a distinct theme to a test tenant, then view a dashboard, an exported image and a scheduled email for it. All three show the tenant's colors, fonts and logo with no default branding.",
    dep: ["color-and-palettes", "headless-renderer", "configuration-and-feature-flags"]
  },
  "public-and-share-links": {
    s: "Links that give access to a single dashboard or chart outside normal login, either to anyone with the URL or to named recipients, with expiry and revocation.",
    d: "A link carries an unguessable identifier mapped to a resource, a permission scope and optionally an expiry and password. Public links render a snapshot of data, or live data under the link creator's authority. The tool must decide whose data rules apply to anonymous viewers, usually the creator's or a dedicated restricted role. The core risk is exposure: links are pasted into chats and slides, and are then valid wherever they travel.",
    k: ["Live public links vs static snapshots: live links stay current but expose the data source to the open internet's load, while snapshots are safe to publish but go stale.", "Creator's permissions vs a restricted public role: creator's rights are simple but over-share, while a restricted role needs deliberate setup per dataset."],
    p: ["A link created for an internal demo remains valid for years and is indexed by a search crawler.", "Revoking the dashboard does not revoke old share links that point to its charts."],
    v: "Create a link with a one-day expiry, open it in a logged-out browser, confirm it shows only the intended content, then revoke it and confirm the same URL now returns an access error within the cache window.",
    dep: ["content-permissions", "audit-log", "result-cache"]
  },
  "embedded-tenant-mapping": {
    s: "The mapping from the host application's customers and users to tenants, groups and data attributes in the BI tool, kept in sync as the host's accounts change.",
    d: "Embedded deployments have thousands of external users that should not be created by hand. The host asserts a tenant and attributes in each token, and the tool creates or updates a lightweight identity on the fly, or the host synchronizes accounts through an API. Tenants map to groups, workspaces or row-rule attribute values. Complexity comes from lifecycle: customers leave, merge or split, and orphaned identities and content have to be cleaned up.",
    k: ["Just-in-time identities vs synchronized accounts: just-in-time needs no provisioning code but cannot list or deactivate users ahead of time, while synchronization gives control at the price of a sync job.", "One workspace per tenant vs shared content with attribute rules: workspaces isolate content clearly but multiply dashboards, while shared content updates once for everyone."],
    p: ["A customer is renamed in the host, creating a second tenant with duplicated saved content.", "Departed customers' identities stay active, still counting against licenses and appearing in audits."],
    v: "Onboard a new tenant in the host and open an embedded dashboard for it with no manual setup in the BI tool. Then deactivate the tenant and confirm further tokens for it are refused and its content is removed or archived.",
    dep: ["user-and-group-model", "row-level-security", "application-api"]
  },

  "report-scheduler": {
    s: "The service that runs saved reports and dashboards at defined times or intervals and hands the results to the renderer and delivery channels.",
    d: "Schedules are stored with a cron-like rule, a time zone, a target resource, parameter values and recipients. A leader or distributed lock picks due jobs and places them on the job queue. Each run queries as a defined identity, renders output, delivers it and records status. Hard parts are time zones and daylight saving changes, missed runs after downtime, and avoiding hundreds of reports firing at 8:00 and overloading the source.",
    k: ["Fixed-time firing vs jittered windows: exact times match expectations, while spreading runs over a window smooths load but delivers some reports a few minutes late.", "Run-as owner vs run-as recipient: owner identity is simple but can over-share, while per-recipient runs respect each person's data rules at the cost of many more queries."],
    p: ["After an outage, every missed schedule fires at once and stampedes the source.", "A schedule expressed in a user's local time shifts an hour in spring and sends a day-early report."],
    v: "Create a daily schedule in a time zone with daylight saving, stop the scheduler across one run, restart it, and confirm exactly one catch-up delivery with a correct timestamp, a success record and no duplicate.",
    dep: ["job-queue-and-workers", "headless-renderer", "delivery-channels", "query-impersonation"]
  },
  "headless-renderer": {
    s: "A background browser or drawing engine that loads a dashboard exactly as a user sees it and captures it as an image or document for delivery.",
    d: "To guarantee that exports match the screen, many tools load the real dashboard page in a headless browser with a service token, wait until all tiles report loaded, then capture the page as an image or paged document. Resource use is high, because each capture needs a browser process and all of the dashboard's queries. Difficulties are knowing when rendering has finished, page breaks in long dashboards, fonts and locales missing on the server, and timeouts when queries are slow.",
    k: ["Browser capture vs separate server-side drawing: capture matches the screen exactly but is heavy and fragile, while server-side drawing is light but must reimplement every chart type.", "Wait for load signal vs fixed delay: a signal is accurate if every tile reports reliably, while a delay is simple but either wastes time or captures half-loaded charts."],
    p: ["A captured image shows spinners because one slow tile missed the timeout.", "A missing font on the render host replaces non-Latin text with empty boxes."],
    v: "Export a dashboard with twenty tiles including a slow one, and compare it side by side with the on-screen view. Every tile is fully loaded, text and numbers match, and a deliberately failing tile produces a clear error instead of a blank area.",
    dep: ["dashboard-layout-engine", "tile-load-scheduler", "job-queue-and-workers", "accessibility-rendering"]
  },
  "export-formats": {
    s: "The set of file outputs the tool can produce from a result or a page: delimited text, spreadsheets, images, paged documents and raw data through an API.",
    d: "Exports fall into two kinds: appearance (images and paged documents captured from the rendered page) and data (delimited files, spreadsheets, structured text) generated from the query result. Data exports must apply the same filters and permissions as the screen and format numbers consistently or leave them raw. Large exports are streamed in chunks rather than held in memory. The hard parts are row limits, spreadsheet cell limits, character encoding and formula injection through cell contents.",
    k: ["Formatted vs raw values: formatted values look like the dashboard but cannot be reliably re-aggregated, while raw values suit analysis but surprise readers with unrounded numbers.", "Streaming vs in-memory export: streaming handles millions of rows with flat memory, but gives no total count or final validation before delivery."],
    p: ["Cell values beginning with an equals sign are treated as formulas and run on a recipient's machine.", "A silent row cap truncates the export, and readers assume it is complete."],
    v: "Export a result with more rows than the display limit, containing text starting with an equals sign and non-Latin characters. The file has every row, text cells are neutralized, characters read correctly, and a footer or log states the row count.",
    dep: ["headless-renderer", "number-and-date-formatting", "data-permissions", "result-post-processing"]
  },
  "delivery-channels": {
    s: "The outbound paths that carry scheduled outputs and alerts to people: mail, chat messages, webhooks and file drops, each with its own size and format limits.",
    d: "Each channel has an adapter that takes a rendered artifact or a message and sends it with retries. Mail needs attachments or links, chat needs short text and an image, webhooks need a structured payload, and file drops need a naming scheme. Credentials for gateways live in the secret store. Failures are common and mostly outside the tool: bounced addresses, size limits and rate limits, so delivery status must be tracked per recipient and surfaced to the owner.",
    k: ["Attachment vs link: attachments are convenient but bypass access control once sent, while links keep permissions enforced but need the reader to sign in.", "At-least-once with retries vs at-most-once: retries avoid missed reports but can send duplicates, while single attempts avoid duplicates but lose messages on transient errors."],
    p: ["A bounced address is retried daily forever, and the sender domain's reputation drops.", "Large attachments exceed the mail gateway limit, so the report silently never arrives."],
    v: "Schedule one report to a mail address, a chat channel and a webhook receiver with an induced transient failure on one. Each channel shows a delivery record, the failed one retries and then succeeds, and no duplicates arrive.",
    dep: ["export-formats", "job-queue-and-workers", "credential-storage", "subscription-management"]
  },
  "alert-rule-definitions": {
    s: "Saved conditions on a metric or query result that should notify someone: a threshold, a change from the last value, a missing delivery or an anomaly.",
    d: "A rule references a governed metric or saved question, filters, a condition, a check frequency, a notification target and a suppression policy. Conditions range from fixed thresholds to comparisons with the same period last week, to statistical bands. Rules should reference metric definitions rather than copy SQL, so they follow definition changes. The hard part is usefulness: too sensitive and people ignore them, too loose and they miss the event.",
    k: ["Static thresholds vs adaptive baselines: thresholds are explainable but ignore seasonality, while baselines adapt but are harder to trust and tune.", "Rule on a metric vs rule on a raw query: metric rules stay consistent with dashboards, while raw queries are flexible but break silently when tables change."],
    p: ["A rule on a daily metric is checked hourly and fires on partial-day values every morning.", "A rule's owner leaves, and the notification target is a deactivated mailbox."],
    v: "Create a rule on a governed metric, then change the underlying data so it crosses the threshold. A notification arrives with the value, the threshold, a link to the chart and a rule owner, and an unchanged re-check sends nothing new.",
    dep: ["metric-definitions", "saved-questions", "subscription-management"]
  },
  "alert-evaluator": {
    s: "The background job that runs alert queries on schedule, compares results with conditions, tracks state and decides when to notify, repeat or resolve.",
    d: "The evaluator executes each rule's query at its interval through the normal query path, applying a defined identity. It keeps a state per rule, such as ok, firing or resolved, so it notifies on transitions instead of on every check. Debounce windows, minimum durations and grouping across related rules reduce noise. It must also detect that a check itself failed, since a failed query is not the same as an ok result and should not silently resolve an alert.",
    k: ["Notify on transitions vs notify on every breach: transitions keep inboxes quiet, but a person who missed the first message gets no reminder unless repeats are configured.", "Evaluate through the cache vs bypass it: the cache saves source load, but alerts then respond only as fast as the cache refreshes."],
    p: ["A source outage makes checks fail, the evaluator treats them as no data, and a real incident auto-resolves.", "Hundreds of rules at the same interval run together and overload the source."],
    v: "Drive a rule through ok, firing, still firing and resolved with controlled data, then break the source connection. Notifications arrive only on the transitions plus the configured repeat, and the broken connection raises a distinct check-failed notice.",
    dep: ["alert-rule-definitions", "async-query-queue", "delivery-channels", "query-impersonation"]
  },
  "subscription-management": {
    s: "The records and screens that say who receives which report or alert, with per-person preferences, recipient permissions, unsubscribe and ownership transfer.",
    d: "A subscription links a person, group or external address to a schedule or alert, with format, channel and filter overrides. Recipients are resolved at send time, so group membership changes take effect. The system must check that the recipient may see the content, or run per-recipient data rules, and offer unsubscribe that works without login for external addresses. Housekeeping matters: orphaned subscriptions to deleted dashboards and to former employees pile up and continue to cost queries.",
    k: ["Resolve recipients at send time vs at creation: send-time resolution follows group changes, but a removed person's access ends silently with no review of what they received.", "Per-recipient filtered runs vs one run for all: per-recipient runs respect each person's data, but cost one query and render per recipient."],
    p: ["Reports keep going to a former employee's forwarding address long after the account is disabled.", "A subscription to a deleted dashboard keeps firing and errors every day without anyone owning it."],
    v: "Subscribe a group to a report, add one person and remove another, then deactivate one account. The next send reaches exactly the current active members, each sees only data they are allowed to see, and unsubscribe from the message works.",
    dep: ["user-and-group-model", "content-permissions", "report-scheduler"]
  },
});
