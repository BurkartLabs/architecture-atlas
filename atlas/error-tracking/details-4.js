// Details for the error tracking plate, part 4: issue lifecycle, alerting, integrations.
ATLAS.details("error-tracking", {
  "issue-states": {
    s: "The set of states an issue moves through, such as unresolved, resolved, ignored and archived, with the events and rules that cause each transition.",
    d: "An issue starts unresolved when its first event arrives. People resolve it, ignore it, or the system does so by rule. Each state defines behavior: whether new events reopen it, whether it appears in default lists, and whether it can alert. Transitions are recorded with who or what caused them. The model is small by design, because every state multiplies the cases in alerting, search and regressions. The pitfall is states that mean different things to different teams.",
    k: ["Few states with rules attached vs many fine-grained states: few states are easy to learn and query, but teams needing a workflow must use an external tracker.", "Reopening automatically on new events vs staying closed until a person acts: automatic keeps the list honest, but flaps when fixes are partially deployed."],
    p: ["Resolving an issue with no release information reopens it every time an old client reports it.", "Bulk-resolving hides issues that still have affected users."],
    v: "Walk an issue through each state by person and by rule, and confirm after each transition that default lists, search filters and alerts behave as specified and the history lists who or what changed it.",
    dep: ["issue-store"]
  },
  "resolution-rules": {
    s: "Rules that resolve issues without a person, such as resolving in a given release, or after a period with no new events.",
    d: "Resolve-in-next-release records the intended fix and resolves the issue when a later release is registered, and the regression logic reopens it if it returns. Auto-resolve closes issues that have not occurred for a configured number of days, keeping lists small. Linked trackers can resolve an issue when their ticket closes, and commit messages can reference an issue to resolve it on release. The difficulty is that no event might mean fixed or might mean the users who hit it left.",
    k: ["Auto-resolve after inactivity vs manual only: auto keeps lists small and honest, but rare errors on a seasonal path close and reopen repeatedly.", "Resolve-in-release vs resolve now: tied to a release it reopens only if the fix fails, while resolving now reopens on any straggling client."],
    p: ["A short auto-resolve period closes weekly-job failures between runs and reopens them as new noise.", "Resolution by commit message references the wrong issue when identifiers are mistyped."],
    v: "Mark an issue resolved in the next release, register that release, send an event from it, and confirm the issue resolved on registration and reopened as a regression on the event.",
    dep: ["issue-states", "release-registration", "regression-detection"]
  },
  "ignore-snooze": {
    s: "Silencing an issue permanently, for a time, or until it exceeds a threshold of events or users, while still collecting its events.",
    d: "Not every error is worth fixing now. Ignoring marks the issue so it does not alert or appear in default views. Snoozing adds a condition: for a duration, until it recurs more than a number of times, or until it affects more than a number of users. The system still stores events, evaluates the condition on arrival and wakes the issue when it is met. Data kept silently can still count against quota, so persistent noise is better filtered at ingest.",
    k: ["Ignoring but storing vs dropping at ingest: storing allows a later review and thresholds, but costs quota, while dropping saves cost and loses the data.", "Time-based snooze vs threshold-based: time is simple, but a threshold wakes only when the problem grows."],
    p: ["Ignored issues keep consuming quota, so a loud ignored error still exhausts the plan.", "Snooze conditions evaluated on delayed counters wake issues late."],
    v: "Snooze an issue until it affects ten users, send events from nine and then ten users, and confirm no alert until the tenth, when the issue wakes and notifies.",
    dep: ["issue-states", "rollup-counters"]
  },
  "assignment": {
    s: "Assigning an issue to a person or team so there is one accountable owner, with automatic assignment from rules and suspects.",
    d: "Each issue has an optional assignee, either an individual or a team. Assignment sends a notification, appears in filtered lists and can be set manually, by ownership rules when the issue is created, or from suspect commit authors. Assigned issues anchor workflow: stale assigned issues can be reported. Assignment changes are logged in the activity feed. The difficulty is that people leave and teams reorganize, so assignment to a person who is gone ends up as nobody's responsibility.",
    k: ["Assigning to a team vs to a person: a team survives staff changes, but gives no single accountable owner.", "Automatic assignment from rules vs manual triage: automatic is fast and consistent, but wrong rules route issues to the wrong team repeatedly."],
    p: ["Issues assigned to departed users sit unseen.", "Automatic assignment that fires on every regrouping reassigns an issue someone already owned."],
    v: "Create an issue matching an ownership rule and confirm it is assigned to the rule's team with a notification, then reassign manually and confirm the rule does not override the manual choice.",
    dep: ["ownership-rules", "issue-states", "permissions"]
  },
  "ownership-rules": {
    s: "A mapping from file paths, modules, URLs or tags to owning teams or people, used to assign and route issues automatically.",
    d: "Rules look like a pattern and an owner: anything under a path belongs to a team, any URL matching a pattern to another. They are written by hand or derived from the repository's ownership file. When an issue is created, the service matches its frames, tags and URLs against the rules in order and sets the owner. Matching must be fast and predictable, with clear tie-breaking. Rules go stale as code moves, so unowned or wrongly owned issues are a measure of rule quality.",
    k: ["Hand-written rules vs synced from the repository's ownership file: written rules are flexible and drift, while synced rules stay current but only reflect code paths.", "First match wins vs all matches notified: first match gives one clear owner, while all matches inform more people at the cost of diffused responsibility."],
    p: ["A catch-all rule listed first sends everything to one team.", "Paths renamed in a refactor make rules match nothing, and issues become unowned silently."],
    v: "Define rules for two paths and a catch-all, raise errors from frames in each, and confirm each issue gets the expected owner, and an error in no listed path falls to the catch-all or stays unassigned as specified.",
    dep: ["in-app-detection", "code-host-integration"]
  },
  "triage-priority": {
    s: "A computed score or label that orders issues by how urgent they are, from frequency, affected users, recency, severity and whether they are new.",
    d: "Teams cannot read every issue, so the service ranks them. Inputs include event rate and trend, distinct users, whether the error is handled or fatal, level, and whether it is new in a release. A simple weighted formula is predictable, while a learned model can capture patterns but is harder to explain. Priority also drives alert routing. The challenge is calibration: a score that rates everything high is useless, and users must trust that the top of the list deserves attention.",
    k: ["A transparent formula vs a learned model: a formula is predictable and debuggable, but misses subtle patterns, while a model adapts and is hard to explain.", "Ranking by event count vs by users affected: users reflect impact, but events find loops and hot paths."],
    p: ["Ranking only by count puts one looping user's error above a failure that blocks checkout for thousands.", "Scores that change constantly reorder the list while someone is reading it."],
    v: "Create a looping error from one user, a rare error from a thousand users and a new fatal error, and confirm the ranking places the fatal and the wide-impact issues above the loop, and the order is stable across refreshes.",
    dep: ["rollup-counters", "issue-states"]
  },
  "issue-activity": {
    s: "A chronological record on each issue of state changes, assignments, comments, links and regressions, showing who did what and when.",
    d: "Each issue keeps a feed: first seen, resolved by a person in a release, reopened as a regression, assigned, linked to a ticket, commented on. It supports handoff between people and review afterward, and feeds the audit log for sensitive changes. Comments can mention people, triggering notifications. Entries are small and append-only. The design question is what is worth recording: too little loses accountability, too much buries the signal.",
    k: ["Recording system changes alongside human ones vs human only: both give a complete story, but system entries such as regroupings can crowd out comments.", "Immutable entries vs editable comments: immutable gives trustworthy history, while edits allow fixing mistakes and need an edit history."],
    p: ["Automatic events recorded at high frequency bury the few human comments.", "Comments that quote event data copy personal information into a store with different retention."],
    v: "Perform a resolve, a regression, an assignment and a comment with a mention, and confirm the feed lists each in order with actor and time, and the mentioned user receives one notification.",
    dep: ["issue-states", "assignment"]
  },
  "alert-rules": {
    s: "User-defined conditions over issues or metrics, with filters and actions, that decide when the service interrupts someone.",
    d: "A rule has triggers, such as a new issue, a regression or a count exceeding a threshold, filters such as environment or tags, and actions such as notify a team or call a webhook. Rules are evaluated as events are processed, for issue-based triggers, or on a schedule for metric thresholds. They are scoped to projects and owned by teams. The difficulty is that rules multiply: dozens of overlapping rules for one issue produce duplicate pages, and nobody knows which rule paged them.",
    k: ["Event-time evaluation vs scheduled evaluation: event-time is immediate for new issues, while scheduled is needed for rates over windows but delays alerts by the interval.", "Many narrow rules vs few broad rules: narrow rules route precisely, but are laborious to maintain and overlap."],
    p: ["Overlapping rules each send a message for the same incident.", "A rule with no environment filter pages the on-call engineer for errors from staging."],
    v: "Create a rule for new production issues, trigger a new issue in production and in staging, and confirm exactly one notification for the production one, naming the rule that fired.",
    dep: ["new-issue-triggers", "threshold-alerts", "notification-routing"]
  },
  "new-issue-triggers": {
    s: "Rule triggers fired when an issue is first created or when a resolved issue regresses, the most direct signal that a deploy introduced a problem.",
    d: "The group assignment step reports whether an event created a new issue or reopened one. The alert engine then evaluates matching rules and filters, such as level or tag, and sends notifications. It runs inline with processing, so it must be fast and must not delay storing. The main challenge is volume: a bad release can create hundreds of new issues within a minute, each separately alerting, so rate limits and digests are needed.",
    k: ["Alerting on every new issue vs only above a frequency: every new issue is fast and complete, but noisy, while a frequency condition waits and misses one-off severe errors.", "Evaluating inline vs from a separate stream: inline is immediate, while a separate stream isolates failures in alerting from processing."],
    p: ["A deploy that creates two hundred new issues pages the team two hundred times.", "Alerting on new issues from a version still being tested floods the channel."],
    v: "Deploy a build that creates ten new issues in one minute and confirm the first alert arrives within seconds, the rest are batched according to throttling, and none is lost.",
    dep: ["group-assignment", "alert-throttling"]
  },
  "threshold-alerts": {
    s: "Alerts on a measured quantity crossing a limit, such as error rate, users affected or crash-free percentage, evaluated over time windows.",
    d: "A scheduled evaluator queries the aggregates for a metric over a window, compares it to a threshold, and moves the alert between healthy, warning and critical with resolution notices. Thresholds can be absolute, relative to the previous period, or based on anomaly detection from historical seasonality. Evaluation frequency and window length define sensitivity. The difficulty is flapping around the threshold, low-traffic periods where a single error is a large percentage, and data delay that makes the alert late.",
    k: ["Absolute thresholds vs anomaly-based: absolute are explainable and predictable, while anomaly-based adapt to daily patterns but alert on things nobody can explain.", "Short windows vs long: short windows detect fast and are noisy, while long windows are stable and slow."],
    p: ["A rate threshold at low traffic fires on one error and resolves a minute later, repeatedly.", "Evaluating against aggregates that lag by minutes makes alerts late exactly during incidents."],
    v: "Raise the error rate above the threshold for five minutes and back down, and confirm one critical notification within the evaluation interval and one resolved notice, with no flapping at the boundary.",
    dep: ["rollup-counters", "alert-rules"]
  },
  "alert-throttling": {
    s: "Limits that stop one rule or issue from sending repeated notifications, such as once per period per issue, with a global cap per destination.",
    d: "Each notification checks a throttle keyed by rule and issue, and sometimes destination: if one was sent within the interval, it is suppressed or folded into a digest. Throttle state lives in a fast shared store with expiry. Caps per channel protect people from floods. Suppressed notifications should remain visible as counts, so the interval's total is not lost. The challenge is choosing intervals: too long delays knowledge of a worsening problem, too short repeats noise.",
    k: ["Throttle per issue vs per rule: per issue keeps each problem visible, but a mass of new issues is not reduced, while per rule bounds the total.", "Hard suppression vs summarized suppression: hard suppression is simple, but hides how large the problem became, while a summary reports the count."],
    p: ["Suppressing without escalation means a growing outage is reported only once.", "Throttle state lost on restart sends a burst of repeated alerts."],
    v: "Fire one rule one hundred times in a minute with a five-minute throttle, and confirm one notification is delivered, the rest are counted, and the next interval carries a note on how many were suppressed.",
    dep: ["alert-rules"]
  },
  "notification-routing": {
    s: "Choosing recipients and channels for an alert, from the rule's targets, issue owners and each person's own notification settings, and delivering reliably.",
    d: "A fired alert resolves its targets: a team, the issue owner, suspected authors or specific people. For each recipient it consults preferences about channel, such as email, chat or push, and quiet hours, then renders a message with the key facts and a link, and sends through the channel's integration. Delivery results are tracked and retried. It is hard because each channel has its own rate limits and failure modes, and because a notification the person never sees is the same as no alert.",
    k: ["Respecting personal preferences vs forcing the rule's channel: preferences reduce fatigue, but critical alerts may never reach a person who muted them.", "Retrying failed deliveries vs failing over to another channel: retries fix transient errors, while failover reaches the person when a channel is down."],
    p: ["A chat integration with an expired token drops every alert without anyone noticing.", "Notifying all members of a large team for a minor error teaches them to ignore alerts."],
    v: "Fire an alert to a team with mixed preferences and one broken channel, and confirm each person receives it on their chosen channel, the failed delivery is retried and surfaced, and a delivery log records outcomes.",
    dep: ["chat-integration", "permissions", "ownership-rules"]
  },
  "digest-batching": {
    s: "Combining many notifications into one periodic summary, such as a daily list of new issues or a burst collapsed into a single message.",
    d: "Not everything needs an immediate interruption. Low-urgency alerts are collected into a window and sent as one message listing issues with counts and trends, and bursts from deploys are folded in the same way. The batching service stores pending items per recipient, flushes by schedule or when a size limit is reached, and renders a compact summary. The trade-off is delay: a digest is read later, so urgent items must bypass it.",
    k: ["Scheduled digest vs flush on volume: scheduled is predictable for readers, while volume-based limits the size of any single message.", "Digest everything low-priority vs per-rule opt-in: opt-in avoids surprising delays, while default digests cut noise for teams that never configure."],
    p: ["A severe issue classified as low priority waits hours inside a digest.", "A digest that grows to hundreds of items is as ignored as the individual alerts were."],
    v: "Produce fifty low-priority issue alerts in an hour and one critical one, and confirm the critical one is delivered immediately and the fifty arrive in a single digest at the scheduled time with correct counts.",
    dep: ["alert-throttling", "notification-routing"]
  },
  "issue-tracker-link": {
    s: "Creating or linking a ticket in a work tracker from an issue, and syncing status and assignee so the two records agree.",
    d: "From an issue, a person creates a ticket pre-filled with the title, a link and key details, or links an existing one. The integration stores the reference and may sync state: closing the ticket resolves the issue, and a regression reopens the ticket or comments on it. Authentication to the tracker uses delegated tokens that can expire. Two-way sync is hard: field mappings differ between trackers, loops of updates can occur, and conflicts need a rule.",
    k: ["Two-way sync vs one-way link: two-way keeps states aligned, but needs conflict handling and loop prevention, while a link is robust and shows no state.", "Creating tickets automatically vs on demand: automatic ensures nothing is missed, but fills the tracker with duplicates of the same underlying cause."],
    p: ["An expired token makes sync stop silently, and statuses drift apart.", "Reopening a ticket on each regression event creates a loop of reopen and close."],
    v: "Create a ticket from an issue, close the ticket and confirm the issue resolves, trigger a regression and confirm the ticket is reopened once, not repeatedly.",
    dep: ["issue-states", "permissions"]
  },
  "chat-integration": {
    s: "Posting alerts to chat channels with action buttons, and letting people resolve, ignore or assign from within the chat.",
    d: "An app installed in the workspace receives alert messages rendered with title, counts, a link and buttons. Button actions call back into the service with a signed request, updating the issue. Link previews can unfurl issue links when pasted. The service must verify each callback's signature and map the chat user to a user in the service. It is hard because of chat rate limits during bursts, expired installations, and permissions: a person in a public channel may not have access to the issue.",
    k: ["Actions in chat vs links only: actions are fast, but need identity mapping and careful authorization, while links are simple and safe.", "Posting issue details in the message vs a minimal summary: details save a click, but expose error content to everyone in a channel."],
    p: ["Error messages containing personal data posted into a wide channel disclose it to people without access to the project.", "Unverified callbacks let anyone with the URL change issues."],
    v: "Post an alert to a channel, press resolve as a mapped user and as an unmapped one, and confirm the first resolves the issue and records the actor, while the second is refused, and forged callbacks are rejected.",
    dep: ["permissions"]
  },
  "code-host-integration": {
    s: "A connection to the source repository host giving the service commits, file contents and blame, and linking stack frames to the exact line of source.",
    d: "An installed app with read access lets the service fetch commits for a release, ownership files, and file contents at a given revision. Stack frames then link to the source line at the release's commit, and the issue page can show source context where symbolication did not embed it. Pull request descriptions can mention issues and resolve them on merge. The costs are permissions, which must be limited to read, API rate limits that bound blame lookups, and mapping from frame paths to repository paths.",
    k: ["Read-only app access to repositories vs per-user tokens: app access is stable and shared, while per-user tokens limit what each person sees but expire.", "Fetching source on demand vs storing copies: on demand avoids retaining customer code, but is slow and depends on the host's availability."],
    p: ["Path mapping errors link frames to the wrong file or a 404.", "Broad repository permissions give a monitoring tool access to private code beyond what it needs."],
    v: "Open an issue from a release, click a frame, and confirm it opens the host at the correct file and line for that release's commit, and that a repository outside the grant is not accessible.",
    dep: ["permissions"]
  },
  "webhooks": {
    s: "Outgoing HTTP calls to a customer's URL on events such as issue created, resolved or assigned, signed so the receiver can verify them.",
    d: "Subscribers register a URL and event types. When the event occurs, the service posts a JSON body with a signature header computed from a shared secret, retries failures with backoff and disables endpoints that fail for a long time. Deliveries are asynchronous and may arrive more than once or out of order, so receivers must be idempotent. Webhooks allow custom automation without a dedicated integration, but also point the service at arbitrary URLs, which needs protection against calls into internal networks.",
    k: ["At-least-once with retries vs best effort: retries ensure delivery to flaky receivers, but duplicates must be tolerated.", "Disabling failing endpoints vs retrying forever: disabling protects the sender, but silently stops automation unless the owner is told."],
    p: ["Allowing arbitrary destination URLs enables requests to internal services, so address ranges must be blocked.", "A slow receiver holding connections open exhausts the delivery workers."],
    v: "Register an endpoint, create and resolve an issue, and confirm both deliveries arrive with valid signatures; make the endpoint fail and confirm retries with backoff, then disable with a notice; and confirm an internal address is refused.",
    dep: ["permissions"]
  },
  "oncall-integration": {
    s: "Sending critical alerts to an on-call paging system and keeping the incident state in step with the issue.",
    d: "Critical rules trigger an incident in the paging service, using a deduplication key from the issue so repeated events update one incident instead of creating many. When the issue is resolved or the metric recovers, the integration resolves the incident. Routing and escalation schedules live in the paging system. The service's responsibility is to be reliable and to send enough context to act on. It also needs its own failure path: if the integration fails, the paging goes silent.",
    k: ["Deduplication key per issue vs per event: per issue makes one incident per problem, but a recurring problem after resolution needs a new one.", "Paging on any issue vs only on rules marked critical: restricting prevents fatigue, but requires teams to classify carefully."],
    p: ["No deduplication key creates a separate page for every occurrence.", "Failure to resolve incidents automatically leaves pages open after the problem ends."],
    v: "Trigger a critical alert twice, confirm one incident with updated counts, resolve the issue and confirm the incident closes, then break the integration and confirm a delivery failure is raised through another channel.",
    dep: ["alert-rules", "notification-routing"]
  },
  "permissions": {
    s: "The model of organizations, teams, projects and roles that decides who can see events, change issues, manage settings and use tokens.",
    d: "Users belong to an organization and to teams; teams are granted access to projects with a role such as member, contributor or admin. Every interface and API request is checked against it, and tokens carry scopes. Single sign-on and directory sync map identity-provider groups to teams. Fine-grained rules matter because events can contain sensitive data: access to a project means access to its error content. The difficulty is that checks are everywhere, and one missed check is a data leak.",
    k: ["Team-based project access vs per-user grants: teams scale and match organizations, but make exceptions awkward.", "Central authorization layer vs checks at each endpoint: central is consistent and auditable, while per-endpoint is flexible and easy to forget."],
    p: ["A new endpoint written without a permission check exposes data across projects.", "Directory sync that lags leaves a departed employee with access to production error content."],
    v: "For every endpoint, call it with a user who has no access to the target project and confirm refusal; remove a user from the identity provider group and confirm access ends within the sync interval.",
    dep: ["issue-store"]
  },
  "audit-log": {
    s: "A tamper-evident record of administrative and sensitive actions, such as permission changes, token creation, setting changes and data access, with who and when.",
    d: "Actions that change who can see or do what, or that alter data handling, are written to an append-only log with the actor, target, timestamp and source address. Organization owners can view and export it, and it feeds compliance reviews and incident investigation. It is stored separately from event data and kept for a long, fixed period. The difficulty is deciding what counts as sensitive and doing so consistently, since an action missing from the log cannot be audited later.",
    k: ["Logging only changes vs also reads of sensitive data: changes are small and focused, while read logging answers who looked at what, at far higher volume.", "Append-only in the same database vs a separate store: the same database is simple, while a separate store resists tampering by those with application access."],
    p: ["An action path added later without logging creates a blind spot.", "Logs that include the changed values copy secrets such as tokens into the log."],
    v: "Change a role, create a token and change a scrubbing rule, and confirm three entries with actor, target and time, that none contains the token value, and that entries cannot be altered through the interface.",
    dep: ["permissions"]
  }
});
