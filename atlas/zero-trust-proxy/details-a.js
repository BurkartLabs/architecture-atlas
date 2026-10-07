// Details for the zero-trust access proxy plate, part 1: client agents, user experience, identity-aware proxying.
ATLAS.details("zero-trust-proxy", {
  "agent-enrollment": {
    s: "The one-time process that ties a device and a user to the proxy, issuing the agent the credentials it will use from then on.",
    d: "The user or an endpoint-management tool installs the agent, which generates a key pair on the device and presents an enrollment token or a user login. The control plane records the device, binds it to a user or to the organization, and returns a certificate or long-lived credential. Enrollment is the moment trust is established, so it must resist a copied token or an installer shared on a chat channel. Re-enrollment after reinstall and removal at offboarding are the harder cases, because a stale device record keeps working.",
    k: ["Token-based enrollment versus login-based enrollment: tokens suit mass deployment through endpoint management but are bearer secrets; login ties the device to a person at the cost of an interactive step.", "Hardware-backed keys versus software keys: hardware keys cannot be copied off the device, but not every endpoint has them and recovery after a hardware swap needs a path."],
    p: ["A reusable enrollment token pasted into a ticket lets anyone enroll an unmanaged laptop as if it were corporate.", "Devices that are wiped or lost stay enrolled because nothing links offboarding to device records."],
    v: "Enroll a test device, then copy its enrollment artifacts to a second machine and confirm the second machine cannot authenticate. Remove the user in the directory and confirm the device loses access within the documented time.",
    dep: ["device-identity-certificates","idp-federation"]
  },
  "client-agent": {
    s: "Software on the endpoint that sends selected traffic to the proxy, reports device state and presents the device's identity.",
    d: "The agent runs as a privileged service with a user-facing component. It installs a virtual network interface or a local proxy, decides per connection whether the traffic goes to the proxy or directly out, and keeps a long-lived authenticated channel to the nearest point of presence. It also gathers posture data and relays sign-in prompts. It is hard because it runs on every operating system the organization supports, alongside other network software such as consumer VPNs and security tools, and a bug in it affects connectivity for the whole device.",
    k: ["Full-tunnel interception versus selected-app steering: full capture is simple to reason about but sends all traffic through the proxy; selective steering saves bandwidth but depends on accurate rules.", "Kernel-level versus user-space networking: kernel hooks are faster and harder to bypass, but crash the machine when they fail and need per-OS signing."],
    p: ["Conflicts with other network software leave users with no connectivity and a vague error.", "An agent that fails closed on a captive-portal network leaves travelers unable to reach the sign-in page it needs."],
    v: "On each supported OS, connect to a private app through the agent, then disable the agent service and confirm the app becomes unreachable rather than falling back to a direct path.",
    dep: ["traffic-steering-rules","per-app-tunnel-on-device","agent-enrollment"]
  },
  "traffic-steering-rules": {
    s: "The rules telling the agent which destinations, domains and applications go through the proxy and which bypass it.",
    d: "Rules match on destination address, domain name, port or the originating process, and are pulled from the control plane as a versioned bundle. Matching a private application's hostname or address range sends the flow into a tunnel; everything else goes directly or to a secure web gateway. The rules must cover overlapping address ranges, domains that resolve differently inside and outside the network, and software that hard-codes addresses. The difficulty is that a missing rule is silent: the traffic simply takes the wrong path.",
    k: ["Include lists versus exclude lists: include lists send only known apps and leave everything else direct, while exclude lists send everything and risk breaking local devices such as printers.", "Central bundles versus per-user rules: one bundle is easy to audit, per-user rules cut tunnel load but multiply the cases to test."],
    p: ["Overlapping private address ranges between the office and a user's home network route traffic to the wrong place.", "A rule update that lands while the agent is offline leaves a device with stale routing for days."],
    v: "From an enrolled device, resolve and connect to one private app and one public site, and confirm from the agent's flow log that the first went through the tunnel and the second did not.",
    dep: ["local-dns-interception","application-definitions"]
  },
  "local-dns-interception": {
    s: "The agent's handling of name lookups so that private application names resolve to something the tunnel can carry.",
    d: "Private hostnames often exist only in internal DNS. The agent intercepts lookups for configured domains and either answers with a synthetic address that maps back to the real name inside the tunnel, or forwards the query through a connector to be resolved inside the private network. Other lookups go to the normal resolver. Getting this right means handling search suffixes, split-horizon names, caching and encrypted DNS settings in browsers that bypass the system resolver.",
    k: ["Synthetic addresses versus real addresses: synthetic ones let the connector resolve the true target and hide internal addressing, but break software that records or compares resolved addresses.", "Intercept at the OS resolver versus run a local DNS server: the OS hook is less intrusive but varies by platform; a local server is uniform but conflicts with other tools."],
    p: ["A browser using its own encrypted DNS never asks the system resolver and fails to find private names.", "Negative answers cached too long keep an app unreachable after it is published."],
    v: "Look up a private hostname with the agent on and off. With it on the lookup succeeds and the flow appears in the tunnel log; with it off the lookup fails, and public names resolve the same either way.",
    dep: ["private-dns-resolution","client-agent"]
  },
  "per-app-tunnel-on-device": {
    s: "The encrypted channel from the device to the nearest point of presence, carrying only the flows the steering rules selected.",
    d: "The agent opens a transport connection to the edge, authenticates with the device credential and the user session, and multiplexes many application flows over it. Each flow carries the target application so the edge can apply policy to it without opening the payload. Transport choices matter: datagram transports handle roaming between networks well, while stream transports pass more firewalls. The agent has to survive network changes, sleep and resume, and reconnect without making the user sign in again.",
    k: ["Datagram-based versus stream-based tunnel transport: datagram tunnels recover quickly from network changes and avoid head-of-line blocking, but some networks block them, so a stream fallback is needed.", "One shared tunnel versus a tunnel per application: sharing is cheaper on the device, while separate tunnels isolate failures and make per-app policy simpler."],
    p: ["Tunnel keepalives too sparse for a mobile network cause silent drops that look like application hangs.", "Fallback to a stream transport hides a blocked datagram path, so the slower path becomes permanent unnoticed."],
    v: "Move a connected laptop from wired to wireless network during a file transfer and confirm the transfer continues or resumes within seconds without a new sign-in.",
    dep: ["edge-listener-and-tls","session-issuance"]
  },
  "agentless-browser-access": {
    s: "Reaching web applications through a plain browser, with the proxy handling sign-in and policy and no software installed on the device.",
    d: "The user navigates to the application's hostname, which resolves to the proxy. The proxy redirects to the identity provider if there is no session, then forwards the request to the application. This covers contractors and unmanaged devices, which cannot take an agent. The cost is that the proxy sees only what the browser sends: it cannot read device posture beyond what the browser reveals, and it cannot carry non-web protocols. Applications that assume their own hostnames or absolute internal URLs may need rewriting.",
    k: ["Agentless versus agent-based access: agentless removes install friction and works on any device, but gives weak device assurance and covers only web traffic.", "Browser-reported posture versus none: a browser extension can report more, but each browser needs its own build and users can decline it."],
    p: ["Applications that embed internal hostnames in pages or redirects break when reached through the proxy's hostname.", "Treating browser access as equal to managed-device access lets an unmanaged laptop download everything."],
    v: "From a fresh browser profile on an unmanaged machine, sign in and open one web app. Confirm a policy requiring a managed device denies it, and a policy allowing unmanaged devices passes with limited actions.",
    dep: ["edge-listener-and-tls","sign-in-redirect-flow","host-to-app-routing"]
  },
  "agent-update-channel": {
    s: "How the agent and its rule bundles get new versions across the fleet, including staging, rollback and minimum-version enforcement.",
    d: "Updates come from the vendor or the organization's endpoint-management system, usually in rings: a small group first, then wider. The control plane records which version each device runs and can require a minimum version for access, so a vulnerable agent is locked out. Signed packages and verified update channels matter because the agent runs with high privilege. The hard part is updating a component that carries the device's own connectivity: a bad build can cut off the path used to deliver the fix.",
    k: ["Automatic updates versus managed rollout: automatic keeps the fleet current, but a bad release reaches everyone at once unless rings are enforced.", "Hard minimum version versus soft warning: hard enforcement removes old risk quickly but locks out users who cannot update, such as those traveling."],
    p: ["A faulty update that breaks the tunnel prevents the device from downloading the repaired version.", "Version enforcement turned on before the fleet has updated locks out a large share of users at once."],
    v: "Publish a new version to the first ring only and confirm that device inventory shows that ring updated and others unchanged. Raise the minimum version and confirm an old-version device is denied with a reason that says to update.",
    dep: ["client-agent","admin-console-and-api"]
  },
  "mobile-os-integration": {
    s: "The ways phones and tablets host an agent or share state with the proxy, within the limits the mobile operating system sets.",
    d: "Mobile systems allow a per-app tunnel only through supported network-extension interfaces, and they restrict background activity, so the agent can be suspended or terminated. Posture comes from the management profile rather than from direct inspection, and the device identity may be a certificate delivered by that profile. Mobile also has frequent network changes and battery limits. The proxy must handle agents that appear, vanish and reconnect often without treating each reconnection as a new risk event.",
    k: ["Managed profile versus user-installed app: a profile gives reliable posture and certificates but requires enrollment and gives the organization control of the device; an app is lighter but trusted less.", "Always-on tunnel versus on-demand tunnel: always-on is simpler to reason about but drains battery; on-demand saves power and adds a connection delay."],
    p: ["Operating-system background limits kill the agent, so the device looks offline even though the user is active.", "Treating every mobile reconnect as a new session floods the identity provider with sign-ins."],
    v: "Lock a phone for an hour, unlock it and open a private app. Confirm it reconnects without a password prompt and the log shows one session continuing, not a new login.",
    dep: ["client-agent","endpoint-management-integration"]
  },
  "application-launcher-portal": {
    s: "A page listing the applications a user may reach, with a link to each, built from the same policy that gates them.",
    d: "After sign-in, the portal queries the policy engine for the applications the user would be allowed to open and shows them as tiles, often with per-app status and a request-access link for the rest. Because the list is derived from policy, it stays correct as rules change. It also provides one place to start a session and a stable address to share. Computing the list means evaluating policy for every application, which is expensive when there are thousands, so results are cached and sometimes slightly stale.",
    k: ["Show only permitted apps versus show all with locks: hiding keeps the page uncluttered and conceals what exists; showing locked tiles helps users request access and reveals application names.", "Computed per load versus cached list: computing gives current answers but costs latency; caching is fast but shows an app that was just revoked."],
    p: ["A cached list shows a tile the user can no longer open, producing a denial that looks like a bug.", "Showing every application name to every user leaks the existence of sensitive internal systems."],
    v: "Add a user to a group that grants one application and confirm the tile appears on the next load. Remove them and confirm the tile disappears and a direct visit is denied.",
    dep: ["policy-evaluation-engine","application-definitions"]
  },
  "sign-in-redirect-flow": {
    s: "The sequence that sends an unauthenticated user to the identity provider and returns them to the original application page, with a proxy session established.",
    d: "The proxy records the requested URL, redirects to the identity provider with a state value and a nonce, receives the signed assertion on the callback, validates it and issues its own session, then sends the user back to the saved URL. Each step is a place to go wrong: open redirects, state values reused across tabs, lost deep links, and requests that cannot follow a redirect at all, such as API calls from scripts. Non-browser clients need a different flow that does not depend on a rendered page.",
    k: ["Redirect-based login versus embedded login: redirects keep credentials away from the proxy and support single sign-on, but they need correct state handling and break for clients that cannot render pages.", "Preserve the full original URL versus a safe-listed landing page: preserving gives a smooth return, while a fixed landing page avoids open-redirect abuse."],
    p: ["Accepting an arbitrary return URL after login lets an attacker redirect a signed-in user to a hostile page.", "State stored in a cookie shared across tabs makes a second login attempt break the first."],
    v: "Open a deep link while signed out, complete sign-in, and confirm you land on the same deep link. Tamper with the state parameter and confirm the callback is rejected.",
    dep: ["idp-federation","session-issuance","request-authentication"]
  },
  "denial-page": {
    s: "The page a user sees when access is refused, showing what was blocked, the reason in plain terms and the next step.",
    d: "The proxy returns a branded page with a reference code, the application name, a short reason such as device not encrypted or group not permitted, and actions: fix the device, request access, or contact support. The reason must be useful to the user without giving an attacker a map of the policy. The page is rendered at the edge, so it cannot call slow services, and it must still make sense for non-browser callers, which receive a status code and a short machine-readable body instead.",
    k: ["Specific reasons versus generic denial: specific reasons cut support load but reveal which conditions exist; generic text is safer and generates tickets.", "Rendering at the edge versus redirecting to a separate service: edge rendering works even if the control plane is down, while a separate service allows richer, up-to-date guidance."],
    p: ["A bare 403 with no reference code forces support to ask users to reproduce the problem.", "Revealing the exact failing posture rule tells an attacker which check to spoof."],
    v: "Trigger each documented denial reason and confirm the page names the reason class, shows a reference code, and that the same code finds the matching entry in the access decision log.",
    dep: ["reason-code-taxonomy","access-decision-logs"]
  },
  "reason-code-taxonomy": {
    s: "The fixed set of codes that name why a decision was made, shared by the denial page, the logs and support tooling.",
    d: "Every decision records which rule matched and which condition failed, mapped to a stable code: no session, group not permitted, device not compliant, posture stale, step-up required, risk too high, application not found. Codes let the denial page choose guidance, let support search logs, and let analytics count denials by cause. The taxonomy needs to be small enough to learn and precise enough to act on. It is hard to change later, because dashboards, runbooks and integrations reference the codes directly.",
    k: ["Coarse codes versus fine codes: coarse codes are stable and safe to show users, while fine codes help operators but multiply and drift as policy changes.", "Separate user-facing and internal codes: this lets the user see a safe category while logs keep detail, at the price of a mapping to maintain."],
    p: ["Reusing one code for two different causes sends users to the wrong fix.", "Renaming a code breaks alerts that were keyed on the old name."],
    v: "Generate one denial per code against a test application, and confirm the log entry, the denial page and the support lookup all report the same code and a consistent reason.",
    dep: ["policy-evaluation-engine"]
  },
  "step-up-prompts": {
    s: "A request for stronger authentication in the middle of a session when the user reaches something more sensitive than their current login covers.",
    d: "A policy can require recent multi-factor authentication or a stronger method for a given application or action. When the session does not meet it, the proxy pauses the request, sends the user to the identity provider with the required authentication context, and resumes on return. The user should arrive back where they were, with form data intact where possible. Hard cases are requests that cannot be paused, such as background calls, and users in a flow where an interruption loses their work.",
    k: ["Step-up on demand versus stronger login for everything: on-demand keeps routine access smooth and protects sensitive areas, but needs the proxy to know which requests are sensitive.", "Redirect for step-up versus an in-page prompt: a redirect is simple and works everywhere; an in-page prompt keeps state but needs application cooperation."],
    p: ["A POST request interrupted by step-up loses its body and the user must redo their work.", "Background requests that receive a redirect fail with confusing errors instead of triggering a prompt."],
    v: "Sign in with a basic method, open an application that requires strong authentication, and confirm a prompt appears. Complete it and confirm the original page loads and the session now records the stronger method.",
    dep: ["authentication-context-requests","reauthentication-policy","sign-in-redirect-flow"]
  },
  "access-request-workflow": {
    s: "The path by which a denied user asks for access, an owner approves it, and policy updates without an administrator editing rules.",
    d: "From the denial page, the user submits a request naming the application and a reason. It routes to the application owner or a manager, and an approval adds the user to a group or creates a time-limited grant that the policy engine honors. Expiry is the important part: grants should lapse automatically. Integration with a ticketing or identity governance system keeps the approval record. The risk is that an easy request path turns into rubber-stamping, so owners need context, and grants need review.",
    k: ["Time-limited grants versus permanent group membership: temporary grants shrink standing access, but require expiry handling and re-requests.", "Owner approval versus central approval: owners know the application, while central review applies consistent standards but becomes a bottleneck."],
    p: ["Grants with no expiry accumulate until most people have access to most applications.", "Approvers who see only a name and no reason approve everything."],
    v: "Request access to a test application, approve it, and confirm access works within the stated delay. Wait for expiry and confirm access ends without any administrator action.",
    dep: ["exceptions-and-break-glass","user-and-group-conditions","denial-page"]
  },
  "self-service-diagnostics": {
    s: "A tool in the agent or portal that tells a user and support why a connection failed: agent state, device checks, session and policy result.",
    d: "The diagnostic gathers the agent version, tunnel status, current posture results, session age and the last decisions for the user's recent attempts, then shows which step failed and the fix. It can export a bundle for support with sensitive values removed. Without it, every connectivity problem becomes a conversation across three teams. The work is correlating client-side facts with edge-side decisions using a request identifier that both ends record.",
    k: ["Client-side diagnostics versus server-side lookup: the client sees local network problems, the server sees policy decisions, and a useful tool joins both through a shared identifier.", "Full bundles versus minimal reports: bundles speed support but may include sensitive paths and addresses that must be stripped."],
    p: ["Diagnostic bundles include internal hostnames and user data that then travel through a support ticket.", "A tool that only reads local state cannot tell a policy denial from a network failure."],
    v: "Break each of four things in turn on a test device: the tunnel, the posture check, the session and the policy. Confirm the tool names a different failing step each time.",
    dep: ["client-agent","reason-code-taxonomy","access-decision-logs"]
  },
  "edge-listener-and-tls": {
    s: "The public-facing endpoint that accepts connections, terminates TLS and hands the decrypted request to the rest of the proxy.",
    d: "Listeners accept connections for many application hostnames on shared addresses, selecting a certificate by the requested server name. They enforce protocol versions and ciphers, handle HTTP versions, limit request size and rate, and absorb connection floods. Because the proxy decrypts traffic, it is a high-value target: it holds private keys for every application it fronts and sees plaintext. Performance depends on connection reuse, session resumption and efficient certificate lookup across thousands of names.",
    k: ["Terminate at the edge versus pass through encrypted: termination enables identity checks and inspection, but the proxy holds keys and plaintext; passthrough limits exposure and loses visibility.", "Shared certificates versus per-application certificates: shared is easy to manage, per-app limits the blast radius of a leaked key and complicates renewal."],
    p: ["A certificate that expires on one application hostname takes it down while the rest keep working, which is hard to spot.", "Unbounded request headers or slow clients exhaust connection slots at the edge."],
    v: "Connect with a TLS client to each of several hostnames on the same address and confirm each returns its own certificate, that an old protocol version is refused, and that a flood from one client does not slow another.",
    dep: ["application-certificate-management","signing-key-management"]
  },
  "host-to-app-routing": {
    s: "The mapping from the requested hostname and path to a specific application definition and the place its traffic should go.",
    d: "The router looks up the server name, and sometimes the path, in a table built from application definitions, then selects the policy to apply and the upstream: a public service, a connector group or a specific address. Matching must be exact enough that one application cannot capture another's traffic, and fast enough to run on every request. Wildcard hostnames, path-based sharing of a host, and applications that change their addresses all complicate it. A missing or ambiguous match must default to deny.",
    k: ["Hostname-per-application versus path-based routing: separate hostnames isolate cookies and policy cleanly; shared hosts with paths conserve names and mix applications in one origin.", "Static route tables versus dynamic discovery: static tables are predictable and reviewable; dynamic discovery follows the infrastructure but can publish something nobody approved."],
    p: ["An overly broad wildcard route exposes a new internal service the moment its DNS record appears.", "Path rules that normalize differently from the application let encoded paths reach protected areas."],
    v: "Request a hostname with no definition and confirm an immediate deny with a not-found reason. Request two applications sharing a domain and confirm each hits its own policy and upstream.",
    dep: ["application-definitions","edge-listener-and-tls"]
  },
  "request-authentication": {
    s: "The check at the edge that a request carries a valid, unexpired session or token tied to a known user and device.",
    d: "On each request the proxy reads the session cookie or bearer credential, verifies its signature and expiry locally and loads the session record. It compares session claims against the request's device certificate where one exists, and rejects tokens issued for another application or audience. Verification has to be local to stay fast, which means revocation relies on short lifetimes or a pushed deny list. Cookies add their own concerns: scope, secure flags and cross-site behavior.",
    k: ["Self-contained signed tokens versus server-side session lookup: signed tokens validate without a network call but are hard to revoke; lookups revoke instantly at the cost of a store in the request path.", "Cookie sessions for browsers versus tokens for programs: each suits its client, and supporting both doubles the paths to test."],
    p: ["A token accepted for any audience lets one application's credential unlock another.", "Clock drift between edge nodes makes valid tokens look expired or expired tokens look valid."],
    v: "Replay a valid session cookie after it has been revoked, and a token issued for application A against application B. Confirm both are refused, and that a tampered signature is refused in under the normal request time.",
    dep: ["session-issuance","signing-key-management","session-revocation"]
  },
  "identity-assertion-to-app": {
    s: "How the proxy tells the application who the user is, usually through a signed header or token the application verifies.",
    d: "After allowing a request, the proxy adds a signed assertion carrying user identity, groups and sometimes device state, for the application to read. Applications that cannot do their own sign-in rely on it to personalize and authorize. The application must verify the signature and must not be reachable except through the proxy, or anyone could forge the header. Rotating the signing key without breaking applications, and stripping any identity header the client supplied, are the common work.",
    k: ["Signed token versus plain trusted headers: a signed token is safe on a shared network but needs the application to verify it; plain headers are simpler and depend entirely on network isolation.", "Minimal claims versus rich claims: minimal claims limit leakage and force lookups; rich claims save calls and go stale in long sessions."],
    p: ["A client-supplied identity header passed through unchanged lets any user impersonate another.", "An application reachable directly on its internal address accepts forged assertions."],
    v: "Send a request with a forged identity header directly to the application and through the proxy. Confirm direct access fails or is ignored, and the proxy path overwrites the header with the verified identity.",
    dep: ["signing-key-management","request-authentication","claim-and-group-mapping"]
  },
  "ssh-and-rdp-proxying": {
    s: "Brokering remote shell and desktop sessions so the proxy authenticates the user and the target host without long-lived credentials on the user's device.",
    d: "For shell access the proxy terminates the user's connection, checks policy, then connects to the target using a short-lived certificate or a managed credential, so users hold no standing keys. For desktop protocols it relays the session and can enforce clipboard and file-transfer rules. The proxy can attribute each command or session to a person, which shared accounts otherwise blur. It must handle protocol quirks, long idle periods and host key verification in both directions.",
    k: ["Short-lived certificates versus stored keys: certificates remove standing credentials and need a signing service in the login path; stored keys are simple and leak persistently.", "Protocol-aware proxying versus raw forwarding: awareness enables recording and per-command policy, while raw forwarding is simpler and blind."],
    p: ["Target hosts that still accept old static keys let users bypass the proxy altogether.", "Idle timeouts on the proxy cut long-running jobs, leaving partial changes."],
    v: "Open a shell through the proxy, confirm the target's log shows a short-lived certificate tied to the user, and that direct login with the user's old static key is refused.",
    dep: ["connector-agent","session-recording","signing-key-management"]
  },
  "raw-tcp-proxying": {
    s: "Carrying arbitrary TCP and sometimes UDP services, such as databases and internal tools, through the proxy where no web layer exists.",
    d: "Without HTTP there is no cookie or redirect, so authentication happens when the connection is opened, usually via the client agent presenting the session and device identity. The proxy applies policy to the destination and port, then relays bytes. It cannot see inside the traffic unless it understands the protocol. Access is granted per application definition with explicit ports, to avoid opening a whole network range. Long-lived connections raise the question of when to re-check policy.",
    k: ["Per-service definitions versus network-range access: per-service definitions keep access narrow and cost more administration; ranges are quick and recreate a flat network.", "Authenticate at connect versus per message: connect-time checks are cheap and let a stale connection run on, while per-message checks need protocol knowledge."],
    p: ["Port ranges defined too widely let users reach services nobody meant to publish.", "A connection opened before a revocation keeps flowing until it drops."],
    v: "Open a database client connection to an allowed host and port, then to a disallowed port on the same host. Confirm only the first connects and both attempts appear in the flow log with the user and device.",
    dep: ["per-app-tunnel-on-device","connector-agent","long-lived-connection-policy"]
  },
  "websocket-and-streaming": {
    s: "Handling connections that upgrade or stay open, such as WebSockets and streaming responses, without buffering them or skipping policy.",
    d: "After the initial request passes policy, the connection upgrades and carries messages for minutes or hours. The proxy must forward frames without buffering whole responses, keep idle timers sensible and propagate flow control. Policy was evaluated once, at upgrade, so the proxy needs a way to end the connection when the session is revoked or posture changes. Streaming responses and server-sent events behave similarly and are broken by intermediaries that buffer.",
    k: ["Evaluate at upgrade only versus periodically: upgrade-only is simple and leaves revoked users connected; periodic checks close the gap and add load.", "Strict idle timeout versus long timeout: short timeouts save resources and drop quiet but valid connections; long ones keep sockets open for dead clients."],
    p: ["Response buffering in the proxy makes streaming applications appear frozen.", "A revoked user keeps receiving live data over an already open WebSocket."],
    v: "Open a WebSocket, revoke the session, and measure how long the stream continues. It should end within the documented bound, and a streaming response should deliver its first bytes without waiting for completion.",
    dep: ["long-lived-connection-policy","edge-listener-and-tls","session-revocation"]
  },
  "service-to-service-access": {
    s: "Authorizing programs and automation, not people, to reach applications through the same proxy using workload credentials.",
    d: "Scripts, build jobs and other services cannot complete an interactive login. They present a workload identity: a service token, a client certificate or a short-lived token exchanged from a trusted platform identity. The proxy evaluates policy over the service's identity just as for a user, with conditions suited to automation such as source network and allowed paths. It is hard because service credentials tend to be long-lived, shared and over-permitted, and nobody notices when they are stolen.",
    k: ["Short-lived exchanged tokens versus static service tokens: exchanged tokens limit theft damage and need a trust relationship with the issuing platform; static tokens work anywhere and live too long.", "Per-service policy versus a shared automation role: per-service policy gives clear attribution and more rules; a shared role is easy and unattributable."],
    p: ["A service token stored in a repository grants permanent access until somebody notices.", "Automation allowed from any source address keeps working from an attacker's machine."],
    v: "Call an application from a job using an exchanged token and confirm it succeeds and logs the service name. Reuse the token after expiry, and from an unlisted address, and confirm both are refused.",
    dep: ["workload-identity-tokens","request-authentication","policy-evaluation-engine"]
  },
  "content-inspection-hooks": {
    s: "Points in the request path where the proxy can pass traffic to scanners for malware, data-loss rules or application-layer checks.",
    d: "Because the proxy decrypts traffic, it can hand uploads, downloads or selected requests to an inspection service, or apply rules such as blocking file types and restricting copy actions in a remote session. Inspection adds latency and can fail, so it is applied selectively, by application or by data type, with defined behavior when the scanner is slow. The harder question is policy: what counts as sensitive, and how a block is explained to the user without exposing the rule.",
    k: ["Inline inspection versus out-of-band scanning: inline blocks before data leaves and adds delay to every transfer; out-of-band is invisible to users and detects only after the fact.", "Inspect everything versus selected applications: full inspection maximizes coverage and cost, while selection keeps latency down and leaves gaps."],
    p: ["Scanner timeouts silently let large files through unscanned.", "Inspecting traffic of personal or health applications creates privacy and legal exposure."],
    v: "Upload a harmless test file known to trigger the scanner and confirm it is blocked and logged, then stop the scanner and confirm the configured fail-open or fail-closed behavior occurs exactly as written.",
    dep: ["edge-listener-and-tls","log-redaction"]
  },
});
