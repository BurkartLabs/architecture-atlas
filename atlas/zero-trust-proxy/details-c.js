// Details for the zero-trust access proxy plate, part 3: continuous evaluation, connectors, high availability.
ATLAS.details("zero-trust-proxy", {
  "continuous-evaluation-loop": {
    s: "The ongoing process that re-checks active sessions against current identity, device and risk data and acts when an earlier allow no longer holds.",
    d: "Inputs arrive as events from the identity provider, the endpoint system, the risk engine and the posture pipeline, or the proxy polls on a timer. For each event the loop finds affected sessions, reruns policy with current data and records the outcome. A changed result triggers an action: terminate, require step-up or reduce access. The loop's cost scales with sessions times events, so it indexes sessions by user and device. Its value depends on how quickly events reach it and how accurately they map to sessions.",
    k: ["Event-driven reevaluation versus periodic sweep: events react in seconds and depend on reliable delivery; sweeps are simple and leave a window up to the interval.", "Reevaluate all sessions of an affected user versus only the triggering one: all is safer for compromise; one limits disruption when the signal is narrow."],
    p: ["An event that cannot be mapped to a session is dropped, so access continues after the signal.", "A burst of events overloads the evaluator and delays decisions for unrelated users."],
    v: "Mark a device noncompliant while a session is active and measure the time to action. Confirm the log shows the triggering event, the new decision and the session affected.",
    dep: ["shared-signal-ingestion","policy-evaluation-engine","session-revocation"]
  },
  "risk-scoring": {
    s: "Combining signals such as new device, unusual location and recent failures into a score that policy can use to allow, step up or deny.",
    d: "A scoring function takes signals about the user, device, network and behavior and outputs a level, often low, medium or high, with the contributing factors. Policy then reacts: high risk might require step-up or block, while low allows without prompts. Scores can come from rules or a trained model. They must be explainable, because a denial based on an opaque number cannot be corrected by the user or defended to an auditor, and calibrated, because too many false positives teach users to approve prompts without reading.",
    k: ["Rule-based scoring versus learned models: rules are transparent and miss novel patterns; models catch more and are harder to explain and tune.", "Score as one input versus the sole decision: using it as one input keeps explicit rules in charge; sole reliance is simpler and brittle."],
    p: ["High false-positive rates train users to approve every prompt, including hostile ones.", "Scores that cannot name their contributing factors leave support unable to resolve a denial."],
    v: "Replay a set of known good sessions and known compromised ones through the scorer. Confirm the compromised ones score high and the good ones low at the chosen threshold, and each result lists its factors.",
    dep: ["shared-signal-ingestion","context-conditions"]
  },
  "shared-signal-ingestion": {
    s: "Receiving security events from other systems, such as an identity provider, endpoint protection or a cloud service, in a standard format and routing them to evaluation.",
    d: "Systems publish events such as credential change, session revoked, device compliance changed or high user risk. The proxy receives them through a push interface using signed tokens, validates the sender and maps the subject to its own users, devices and sessions. A standard event format lets many sources feed one consumer. Delivery guarantees, ordering and duplicate handling matter: acting on a stale event after a newer one can restore access that should have stayed removed.",
    k: ["Push events versus polling: push is prompt and needs a reachable receiver and replay handling; polling is simple and slow.", "Trust every configured source equally versus weight by source: equal trust is simple; weighting reflects reliability and adds tuning."],
    p: ["Events delivered out of order let an old compliant message override a newer noncompliant one.", "An unauthenticated event endpoint lets an attacker revoke sessions or hide a compromise."],
    v: "Send a signed test event for a known user and confirm the matching sessions are reevaluated. Send the same event with a bad signature and confirm it is rejected and logged.",
    dep: ["idp-federation","endpoint-management-integration","signing-key-management"]
  },
  "mid-session-reevaluation": {
    s: "Applying a new decision to a session that is already in use, including what the user sees and what happens to open connections.",
    d: "When reevaluation changes the verdict, the proxy must enforce it on traffic already flowing. For web sessions this means rejecting the next request with a reason; for tunnels and long connections it means closing or throttling them. The user experience matters: a clear message that says the device became noncompliant and how to fix it is very different from a connection reset. The proxy also needs to restore access smoothly when the cause is fixed, without a full sign-in.",
    k: ["Immediate cutoff versus a grace period: immediate cutoff limits risk and loses unsaved work; a grace period is kinder and gives an attacker a window.", "Downgrade to read-only versus full block: downgrades keep users productive and require the application to honor a restricted mode; blocking is simple."],
    p: ["Cutting a connection with no explanation looks like a network fault and produces a support call.", "Access restored by a fixed posture check requires a full login because the session was destroyed instead of suspended."],
    v: "Break a device check during a live session, observe the user-facing message and the connection state, fix the check and confirm access resumes without a new sign-in.",
    dep: ["continuous-evaluation-loop","long-lived-connection-policy","denial-page"]
  },
  "anomaly-detection": {
    s: "Spotting unusual access patterns, such as impossible travel, atypical volume or first-time application use, as inputs to risk decisions.",
    d: "The detector builds a baseline per user or group from the decision and flow logs and flags deviations: a login from two distant places in minutes, a sudden download of far more data than usual, access to many applications in one hour. Output goes to risk scoring or analysts. Baselines need history and drift with changes in behavior; new employees and people who travel look anomalous. It is easy to build a detector that produces many alerts and hard to build one whose alerts are acted on.",
    k: ["Per-user baselines versus global thresholds: per-user baselines fit individual behavior and need history; global thresholds start immediately and misjudge unusual roles.", "Alert for analysts versus automated action: alerts avoid false lockouts and depend on people; automation is fast and punishes false positives."],
    p: ["Alert volume grows until analysts stop reading, and a real compromise goes unnoticed.", "Shared VPN or carrier addresses make legitimate users appear to teleport."],
    v: "Simulate an impossible-travel login and a large unusual download on a test account. Confirm both produce a flagged event with an explanation and feed the risk score, and normal use of the account does not.",
    dep: ["flow-and-session-logs","access-decision-logs"]
  },
  "automated-response-actions": {
    s: "Predefined actions the system takes without waiting for a person, such as revoking sessions, requiring step-up or isolating a device.",
    d: "Policy maps conditions to actions: on high risk, require step-up; on confirmed compromise, revoke all sessions and notify the security team; on a lost-device report, deny that device certificate. Actions run through the same revocation and policy paths as manual ones, are logged with their trigger, and can be undone. Automation shortens the time from detection to containment from hours to seconds, and it can take the whole workforce offline if its trigger misfires, so scope and rate limits are essential.",
    k: ["Automatic containment versus human approval: automatic is fast and can disrupt many users on a false trigger; approval limits mistakes and loses minutes.", "Narrow actions first versus broad lockout: narrow actions limit disruption and may leave related sessions; broad lockout is safe and heavy."],
    p: ["A bad detection rule triggers mass revocation and locks out the company during business hours.", "Actions that cannot be undone strand users until an administrator intervenes."],
    v: "Trigger a test rule on a single test user and confirm the action runs, is logged with its cause and can be reversed. Confirm a rate limit stops the same rule from acting on more than the configured number of users.",
    dep: ["session-revocation","risk-scoring","admin-audit-log"]
  },
  "connector-agent": {
    s: "A small service inside a private network that connects out to the proxy and forwards allowed requests to internal applications.",
    d: "The connector runs on a server or container near the applications. It establishes an outbound connection to the proxy, registers, and then accepts requests the proxy sends back over that connection, opening the final hop to the application. Because it initiates the connection, the network needs no inbound firewall rules. It must be lightweight and stateless so it can be replaced and scaled. It sees traffic after the proxy decrypts it, so it should be treated as part of the trusted infrastructure and updated promptly.",
    k: ["Connector near each app versus a central connector: near-app connectors keep traffic local and need more deployments; a central one is simple and gives broad reach inside the network.", "Dedicated connector hosts versus running on application servers: dedicated hosts isolate it, while co-located is cheap and exposes the app host if the connector is compromised."],
    p: ["A connector with network-wide reach turns its compromise into access to everything in that network.", "Out-of-date connectors accumulate known vulnerabilities because nobody owns updates."],
    v: "Block all inbound traffic to the network, start a connector, and confirm a request through the proxy reaches the internal application. Stop the connector and confirm the application becomes unreachable.",
    dep: ["outbound-only-tunnel","connector-registration","edge-connector-mutual-auth"]
  },
  "outbound-only-tunnel": {
    s: "The long-lived connection a connector opens to the edge so that private applications need no inbound port or public address.",
    d: "The connector dials the nearest points of presence over an encrypted transport, usually on a port that firewalls already allow outbound, and keeps the connection alive with heartbeats. The edge sends application requests back through it. This removes the attack surface of an internet-facing port and works behind address translation. The tunnel must reconnect with backoff, handle moving between edges, and avoid becoming a bottleneck, since all traffic for an application group flows through a few connections.",
    k: ["Several tunnels per connector versus one: several give redundancy and throughput and use more connections; one is simple and a single point of failure.", "Persistent tunnel versus on-demand dial: persistent is fast to use and costs idle resources; on-demand saves resources and delays the first request."],
    p: ["Firewalls that drop idle connections silently kill the tunnel between heartbeats.", "All connectors reconnecting at once after an edge restart overload the edge."],
    v: "Drop the tunnel connection with a firewall rule and confirm the connector reconnects within the target time and requests resume. Verify there are no inbound listeners with a port scan from outside.",
    dep: ["edge-connector-mutual-auth","tunnel-multiplexing"]
  },
  "connector-registration": {
    s: "How a new connector proves it is authorized and is added to a connector group with its own credentials.",
    d: "An administrator creates a one-time enrollment token or a pending entry in the control plane, and the new connector uses it to generate a key pair and request a certificate. After registration the token is useless, and the connector uses its certificate. The control plane records the connector, its version and group. Registration is a trust boundary: whoever holds the token can introduce a machine that receives application traffic, so tokens are short-lived, single-use and logged.",
    k: ["Single-use short-lived tokens versus long-lived provisioning keys: single-use tokens limit theft, at the cost of an extra step for automated deployment; long-lived keys are easy and risky.", "Manual approval of new connectors versus automatic acceptance: approval prevents rogue connectors and slows scaling; automatic scales and trusts the token alone."],
    p: ["A provisioning token committed to a deployment script lets anyone register a connector.", "Connectors cloned from a machine image share identity and appear as one."],
    v: "Register a connector with a valid token, then try to reuse the same token from another machine. The second attempt must fail, and the control plane log shows both attempts.",
    dep: ["admin-console-and-api","signing-key-management","connector-agent"]
  },
  "private-app-discovery": {
    s: "Finding which internal services exist, so administrators can define them as applications instead of guessing.",
    d: "A connector or a scan observes listening services, DNS records and traffic, and proposes candidate applications with their addresses and ports. Administrators review and promote them to definitions. Discovery shortens the first deployment and surfaces forgotten services, but publishing discovered services automatically would expose things nobody intended. It must be careful: scanning a production network can disturb fragile services, and the results age quickly as infrastructure changes.",
    k: ["Passive observation versus active scanning: passive observation is safe and sees only active services; scanning finds idle ones and can disrupt weak systems.", "Auto-publish versus review: auto-publish is quick and risks exposing unintended systems; review is slower and keeps access deliberate."],
    p: ["A scan finds a legacy admin interface, and auto-publishing exposes it to every user.", "Discovery results saved once and never refreshed list services that no longer exist."],
    v: "Start a new test service on the network and confirm it appears as a candidate within the stated time but is not reachable by users until an administrator approves it.",
    dep: ["connector-agent","application-definitions"]
  },
  "tunnel-multiplexing": {
    s: "Carrying many independent application flows over one tunnel connection, each with its own stream and flow control.",
    d: "A single transport connection carries numbered streams, with each stream being one user request or connection to an application. Streams have separate flow control so a slow download does not block others, and each carries the user, application and decision identifiers for logging. Multiplexing saves connection setup and keeps firewall state small. Its difficulty is head-of-line blocking at the transport layer, fairness between streams, and limits on the number of concurrent streams.",
    k: ["Multiplexed streams versus a connection per flow: multiplexing saves setup time and shares failures; separate connections isolate flows and cost more resources.", "Stream-based transport versus datagram transport: streams are simple and block behind loss; datagrams avoid that and need congestion control in the tunnel."],
    p: ["One large transfer starves small interactive flows when stream priorities are not set.", "Exceeding the maximum concurrent streams makes new requests fail with a generic error."],
    v: "Run a large transfer and many small requests at once through one tunnel. Confirm the small requests keep their normal latency and the stream count in metrics matches the flows opened.",
    dep: ["outbound-only-tunnel"]
  },
  "connector-groups-and-routing": {
    s: "Organizing connectors into groups by network location and routing each application's traffic to a group that can reach it.",
    d: "A group represents connectors with the same reach, for example one data center or one cloud network. An application definition names the group that serves it, and the edge picks an available member, preferring the nearest or least loaded. Groups let operators add capacity and remove nodes without touching applications. Routing needs health information and must avoid sending traffic into a network that cannot reach the application, which is a common misconfiguration when similar address ranges exist in two sites.",
    k: ["Load balance across the group versus sticky routing: balancing spreads load evenly; stickiness helps protocols that keep state per connector and uneven loads result.", "Nearest-connector selection versus lowest-load: nearest cuts latency and may overload one site; lowest-load evens out and adds hops."],
    p: ["Overlapping private ranges in two data centers send traffic to the wrong site.", "A group with one healthy member quietly runs without redundancy until it fails."],
    v: "Stop one connector in a group while sending steady traffic. Confirm requests move to remaining members with no errors beyond the in-flight ones, and metrics show the change.",
    dep: ["connector-health-checks","application-definitions"]
  },
  "private-dns-resolution": {
    s: "Resolving internal hostnames by asking a resolver on the private side, through a connector, so that names work without exposing internal DNS.",
    d: "When the agent or edge needs the address for a private name, the request is forwarded through a connector, which asks the internal resolver in its own network and returns the result. The result might be used only at the connector so internal addresses never reach the client. Overlapping or split-horizon DNS means the same name can mean different things in different networks, so resolution must happen in the right one. Caching speeds repeated lookups and delays updates when addresses change.",
    k: ["Resolve at the connector versus resolve at the edge: connector resolution gives correct internal answers and adds a hop; edge resolution is fast and needs a copy of internal DNS data.", "Return real addresses versus synthetic ones: real addresses are simple and leak internal layout; synthetic ones hide it and add translation."],
    p: ["Resolving in the wrong network returns a public address for an internal name or the reverse.", "Long caches keep serving an old address after a service moves."],
    v: "Look up an internal name through the proxy and confirm the answer matches the internal resolver. Change the record, wait the TTL, and confirm the proxy returns the new address.",
    dep: ["connector-agent","connector-groups-and-routing"]
  },
  "edge-connector-mutual-auth": {
    s: "Both sides of the tunnel proving their identity so a rogue connector or a fake edge cannot join.",
    d: "The edge presents a certificate to the connector, which checks it against a pinned set of authorities, and the connector presents its own certificate, issued at registration, to the edge. Both are short-lived or checked against revocation. This prevents a connector from being fed traffic by an impostor edge and prevents a stolen machine from claiming to be a connector. Key storage on the connector and certificate rotation without dropping traffic are the operational demands.",
    k: ["Mutual certificate authentication versus token authentication: certificates bind to a key and rotate with tooling; tokens are simpler and are bearer secrets.", "Pinned issuer versus system trust store: pinning limits who can impersonate the edge and complicates issuer changes; system trust is flexible and wider."],
    p: ["A certificate renewal failure drops all connectors at the same moment on the same expiry date.", "Connector keys stored on disk without protection are copied with a backup."],
    v: "Try to connect with a certificate from an untrusted issuer, an expired connector certificate and a revoked one. All must be refused, while a valid connector connects and passes traffic.",
    dep: ["signing-key-management","connector-registration"]
  },
  "connector-health-checks": {
    s: "Probes that tell the edge whether a connector, and the applications behind it, are reachable and responding.",
    d: "Health has several layers: the tunnel is up, the connector process is working, and the application port accepts connections or answers an application-level check. The control plane or edge combines them to decide whether to route to a connector. Checks that are too shallow report healthy when the application is down; too deep and they overload the application or flap. Results also feed alerts and the administrator's view of what is broken.",
    k: ["Tunnel-level versus application-level checks: tunnel checks are cheap and say nothing about the app; application checks catch real failures and need per-app configuration.", "Fast detection versus stable detection: fast detection reduces failed requests and flaps on brief blips; stable detection avoids churn and keeps routing to a dying node."],
    p: ["A connector that is up but cannot reach the application keeps receiving traffic because only the tunnel is checked.", "Checks run from one place miss a network problem affecting just some users."],
    v: "Stop an application behind a healthy connector and confirm it is marked unhealthy within the target time, an alert fires, and requests receive a clear unavailable response, not a timeout.",
    dep: ["connector-agent","metrics-and-dashboards"]
  },
  "points-of-presence": {
    s: "The geographically distributed edge sites where users connect, so traffic enters the proxy close to them and not at one central location.",
    d: "Each point of presence runs the full data plane: listeners, session verification, policy evaluation and tunnel endpoints. Users are steered to a nearby one through anycast addressing or DNS. More sites reduce latency and spread load, and multiply the number of places that must hold current policy, keys and revocation lists. Capacity is planned per site with headroom to absorb a neighbor's traffic when it fails, and the sites must be consistent enough that a user moving between them keeps the same experience.",
    k: ["Many small sites versus a few large ones: many sites cut latency and survive local loss and are costly to operate; a few are simpler and farther from users.", "Anycast steering versus DNS-based steering: anycast reacts quickly to failure and is harder to control; DNS lets you direct users and responds slowly."],
    p: ["A site with stale policy treats users differently from its neighbors, which looks like random intermittent denials.", "Capacity planned for average load fails when a neighbor's traffic arrives."],
    v: "Connect from several regions and confirm each reaches a nearby site. Remove one site from rotation and confirm its users move to another within the target time with the same decisions.",
    dep: ["edge-listener-and-tls","configuration-distribution"]
  },
  "edge-failover": {
    s: "Moving users and tunnels to another site when an edge node or whole site fails, without making them sign in again.",
    d: "Failover has three parts: noticing the failure through health signals, steering new connections elsewhere, and recovering existing sessions. Because sessions are verifiable at any site using shared keys, a user can continue on another site without a new login, while open tunnels reconnect and re-establish streams. The agent should hold a list of sites and retry intelligently. The hard part is the surge: a failed site's users all arrive at once at its neighbors.",
    k: ["Stateless sessions verifiable anywhere versus sticky sessions: stateless sessions fail over cleanly; sticky sessions keep state locally and lose it when the site fails.", "Aggressive failover versus patient failover: aggressive moves users at the first sign of trouble and flaps; patient waits and lets users suffer a partial outage."],
    p: ["Reconnection storms overload the next site and cause a cascade.", "Agents with a hard-coded single site cannot fail over when it is down."],
    v: "Take a site down during active use and measure time to resume, number of users prompted to sign in again (target zero) and whether the next site's load stays within limits.",
    dep: ["points-of-presence","session-issuance","outbound-only-tunnel"]
  },
  "connector-redundancy": {
    s: "Running several connectors per network so that losing one does not cut off the applications behind it.",
    d: "A connector group should have at least two members in separate failure domains, such as separate hosts or zones. The edge spreads traffic across them and removes failed ones using health checks. Redundancy also supports rolling updates: take one down, update it, bring it back. Capacity must be sufficient that the remaining members handle full load. A group that has two members but one machine is not redundant, and teams often discover that during the outage.",
    k: ["Active-active versus active-standby: active-active uses all capacity and shows problems early; standby keeps one idle and untested.", "More small connectors versus few large ones: many small ones limit the impact of one failure and cost more to manage; few large ones are simple and fail big."],
    p: ["Both connectors run on one host or in one zone, so a single fault removes both.", "A standby never carries traffic and fails when finally needed because its config drifted."],
    v: "Stop each connector in turn while running traffic and confirm applications keep working. Then stop all but one and confirm that one carries full load without errors.",
    dep: ["connector-groups-and-routing","connector-health-checks"]
  },
  "edge-policy-cache": {
    s: "A local copy of policy, keys and revocation data at each edge node so decisions continue when the control plane is slow or down.",
    d: "Edge nodes receive compiled policy, application definitions, signing keys and deny lists from the control plane and keep them in memory and on disk. Decisions use the local copy, so the control plane is not in the request path. The cache needs version numbers, so operators know what each node is running, and a staleness limit, after which the node behaves per its failure setting. Large policy sets raise memory and startup time, and updates must apply atomically.",
    k: ["Local decisions versus calling the control plane: local decisions are fast and survive outages with data that can age; remote decisions are current and fragile.", "Full policy on every node versus per-tenant slices: full copies are simple and large; slices save memory and complicate routing."],
    p: ["A node that silently stopped receiving updates enforces last week's policy.", "A cache that loads policy file by file briefly runs with half-updated rules."],
    v: "Cut a test node from the control plane and confirm it keeps deciding with its cached policy, reports its version and age in metrics, and applies the configured behavior once the staleness limit passes.",
    dep: ["configuration-distribution","policy-evaluation-engine"]
  },
  "outage-failure-mode": {
    s: "The chosen behavior when the proxy cannot get what it needs to decide, such as policy, posture or identity data: allow, deny or degrade.",
    d: "Every dependency can fail: the control plane, the identity provider, the posture service, the log pipeline. For each, the design states whether requests continue on cached data, are denied, or are limited. Fail-closed is safe and turns a dependency outage into an access outage; fail-open keeps work flowing and lets a failure be used as an attack. Different applications can have different modes, and the choice should be written down before the incident, not made under pressure.",
    k: ["Fail closed versus fail open: closed protects data and makes any outage total; open preserves availability and removes protection exactly when something is wrong.", "One global mode versus per-application mode: global is simple and wrong for some systems; per-application matches risk and requires deliberate classification."],
    p: ["A fail-open setting added for convenience is forgotten and stays on permanently.", "Fail-closed on the log pipeline stops all access whenever log storage fills."],
    v: "Block each dependency in turn in a staging environment and confirm each application behaves exactly as its documented failure mode says, with an alert raised and the behavior recorded in logs.",
    dep: ["edge-policy-cache","idp-federation"]
  },
  "config-rollout-and-canary": {
    s: "Deploying policy and software changes gradually and with automatic rollback, since a bad change affects all traffic at once.",
    d: "New policy, proxy builds and agent bundles go first to a small set of nodes or users, with metrics watched for denials, errors and latency. If numbers move, rollout stops and reverts. Changes carry version numbers and a way to see which version each node holds. Because the proxy is in the path of everything, the biggest outages in this category come from global configuration pushes. A good rollout limits the blast radius and makes reversal the default, not an emergency project.",
    k: ["Gradual rollout versus global push: gradual limits damage and delays urgent fixes; global is immediate and spreads a mistake everywhere.", "Automatic rollback on metrics versus manual: automatic reacts in seconds and can misread normal variation; manual is considered and slow."],
    p: ["A configuration validated only for syntax is pushed everywhere and denies all access.", "Rollback needs the control plane, which the bad change has just broken."],
    v: "Push a deliberately faulty change to a canary and confirm monitoring detects the rise in denials, stops the rollout and reverts the canary without operator action, leaving other nodes unchanged.",
    dep: ["configuration-distribution","metrics-and-dashboards"]
  },
});
