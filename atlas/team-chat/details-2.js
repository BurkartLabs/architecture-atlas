// Details for the team chat plate, part 2: integrations, real-time delivery, presence.
ATLAS.details("team-chat", {
  "app-directory": {
    s: "A catalog of installable apps with descriptions, requested permissions and review status, from which admins and members add integrations to a workspace.",
    d: "Developers submit an app with a manifest listing its scopes, event subscriptions, endpoints and branding. A review process checks security, behavior and policy compliance before public listing. Workspaces can also install private or internal apps. Admins can restrict installation to an approved list or require approval for each request. The directory shows what an app can read and write in plain language. It is hard because the platform is vouching for third-party code whose behavior can change after approval.",
    k: ["Review before listing vs open publishing: review reduces malicious apps and builds trust, but slows developers and cannot see behavior that changes server-side later.", "Admin-approved installs only vs member self-service: approval controls risk, but turns admins into a bottleneck and encourages shadow integrations."],
    p: ["An approved app that later widens its behavior or changes ownership keeps its trust without re-review.", "Permission descriptions that are too technical lead admins to approve scopes they do not understand."],
    v: "Submit a test app requesting broad scopes; the directory must show them in plain terms, an admin policy must block installation until approved, and a revoked app must stop working in every workspace.",
    dep: ["oauth-install", "app-permissions-model"]
  },
  "oauth-install": {
    s: "The authorization flow that lets an admin or member grant an app a defined set of scopes and issues it credentials tied to that workspace.",
    d: "The installer is redirected to a consent screen listing scopes, approves, and the platform returns a short-lived code that the app exchanges for access tokens. Tokens are scoped to a workspace and either a bot identity or a specific user. Refresh and rotation limit the damage of leaks. Uninstalling or revoking invalidates tokens, signing keys and subscriptions. Enterprise policies can restrict which scopes may be granted. The difficulty is the lifecycle: token leaks, rotation, transfers of app ownership and apps installed by someone who has since left.",
    k: ["Short-lived rotating tokens vs long-lived tokens: rotation limits leak impact, but breaks simple integrations and demands retry logic.", "Bot-scoped tokens vs user-impersonating tokens: bot tokens are auditable and bounded, while user tokens act with the person's full access."],
    p: ["Tokens that stay valid after the installing user is deactivated leave an unmonitored path into the workspace.", "Granting scopes at install time with no later review lets apps accumulate access nobody remembers approving."],
    v: "Install a test app, call the API with its token, then uninstall; the next call must fail with a clear error, and every event subscription and webhook of that app must stop.",
    dep: ["app-permissions-model", "sessions"]
  },
  "incoming-webhooks": {
    s: "A secret URL that lets an external system post a message into a specific channel with a simple HTTP request, without a full app or user account.",
    d: "Creating a webhook binds a random URL to one channel and a display identity. A POST with a JSON body is validated, rendered into a message with optional rich blocks, and sent through the normal send path with the webhook's identity. There is no reading or acting back. Because the URL is the credential, it must be treated as a secret and revocable. Rate limits and payload size caps protect the channel. Many monitoring and CI tools use this as their only integration point.",
    k: ["URL as the credential vs signed requests with an app token: the URL is trivially easy to set up, but is leaked by logs and copy-paste and cannot be scoped finely.", "Fixed channel binding vs choose the channel per post: fixed binding limits damage if leaked, while choosing needs real scopes and authentication."],
    p: ["A webhook URL committed to a public code repository lets anyone post into the company channel.", "A misconfigured alert loop posts thousands of messages a minute and buries real conversation."],
    v: "Send a POST to a new webhook and see the message appear in the bound channel with the bot identity; revoke the webhook and confirm the same URL then returns an error and posts nothing.",
    dep: ["send-path", "app-rate-limits", "channels"]
  },
  "events-api": {
    s: "Delivers workspace events, such as new messages in channels an app can see, to an app's endpoint or socket, with signing, retries and ordering caveats.",
    d: "An app subscribes to event types in its manifest. The platform filters each event by the app's scopes and channel access, then sends it to an HTTPS endpoint with a signature and timestamp or over a socket the app opens. Endpoints must acknowledge quickly; slow or failing ones are retried with backoff and eventually disabled. Delivery is at least once and not strictly ordered, so apps must deduplicate by event ID. Challenge-response verification proves endpoint ownership. Large installs generate high event rates that need per-app throttling.",
    k: ["Push to the app's HTTP endpoint vs app-initiated socket: HTTP is simple to host but needs a public endpoint; sockets work behind firewalls but add connection management.", "At-least-once with retries vs best effort: retries prevent silent loss, but apps must be idempotent and may see old events late."],
    p: ["An app that does heavy work before acknowledging times out, is retried, and processes each event several times.", "Verifying requests without checking the timestamp lets old captured requests be replayed against an app."],
    v: "Subscribe a test app, post messages, kill its endpoint for a minute and restore it; every event arrives at least once with valid signatures, and duplicates share event IDs.",
    dep: ["subscriptions", "job-queue", "app-permissions-model"]
  },
  "slash-commands": {
    s: "Messages beginning with a slash that are routed to an app, which responds immediately or later, privately to the user or visibly to the channel.",
    d: "An app registers command names. When a user submits one, the platform sends the app a signed request containing the text, user, channel and a short-lived response URL, expecting an acknowledgment within a few seconds. The app can reply in-line, post later through the response URL, or open a modal. Commands are not stored as normal messages unless the app posts the result. Name collisions between apps are resolved by workspace configuration. The difficulty is the hard acknowledgment deadline and handling long-running work.",
    k: ["Synchronous response within seconds vs asynchronous with a callback URL: the deadline keeps the interface snappy, but forces apps to acknowledge early and finish later.", "Per-app command namespaces vs global names: global names are short and memorable, but collide; namespacing is safe but verbose."],
    p: ["A command that works in the invoking channel but runs with the app's broad access can expose data the user could not see.", "Typing a command by mistake in a public channel can leak the arguments to everyone if echoed."],
    v: "Run a command that takes ten seconds: the user sees an immediate acknowledgment, then the real result arrives via the callback, and a user without access to a channel cannot make the app read it through the command.",
    dep: ["bot-users", "interactive-components", "app-rate-limits"]
  },
  "bot-users": {
    s: "Non-human identities that can read and post messages, be mentioned, and join channels, with their own tokens and clearly labeled in the interface.",
    d: "A bot is a user-like record owned by an app, with a name, avatar, token and a set of scopes. It joins channels by invitation or by scope, receives events for those channels, and posts through the same send path as people, subject to the same rate limits and posting rules. Bots are marked so users and policy engines can distinguish them. They are excluded from member counts in some places and included in audit logs. The danger is a bot accumulating access and being invited into sensitive channels without scrutiny.",
    k: ["Bots as a distinct identity type vs ordinary users with a flag: a distinct type allows tailored rules and rate limits, but every feature must then consider both.", "Bots join only by invitation vs by scope: invitation keeps channel owners in control, while scope-based access is convenient and risky."],
    p: ["A bot added to a private channel can post that content elsewhere or exfiltrate it through its own backend.", "Treating bot messages as human in notification rules makes noisy bots trigger alerts."],
    v: "Invite a bot into one channel and confirm it receives and can post only there, shows a bot label, is rate limited, and that every action it takes appears in the audit log with the app's identity.",
    dep: ["oauth-install", "channel-permissions", "audit-log"]
  },
  "interactive-components": {
    s: "Buttons, menus, forms and modals that apps attach to messages or open on demand, whose clicks and submissions return to the app as signed interaction events.",
    d: "Apps send messages built from structured blocks, including actions. When a user clicks, the platform sends the app an interaction payload with the action, the user and a response token, and expects a fast acknowledgment. The app can update the message, open a modal, or post follow-ups. Payload validation, state size limits and trigger tokens that expire shortly protect against abuse. Because the same message is visible to many people, apps must check who clicked, not who the message was intended for.",
    k: ["Stateless messages with state encoded in action values vs app-side state: encoded state needs no storage but is size-limited and visible to the client; server state is flexible and must be cleaned up.", "Updating the original message vs posting new ones: updates keep channels tidy, while new posts keep a visible audit of what happened."],
    p: ["An approval button that trusts the message instead of the clicking user lets anyone in the channel approve.", "Interaction tokens reused after expiry allow replay of old actions."],
    v: "Post an approval message, click as an unauthorized user and an authorized user; only the second succeeds, the message updates for everyone, and a replay of the first interaction payload is rejected.",
    dep: ["events-api", "app-permissions-model", "rich-text-rendering"]
  },
  "workflow-automation": {
    s: "A no-code builder for rules that react to triggers, such as a form or a new member, and perform steps like posting, routing and collecting responses.",
    d: "A workflow is a graph of a trigger and ordered steps, stored per workspace and run by a workflow engine on events or schedules. Steps call platform actions and approved apps, collect form input, and branch on answers. Executions must be durable: a run interrupted by a deploy resumes. Workflows run with a defined identity and permissions, usually the creator's or a service identity, which raises authorization questions. Limits on steps, frequency and loops protect the platform from runaway automation.",
    k: ["Run as the creator vs as a dedicated workflow identity: creator identity is simple but breaks when the person leaves; dedicated identity is stable but needs its own permission model.", "Durable execution with persisted state vs in-memory runs: durable runs survive failures and long waits, at the cost of a state store and versioning of running workflows."],
    p: ["A workflow that triggers on its own output loops and floods a channel until a rate limit stops it.", "Editing a workflow while runs are in flight changes behavior mid-run unless versions are pinned."],
    v: "Build a workflow that welcomes new members with a form and a follow-up in two days; restart the engine in between, and confirm each member gets exactly one welcome and one follow-up.",
    dep: ["job-queue", "bot-users", "events-api"]
  },
  "app-rate-limits": {
    s: "Per-app and per-method limits on API calls and message posting, communicated through headers and retry-after values, protecting the platform from runaway or abusive integrations.",
    d: "Each API method has a tier with a requests-per-minute budget, applied per app per workspace, with extra rules for posting to a single channel (about one message a second). Exceeding returns an error with a retry delay. Limits differ for bulk or read-heavy methods and for apps with special agreements. Good clients honor the delay and add jitter. The aim is fairness: one noisy installation must not slow others, and one tenant must not starve another.",
    k: ["Per-app per-workspace buckets vs global per-app: per-workspace limits isolate tenants, but an app in thousands of workspaces multiplies total load.", "Hard rejection vs queueing excess requests: rejection protects capacity and is predictable, while queueing is friendlier but hides overload and consumes memory."],
    p: ["Clients that retry immediately on a limit error synchronize and make the overload worse.", "A limit set for human-speed apps blocks legitimate bulk migrations and imports."],
    v: "Drive a test app at twice its limit; responses switch to rate-limited with retry delays, a well-behaved client's throughput settles at the limit, and another app in the same workspace is unaffected.",
    dep: ["rate-limiter", "bot-users"]
  },
  "edge-balancers": {
    s: "The first hop for client connections and API calls: terminates TLS, routes to the right region or cell, and spreads load across connection gateways.",
    d: "Balancers sit at the edge, accept long-lived connections, and choose a backend by workspace, region and health. For persistent connections they must drain gracefully during deploys, moving clients without a stampede of reconnects. They enforce coarse limits, block abusive sources and offer stickiness where a protocol needs it. Because workspaces live in specific cells, routing consults a map from workspace to cell, cached and updated when tenants move. Misrouting does not corrupt data but creates latency and failed requests.",
    k: ["Route by workspace to a cell vs random balancing: workspace routing keeps data and connections together and limits blast radius, but needs a routing table and migration handling.", "Terminate connections at the edge vs pass through: edge termination simplifies certificates and protection, but concentrates sensitive traffic at a shared tier."],
    p: ["A deploy that closes all connections at once makes every client reconnect simultaneously and overloads the gateways.", "A stale workspace-to-cell map sends users to a cell that no longer holds their data."],
    v: "Roll a gateway deployment under load and watch reconnect rates: connections drain gradually, no client sees an error beyond a brief reconnect, and requests for a moved workspace are redirected correctly.",
    dep: ["cells", "connection-gateways"]
  },
  "connection-gateways": {
    s: "Servers that hold millions of open client connections, authenticate them, and relay events between clients and the rest of the platform.",
    d: "Each gateway process manages a large number of persistent connections using event-driven I/O, keeping small per-connection state: user, device, subscriptions, last sequence sent. Business logic stays elsewhere; gateways validate, subscribe and forward. They are stateful, so capacity planning is about memory per connection and events per second per core. Slow clients must not hold memory forever, so outbound queues are bounded and overflow causes a disconnect and resync. Deploys require draining, since connection state is lost on restart.",
    k: ["Stateful gateways holding subscriptions vs stateless frontends with an external session store: stateful is faster and simpler per event, but restarts force reconnects.", "Bounded outbound queues vs unbounded: bounded queues protect memory against slow clients, but a disconnect-and-resync is the cost of overflow."],
    p: ["A single slow client with an unbounded queue consumes gigabytes and takes the gateway down with its neighbors.", "A restart of a heavily loaded gateway triggers reconnect storms to others that cascade into failure."],
    v: "Open one hundred thousand synthetic connections on one gateway, stall a few of them, and confirm memory stays bounded, stalled clients are cut, and healthy ones keep receiving events with normal latency.",
    dep: ["session-handshake", "subscriptions", "heartbeat-liveness"]
  },
  "session-handshake": {
    s: "The exchange that opens a real-time connection: authenticates the client, negotiates protocol and features, reports the last sequence it saw, and returns initial state.",
    d: "The client connects with a token, states its protocol version and capabilities, and sends its resume position if it has one. The server validates the token, checks the device and workspace, registers subscriptions for the user's channels, and replies with either a resume acknowledgment or a signal to refetch state. Capability negotiation lets old and new clients coexist. The handshake is on the reconnect hot path, so it must be cheap, and it must reject revoked sessions promptly.",
    k: ["Token in the connection request vs in a first message: first-message auth keeps tokens out of logs and URLs, but briefly allows unauthenticated sockets that need tight timeouts.", "Server-chosen subscriptions vs client-requested: server-chosen is safer and simpler for clients, but heavy for users in thousands of channels."],
    p: ["Putting tokens in the connection URL writes them to proxy logs.", "A handshake that does heavy initial-state loading makes mass reconnects far more expensive than steady state."],
    v: "Connect with a valid, an expired and a revoked token: only the first succeeds; reconnect with a resume position and confirm the reply says whether to replay or refetch, with no duplicate events.",
    dep: ["sessions", "subscriptions", "event-sequencing"]
  },
  "heartbeat-liveness": {
    s: "Periodic ping and pong messages that detect dead connections quickly, keep idle connections open through intermediaries, and measure latency.",
    d: "Either side sends a ping at an interval and expects a reply; missing several closes the connection. Mobile networks and corporate proxies silently drop idle connections, so without heartbeats the server believes a vanished client is online. Intervals trade battery and traffic against detection speed, and often adapt to the network and app state. The same signal feeds presence and tells the client to switch to a fallback path. At millions of connections even a modest ping rate is a serious load.",
    k: ["Short intervals vs long intervals: short ones detect failures fast but cost battery and gateway CPU; long ones let dead clients linger as phantom online users.", "Application-level pings vs transport-level keepalives: application pings prove the whole path works, while transport keepalives are cheaper but miss stalled processes."],
    p: ["Synchronized heartbeat timers across clients create periodic load spikes every interval.", "Presence tied directly to missed heartbeats flaps people offline during brief network blips."],
    v: "Block a connected client's network without closing the socket; the server must mark the connection dead within the configured number of missed intervals and release its subscriptions.",
    dep: ["connection-gateways", "presence-service"]
  },
  "subscriptions": {
    s: "The registry mapping each connection to the channels, threads and users whose events it should receive, kept consistent with membership and permissions.",
    d: "When a connection opens, it is subscribed to the user's channels; membership changes add or remove subscriptions immediately. The registry lets the fanout layer answer who is listening to this channel on which gateways. It is stored distributed and partly in gateway memory. Public channels the user can view but has not joined may be subscribed on demand. Correctness is a security matter, since a stale subscription delivers content to someone who lost access, so removal must be fast and certain.",
    k: ["Subscribe to every membership on connect vs on demand as channels are opened: subscribing to everything gives live unread updates, but costs memory for users in thousands of channels.", "Central registry vs gateway-local only: a central view makes targeted fanout possible, but must be updated on every connect, disconnect and membership change."],
    p: ["A removal that updates the database but not the gateway subscription keeps leaking events for the life of the connection.", "A registry that lags gateway restarts sends events to gateways that no longer hold the connection."],
    v: "Add a user to a channel and confirm events arrive without reconnecting; remove them and confirm events stop within the target seconds, including on a second device and after a gateway restart.",
    dep: ["membership", "connection-gateways", "permission-evaluator"]
  },
  "event-fanout": {
    s: "Delivers each new event to every connection subscribed to the relevant channel, across many gateways, within a fraction of a second.",
    d: "After a message is committed, an event goes onto a bus keyed by channel or workspace. Fanout workers look up which gateways hold subscribers and forward the event once per gateway, which then writes to each local connection. Sending one copy per gateway rather than one per subscriber keeps cross-network traffic bounded. Event types differ in importance: messages must not be lost, typing can be dropped. The challenge is large channels, where one event reaches hundreds of thousands of connections and ordering must hold for each.",
    k: ["Publish to a bus per channel vs push directly to gateways: a bus decouples and buffers, but adds a hop and its own capacity limits.", "Per-gateway batching vs immediate delivery: batching saves syscalls and bandwidth under load, but adds a few milliseconds of delay."],
    p: ["A fanout worker slower than the event rate lets a backlog grow until messages appear minutes late.", "Sending events to disconnected gateways wastes bandwidth and hides the failure."],
    v: "Post into a channel with fifty thousand connected test clients and record the delivery latency distribution: median and ninety-ninth percentile within targets, and every client receives the event exactly once in order.",
    dep: ["subscriptions", "event-sequencing", "big-channel-fanout"]
  },
  "event-sequencing": {
    s: "Per-channel or per-user sequence numbers attached to events so clients can detect gaps, discard duplicates and apply updates in the right order.",
    d: "Each event carries a monotonically increasing position within its stream, assigned at commit. A client tracks the last position per stream; if it sees a jump, it knows something was missed and requests the gap. Duplicates are ignored by position or event ID. Global ordering across all channels is unnecessary and costly; per-channel order is enough for correctness, with a per-user stream for personal state. Positions must survive failover without going backwards, which usually requires assigning them within the same transaction as the write.",
    k: ["Per-channel sequences vs one global sequence: per-channel scales and fits the partitioning, but cross-channel ordering is not defined, which clients must accept.", "Gap-detect and refetch vs guaranteed ordered delivery: gap detection tolerates an unreliable transport and is simple, but needs retained history for repair."],
    p: ["Assigning positions outside the write transaction lets a failure leave gaps or duplicates that clients misread.", "Using wall-clock timestamps as sequence causes ties and reordering when servers' clocks differ."],
    v: "Drop every tenth event on a test connection; the client must detect each gap, fetch the missing events, and end with a complete, ordered list identical to the server's.",
    dep: ["channel-ordering", "message-store"]
  },
  "resume-replay": {
    s: "Lets a reconnecting client fetch exactly the events it missed from a retained log, instead of reloading everything.",
    d: "The server keeps a bounded window of recent events per stream, in memory or a log. A client presenting its last position gets the events after it, in order, before live events resume. If the position is older than the window, the server says so and the client does a full resync. The replay and the live stream must be stitched without loss or duplication, usually by subscribing first, then replaying up to the subscription point. The window size is a real cost decision balancing memory against how long a device can be away.",
    k: ["Long retention of events for replay vs short with fallback to snapshot: long retention makes reconnects cheap, but costs storage and memory for rarely used history.", "Subscribe-then-replay vs replay-then-subscribe: subscribing first avoids gaps and needs deduplication; the reverse is simpler but can lose events in between."],
    p: ["A replay window shorter than a typical laptop sleep forces a full resync for every morning login.", "Replaying events that were later deleted or restricted re-exposes content to the client."],
    v: "Disconnect a client for one minute and for two days while messages arrive, edits happen and one is deleted; the short gap replays exactly the missed events and the long gap triggers a full resync with deleted content absent.",
    dep: ["event-sequencing", "message-store", "subscriptions"]
  },
  "presence-service": {
    s: "Tracks whether each user is active, away or offline across all their devices and makes that state available to the people who care.",
    d: "Presence is computed from connections and activity signals: a user is active if any device reports recent interaction, away if all are idle, offline if none are connected. State changes are published to interested subscribers, not everyone. It is held in memory with short expiry rather than stored durably. Flapping is smoothed with grace periods. At scale, presence updates are the largest source of event volume per user, so the service samples, batches and limits who may subscribe.",
    k: ["Computed from live heartbeats with expiry vs explicit set by clients: heartbeats are accurate but chatty; explicit states are cheap and can be wrong.", "Eventually consistent in-memory state vs durable store: memory is fast and cheap and loses on restart, which is fine because clients re-announce."],
    p: ["Broadcasting every presence change to the whole workspace creates traffic that grows with the square of workspace size.", "Treating a phone's brief connection as active makes people appear online while asleep."],
    v: "Connect two devices for one user, go idle on one and active on the other, then disconnect both; observers see active, still active, then offline within the grace period, with no flapping.",
    dep: ["heartbeat-liveness", "presence-subscriptions", "connection-gateways"]
  },
  "presence-subscriptions": {
    s: "Limits presence delivery to the people who can see it: users subscribe to the presence of specific others, typically those visible in the open conversation or contact list.",
    d: "Rather than broadcasting every user's presence to all, a client requests updates for a bounded set, such as members visible on screen or a pinned list, and the service sends changes only for them. Subscriptions are refreshed as the view changes and have caps. This turns a quadratic problem into a roughly linear one. It must still respect privacy: users who hide presence or live in a different tenant are not revealed.",
    k: ["Explicit subscriptions on the visible set vs workspace-wide broadcast: explicit subscriptions scale and save battery, but make fast scrolling lists show stale dots.", "Capping subscription counts vs allowing any: caps protect the service, but force clients to prioritize which people to track."],
    p: ["Presence state shown for users the viewer should not see reveals working hours and absence of guests or external contacts.", "Clients that never unsubscribe after leaving a view accumulate thousands of subscriptions."],
    v: "Open a channel of two hundred members and confirm the client subscribes only to the visible members, receives changes for them, and drops the subscriptions when navigating away.",
    dep: ["presence-service", "subscriptions"]
  },
  "typing-indicators": {
    s: "A transient signal showing who is currently composing a message in a conversation, sent frequently and discarded after a few seconds.",
    d: "While a user types, the client sends a throttled event; the server relays it to others viewing the conversation and each client shows it with a short expiry, since a stop is not reliably sent. Events are not stored, sequenced or retried. In large channels they are suppressed or aggregated, since hundreds of people typing is meaningless and expensive. They honor privacy settings. Because they are the cheapest event to drop, they are the first thing shed under load.",
    k: ["Relay to everyone in the channel vs only viewers of it: relaying to viewers only cuts traffic dramatically, but needs knowledge of which conversation each client has open.", "Explicit stop events vs timeout expiry: timeouts are robust to lost messages, but a stopped typist's indicator lingers for seconds."],
    p: ["Sending an event per keystroke instead of throttling floods the connection.", "Typing indicators in a channel of thousands consume fanout capacity needed by real messages."],
    v: "Type continuously in one client: the event rate stays at about one per few seconds, others see the indicator within a second and it vanishes shortly after stopping; in a ten-thousand-member channel nothing is broadcast.",
    dep: ["event-fanout", "subscriptions"]
  },
  "custom-status": {
    s: "A user-set short message and icon, optionally with an expiry, showing availability or context such as in a meeting or on vacation.",
    d: "The status is stored on the user profile with an expiry time and is pushed to observers as a profile update. Calendar and call integrations can set and clear it automatically. It can imply do-not-disturb. It displays beside names and in profiles and caches throughout clients, so updates travel by event rather than refetch. Expiry must be enforced reliably so stale statuses do not linger, and it follows the same visibility rules as presence for external users.",
    k: ["Server-enforced expiry vs client-side expiry: server expiry is consistent across devices and bots, but needs a scheduler; client expiry is simple and can disagree.", "Free-text statuses vs a fixed set: free text is expressive, but needs moderation and cannot drive automation reliably."],
    p: ["A status that expires on the server but stays cached on clients shows people as on vacation after they returned.", "Automatically set statuses from calendars can reveal sensitive meeting titles."],
    v: "Set a status expiring in one minute; every client and the mention autocomplete show it, and all must clear it within seconds of expiry without a reload.",
    dep: ["presence-service", "do-not-disturb"]
  },
  "app-permissions-model": {
    s: "The scope system that defines what an app can read or write, evaluated on every API call and event, bound to the workspace and to channels the app can access.",
    d: "Scopes are fine-grained capabilities such as reading channel history or posting messages. A token carries granted scopes; each request checks the scope and then the resource-level access: a bot can read only channels it belongs to, a user token only what that user may see. Admins can limit which scopes are installable. Scope changes require reconsent. It is hard to design scopes that are narrow enough to be safe and few enough for developers and admins to understand.",
    k: ["Fine-grained scopes vs a few broad ones: fine-grained scopes reduce blast radius, but multiply consent screens and developer confusion.", "Scope check plus resource check vs scope check alone: both stop an over-privileged app from reading everything, at the cost of evaluating membership on each call."],
    p: ["Broad legacy scopes that cannot be narrowed leave old apps with far more access than they need.", "Checking scopes on the API but not on event delivery lets an app receive content its scopes do not cover."],
    v: "Install an app with only a post scope and confirm it cannot read history or receive message events, then add the read scope and confirm both start working only after reconsent.",
    dep: ["permission-evaluator"]
  }
});
