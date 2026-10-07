// Details for the zero-trust access proxy plate, part 2: sessions, policy, device posture.
ATLAS.details("zero-trust-proxy", {
  "session-issuance": {
    s: "Creating the proxy's own session after a successful login, recording who the user is, which device they used and how they authenticated.",
    d: "On a valid identity-provider assertion, the proxy creates a session carrying the user, groups, authentication method and time, the device identifier and an expiry, signs it and hands it to the client as a cookie or token. Subsequent requests are verified against it without calling the identity provider. What goes into the session decides what the policy engine can see later, so fields such as authentication strength and device must be captured at issuance, not reconstructed. Session records must be small enough to carry and rich enough to evaluate.",
    k: ["Opaque session identifier versus self-contained token: opaque identifiers allow instant revocation through a store; self-contained tokens avoid a lookup and rely on short expiry.", "Capture groups at login versus fetch on demand: capturing is fast and goes stale; fetching is current and adds a dependency on the directory."],
    p: ["Group membership frozen at login keeps a demoted user's privileges for the whole session.", "Sessions that omit the authentication method cannot support a later step-up decision."],
    v: "Sign in, decode or inspect the session record, and confirm it holds the user, device, authentication method and expiry. Change the user's group in the directory and confirm the documented refresh behavior applies.",
    dep: ["signing-key-management","idp-federation","claim-and-group-mapping"]
  },
  "session-cookie-scope": {
    s: "The cookie attributes and domain choices that decide which hostnames receive a session and how it resists theft and cross-site misuse.",
    d: "A cookie set for a parent domain is sent to every application under it, which is convenient and makes one compromised application a risk to all. A host-only cookie isolates applications and requires separate sign-in or a token exchange per application. Attributes such as secure, HTTP-only and same-site limit exposure to scripts and cross-site requests. Choices interact with embedded content, single-page applications and third-party contexts, where strict settings break legitimate flows.",
    k: ["Parent-domain cookie versus per-host cookie: a shared cookie gives single sign-on across apps with wide exposure; per-host cookies isolate apps and need an exchange for each.", "Strict same-site versus lax: strict blocks most cross-site forgery and breaks links arriving from other sites; lax keeps links working and allows some cross-site requests."],
    p: ["A cookie scoped to the whole company domain is sent to a low-trust internal tool that can read or log it.", "Missing secure flags allow a session to leak over a plain connection on shared networks."],
    v: "Request a second application on the same parent domain and inspect which cookies it receives. Run a cross-site request and confirm the session cookie is withheld as configured.",
    dep: ["session-issuance","host-to-app-routing"]
  },
  "lifetime-and-idle-timeouts": {
    s: "The limits on how long a session lasts in total and how long it may sit unused before it ends.",
    d: "An absolute lifetime caps the exposure of any one login, and an idle timeout ends sessions people have walked away from. Values differ by application sensitivity and device trust: short for administrative tools, longer on managed devices. Idle detection needs the proxy to see activity, which is invisible for long-lived connections that carry no new requests. Short timeouts push users to reauthenticate often, and users who resent it find workarounds, so values have to match how people actually work.",
    k: ["Short lifetimes versus long lifetimes: short ones limit theft impact and add prompts; long ones feel smooth and extend exposure.", "Sliding expiry versus fixed expiry: sliding keeps active users signed in and lets a stolen session live indefinitely if kept busy; fixed bounds it and interrupts work."],
    p: ["A sliding timeout with no absolute cap keeps a stolen session alive forever as long as it is used.", "Idle timers ignore open streaming connections, so active sessions are cut mid-task."],
    v: "Leave a session idle past its timeout and confirm the next request redirects to sign-in. Keep a session active past the absolute limit and confirm it is ended anyway.",
    dep: ["session-issuance","reauthentication-policy"]
  },
  "session-device-binding": {
    s: "Tying a session to the device that created it so a copied cookie or token does not work from another machine.",
    d: "The proxy binds the session to a device property: a client certificate, a hardware-held key that signs challenges, or a token-binding mechanism. On each request or periodically, the client proves it holds the key, and a session presented without the proof is rejected. This defeats the common attack of stealing a session cookie from a browser and replaying it elsewhere. It is harder in agentless browser cases, where support for proof of possession varies, and it adds a cryptographic step to the request path.",
    k: ["Bound sessions versus bearer sessions: binding stops replay from a stolen cookie and requires key support on the client; bearer sessions work everywhere and give a copy full access.", "Prove possession per request versus periodically: per request is strongest and costs latency; periodic proof is cheaper with a window for replay."],
    p: ["Browsers without proof-of-possession support fall back to unbound sessions, and nobody notices.", "Sharing the device key across virtual machine clones breaks the one-device assumption."],
    v: "Copy a valid session from one machine to another and replay it. Confirm the second request is refused for lack of device proof, while the original machine continues to work.",
    dep: ["device-identity-certificates","session-issuance"]
  },
  "reauthentication-policy": {
    s: "The rules for when a signed-in user must prove identity again, based on time, application sensitivity or changed circumstances.",
    d: "Triggers include session age, a request for a sensitive application, a change of network or location, a drop in device posture, or an administrator forcing a reset. The proxy can require a full login, a stronger factor or a quick confirmation. It must remember what the user already proved, so a recent strong login satisfies a later requirement. Reauthentication is also where the identity provider's own session matters: a silent redirect may succeed without any prompt, which satisfies the flow and not the intent.",
    k: ["Fixed interval versus event-driven: intervals are predictable and prompt needlessly; event-driven prompts target risk and require reliable signals.", "Force a fresh prompt versus accept the provider's session: forcing proves current presence and annoys users; accepting is smooth and may reuse a day-old login."],
    p: ["A silent redirect to a still-valid identity provider session satisfies the check without the user doing anything.", "Reauthentication prompts during a form submission lose the user's input."],
    v: "Require recent authentication of five minutes on a test application. Wait ten minutes and confirm a real prompt appears, not a silent redirect, and that the session then records the new authentication time.",
    dep: ["authentication-context-requests","lifetime-and-idle-timeouts"]
  },
  "concurrent-session-limits": {
    s: "A cap on how many active sessions one user or device may hold, to limit credential sharing and spot account takeover.",
    d: "The proxy counts active sessions per user, and for sensitive applications per device or location, and refuses or replaces the oldest when the limit is reached. It also detects patterns such as the same account active from distant places in a short time. Limits are blunt: legitimate users hold several sessions across laptop, phone and browser profiles. The count must be consistent across edge nodes, which means a shared store with some delay or an approximate local count.",
    k: ["Hard limit versus alert only: hard limits stop sharing and block people with legitimate multiple devices; alerts keep access and depend on someone acting on them.", "Global counting versus per-node counting: global is accurate and needs a shared store; per-node is fast and lets a user exceed the limit by spreading across nodes."],
    p: ["Closing the oldest session logs out the user who is actually working while the attacker keeps the newest.", "Per-node counts allow the cap to be exceeded by the number of edge nodes."],
    v: "Sign in on more devices than the limit allows and confirm the documented behavior, and that the log records which session was refused or replaced and why.",
    dep: ["session-issuance","anomaly-detection"]
  },
  "session-revocation": {
    s: "Ending one or all of a user's sessions immediately, in response to offboarding, a lost device or a detected compromise.",
    d: "Revocation can be triggered by an administrator, by an identity-provider event, by a risk decision or by the user. The control plane records it and pushes a deny entry, or a minimum session issue time for the user, to every edge node. Nodes check each request against that list, so the speed of the push sets the exposure window. Existing tunnels and open connections must be torn down too, not only future requests. It is hard because revocation must reach every node, including ones that are partitioned or restarting.",
    k: ["Push a deny list versus rely on short token life: pushing revokes in seconds at the cost of distribution machinery; short life needs nothing extra and leaves a window as long as the lifetime.", "Revoke by session versus by user and time: per-session revocation is precise and large; a per-user cutoff time is compact and ends all older sessions at once."],
    p: ["A node that missed the push keeps honoring a revoked session after others reject it.", "Revoking sessions but not open tunnels leaves a connection running until it drops."],
    v: "Disable a test user while they hold an open session and an open tunnel. Measure the time until a new request and the open connection are both refused at every edge node, and compare it to the stated target.",
    dep: ["configuration-distribution","edge-policy-cache","continuous-evaluation-loop"]
  },
  "long-lived-connection-policy": {
    s: "The rules for connections that outlast a single policy decision, including when to recheck, when to cut off and what to do when a check fails.",
    d: "Database sessions, shells and streams can last for hours. The proxy attaches the session and posture state to the connection and re-evaluates on a timer and on change events. When the answer becomes deny, it can close the connection, let it finish a transaction, or warn first. Different protocols tolerate interruption differently: killing a shell mid-command is easy, while cutting a database session in a transaction rolls back work. Choosing the policy per application is part of defining it.",
    k: ["Cut immediately versus drain gracefully: immediate cutoff is safest and may corrupt in-progress work; draining finishes the work and lengthens exposure.", "Fixed recheck interval versus event-driven: intervals are simple and mostly wasted; events are prompt and depend on timely signals reaching the edge."],
    p: ["Connections established before a policy change are never rechecked, so old access outlives the rule that granted it.", "Cutting a session at a fixed time interrupts a long batch job in a bad state."],
    v: "Open a long connection, then change policy to deny that user. Confirm the connection is closed within the stated window and that the log records the reason and the policy version that ended it.",
    dep: ["continuous-evaluation-loop","session-revocation"]
  },
  "application-definitions": {
    s: "The records describing each protected application: its hostnames or addresses, protocols, owners and the policy attached to it.",
    d: "An application definition names what is being protected and where it lives, such as a hostname, a connector group, ports and the protocol, and links it to a policy and an owner. Everything else keys off it: routing, steering rules for agents, the launcher portal and logs. Definitions should be created deliberately, with a review, rather than discovered and published automatically. A stale definition, such as one for a decommissioned service, leaves a path whose destination might be reassigned to something else.",
    k: ["Explicit definitions versus broad network access: explicit definitions give per-application policy and logs and take effort to build; network access is fast and recreates implicit trust.", "Central ownership versus delegated ownership: central keeps consistency and bottlenecks; delegated lets owners move quickly and need guardrails."],
    p: ["A decommissioned service's definition lingers and later routes to a different system that reused the address.", "Definitions with no named owner leave nobody to approve access requests or retire them."],
    v: "Create a definition for a test application and confirm it appears in routing, the launcher and logs. Delete it and confirm all three stop referencing it and the hostname returns deny.",
    dep: ["configuration-store","connector-groups-and-routing"]
  },
  "policy-model": {
    s: "The structure of an access rule: subjects, conditions, application, action and obligations, plus how rules are grouped and inherited.",
    d: "A rule says who, on what device, in what context, may reach which application, and with what requirements such as step-up or recording. Rules may be attached per application, per group of applications, or globally as guardrails. The model decides what administrators can express and how readable it stays. Too weak and exceptions pile up outside the system; too flexible and nobody can predict a decision. A good model makes the common case a single line and keeps every decision explainable.",
    k: ["Attribute-based rules versus role-based rules: roles are easy to understand and multiply; attributes express context precisely and are harder to audit.", "Allow-only rules versus allow and deny: allow-only is simple to reason about; explicit deny lets guardrails override grants and makes ordering matter."],
    p: ["Expressive models allow rules nobody can predict, so administrators stop trusting their own policy.", "Missing a way to say temporary produces permanent exceptions."],
    v: "Pick ten representative access cases and have two people, who have never seen the rules, predict the outcome from the policy text alone. Compare to the engine's actual results.",
    dep: ["application-definitions","user-and-group-conditions","context-conditions"]
  },
  "user-and-group-conditions": {
    s: "Rule conditions based on who the user is: individual accounts, directory groups, attributes such as department or employment type.",
    d: "These conditions read identity data from the session, which came from the identity provider's claims or a directory lookup. Groups are the usual unit because they stay maintained by the organization's existing processes. Attributes such as contractor status or region allow broader rules. Nested groups, large memberships and claims that exceed token size limits cause practical problems. The condition is only as accurate as the group data behind it and its age.",
    k: ["Group-based conditions versus per-user entries: groups scale and follow organizational change; per-user entries are precise and rot when people leave.", "Claims in the token versus directory lookup at decision time: claims are fast and stale; lookups are current and add a dependency and latency."],
    p: ["Group claims truncated because of token size silently remove a user's access or, worse, add it.", "Nested group expansion makes a user a member of a sensitive group nobody realized."],
    v: "Add and remove a test user from a group and measure how long until the policy result changes. Test a user in a deeply nested group and one whose group list is large.",
    dep: ["claim-and-group-mapping","directory-lookup-cache"]
  },
  "context-conditions": {
    s: "Rule conditions about the circumstances of a request: time, network, location, protocol, requested path and method.",
    d: "Context conditions narrow access beyond identity: only during business hours, only from certain countries, only for read operations, only from a known office address. Location comes from the source address through a geolocation source, which is approximate and spoofable by proxies. Context is useful as one signal among several and fragile as a sole control. The engine needs these values on every request without a slow lookup, so they are derived at the edge and added to the decision input.",
    k: ["Network location as a condition versus as a signal: using it as a hard rule recreates network trust; using it to adjust risk keeps it from deciding alone.", "Strict time windows versus flexible access: windows reduce off-hours risk and block people in other time zones and on-call responders."],
    p: ["Geolocation errors lock out legitimate users on mobile carriers that route through another country.", "Time-based rules evaluated in the server's time zone instead of the user's block people at the wrong hours."],
    v: "Send test requests from addresses in an allowed and a disallowed country, and at times inside and outside the window. Confirm each decision matches the rule and the log shows the context values used.",
    dep: ["policy-model","risk-scoring"]
  },
  "policy-evaluation-engine": {
    s: "The component that takes a request's identity, device, context and application and returns allow or deny with the matching rule and obligations.",
    d: "The engine receives a decision input assembled at the edge and evaluates it against the compiled policy for that application. Evaluation must be fast, typically well under a few milliseconds, deterministic and explainable, returning not just a verdict but the rule and conditions that produced it. It may run inside the edge process, using a locally cached policy, or call a separate service. It has to deal with missing inputs, such as an unknown device, in a defined way, and must cope with policies that change while requests are being decided.",
    k: ["In-process evaluation versus a remote decision service: in-process is fastest and works through control-plane outages; remote centralizes logic and adds latency and a dependency.", "Compiled policy versus interpreted: compiling speeds each request and makes updates a build step; interpreting is flexible and slower."],
    p: ["Treating a missing attribute as false in one rule and true in another gives inconsistent decisions.", "Policy updated mid-request produces a decision that matches neither the old nor the new rules."],
    v: "Replay a day of recorded decision inputs through the engine and confirm the verdicts match the live decisions. Measure the 99th percentile evaluation time under production-like load.",
    dep: ["policy-model","edge-policy-cache","rule-ordering-and-default-deny"]
  },
  "rule-ordering-and-default-deny": {
    s: "How competing rules are combined and what happens when none match, with refusal as the starting point.",
    d: "When several rules match, the engine needs a combining rule: first match wins, deny overrides allow, or most specific wins. Whichever is chosen must be documented and visible in the editor. When no rule matches, the answer is deny. This is the core of the zero-trust stance: nothing is reachable merely by existing. Defining it clearly prevents the common failure where a new application is reachable by everyone because a broad earlier rule applied.",
    k: ["First match versus deny overrides: first match is intuitive and sensitive to order; deny overrides makes guardrails reliable and makes exceptions awkward.", "Global guardrail rules versus per-application rules only: global rules enforce company standards and surprise application owners who cannot see why access fails."],
    p: ["A broad allow rule placed early silently covers every application added later.", "Reordering rules in an editor changes decisions with no preview of the effect."],
    v: "Create overlapping allow and deny rules and a request that matches neither. Confirm the result follows the documented combining rule and the unmatched request is denied with a no-rule reason.",
    dep: ["policy-model"]
  },
  "policy-as-code": {
    s: "Keeping policy in version-controlled files that go through review, tests and automated deployment, rather than only editing in a console.",
    d: "Policy is written in a declarative format, stored in a repository, validated by a linter and tests, reviewed by the application owner and security, then applied through the control plane's API. Every change has an author, a reason and a rollback. The console becomes a viewer, or edits go through the same pipeline. The challenge is keeping the repository and live system in agreement: console edits made in an emergency drift away from the code and are overwritten at the next apply.",
    k: ["Code-driven policy versus console-driven: code gives review, history and testing at the cost of a slower path for urgent changes; console edits are fast and unreviewed.", "One repository for all policy versus per-team repositories: one gives uniform review; per-team gives ownership and makes global checks harder."],
    p: ["Emergency console edits are overwritten by the next automated apply, restoring the access that was just blocked.", "Tests that cover syntax but not outcomes let a valid but wrong rule ship."],
    v: "Open a change that grants a group access, confirm review and tests run, and that after merge the live policy matches the repository and the audit log names the change and its author.",
    dep: ["policy-simulation","admin-roles-and-change-control","admin-console-and-api"]
  },
  "policy-simulation": {
    s: "Running a proposed policy against recorded or synthetic requests to show who would gain or lose access before it takes effect.",
    d: "The simulator replays recent decision inputs from the logs, or enumerates users and applications, through the proposed rules and the current rules, and reports differences: newly allowed, newly denied, and unchanged. It lets an administrator see that a tightening would lock out two hundred people before deploying it. Quality depends on the log containing enough input detail, and on covering rare cases, such as quarterly users, that a short log window misses.",
    k: ["Replay of real traffic versus synthetic test cases: replay finds surprises from real behavior; synthetic cases cover rare paths and are only as good as their author's imagination.", "Report-only mode in production versus offline simulation: report-only sees live conditions and delays enforcement; offline is safe and approximate."],
    p: ["A one-day replay window misses monthly users, who are locked out when the policy ships.", "Simulation using today's group membership says nothing about yesterday's decisions."],
    v: "Tighten a rule in simulation, predict the affected users from the report, then enforce it on a canary group and confirm the actual denials match the prediction.",
    dep: ["access-decision-logs","policy-evaluation-engine"]
  },
  "exceptions-and-break-glass": {
    s: "Controlled ways to bypass or loosen policy for an emergency or a justified exception, with approval, time limits and loud logging.",
    d: "An exception is a recorded rule with an owner, a reason and an end date. Break glass is an emergency account or procedure that works when normal paths are down, such as when the identity provider is unavailable, and is monitored closely. Both are necessary and both erode the system if unmanaged. Exceptions should expire, show up in review reports and generate an alert when used. Break-glass credentials need protection stronger than ordinary ones, because they bypass the controls everything else relies on.",
    k: ["Expiring exceptions versus open-ended: expiry forces review and generates renewal work; open-ended exceptions never get revisited.", "Break glass on the same path versus an independent path: the same path is simpler and fails with the proxy; an independent path survives outages and must be secured separately."],
    p: ["Exceptions without end dates become permanent policy that nobody can explain.", "Break-glass credentials stored where an outage also blocks access to them."],
    v: "Use the break-glass procedure in a drill, confirm it works with the identity provider disabled, that it alerts security within minutes, and that its access ends and credentials rotate afterward.",
    dep: ["policy-model","admin-audit-log"]
  },
  "posture-signal-collection": {
    s: "Gathering facts about a device, such as disk encryption, patch level and running security software, and reporting them to the proxy.",
    d: "The agent or an endpoint-management tool queries the operating system, security tools and configuration and sends a signed report to the proxy on a schedule and at events like login. Browser-only access can collect a limited set through an extension or by reading a certificate issued by management. Collection must be accurate across operating system versions and not easy to fake: a script that sends a clean report from a compromised machine defeats the point. Local checks are cheap, so the main cost is frequency and consistency.",
    k: ["Agent-collected versus management-reported posture: agent collection is direct and lets the proxy ask for what it needs; management data is authoritative for managed devices and lags.", "Frequent collection versus on-demand: frequent gives fresh data and battery and bandwidth cost; on-demand is cheap and slow at decision time."],
    p: ["A report built from easily changed local settings can be forged by anyone with administrator rights on the device.", "Checks that behave differently on one operating system release report false failures after an update."],
    v: "Disable disk encryption on a test device, and confirm the next report shows it and the posture result changes within the documented time. Re-enable it and confirm recovery.",
    dep: ["client-agent","posture-attestation"]
  },
  "posture-rule-library": {
    s: "The catalog of named checks, such as encryption on, patched within thirty days or firewall enabled, that policy can require.",
    d: "Each check defines the signal, the operating systems it applies to, the pass condition and how to explain a failure to the user. Policy references checks by name, so a change to the definition updates every rule using it. A good library is small, tied to actual risks and tested for false failures. Thresholds like patch age require care: too strict and many devices fail on release day; too loose and the check means nothing.",
    k: ["Few strong checks versus many granular checks: few are easy to explain and remediate; many give precision and an unmanageable list of reasons to fail.", "Centrally defined versus per-application checks: central definitions give consistency; per-application checks fit sensitive systems and drift apart."],
    p: ["A strict patch-age check fails nearly everyone for a day after each vendor release.", "Checks without a remediation message produce tickets rather than fixes."],
    v: "Run each check against a known passing and a known failing device on every supported operating system, and confirm both the result and the user-facing remediation text are correct.",
    dep: ["posture-signal-collection","denial-page"]
  },
  "device-identity-certificates": {
    s: "Certificates issued to enrolled devices so the proxy can tell a known corporate device from any other machine using valid credentials.",
    d: "A certificate authority issues each device a certificate whose private key lives in a hardware module or the operating system's protected store. The device presents it during connection, and the proxy checks the chain and a revocation status. The certificate identifies the device, not the user, and is combined with the user's login. Issuance, renewal and revocation are operational work: certificates expire, devices are lost, and a copied private key from software storage breaks the guarantee.",
    k: ["Hardware-protected keys versus software keys: hardware keys resist copying and are not universal; software keys work everywhere and can be exported by malware.", "Short-lived certificates versus long-lived: short ones reduce reliance on revocation lists and need reliable automated renewal; long ones are simple and hard to revoke in time."],
    p: ["Certificates that expire during travel leave a device locked out with no way to renew.", "Revocation lists that edge nodes fetch rarely let a lost device keep working."],
    v: "Present a valid device certificate and one revoked a minute ago. Confirm the first is accepted and the second is refused within the revocation target, and a certificate from an unknown issuer is refused.",
    dep: ["endpoint-management-integration","signing-key-management"]
  },
  "posture-attestation": {
    s: "Cryptographic evidence from the device's hardware or operating system that its reported state is genuine and not made up by software.",
    d: "A hardware root of trust can sign a statement of boot state and configuration, which a verifier checks against known good values and a vendor chain. This raises posture from claimed to proven. Attestation is available on some platforms and not others, so policy often uses it as a stronger tier for sensitive applications. It adds enrollment steps and verification infrastructure, and devices with outdated firmware may fail attestation for reasons unrelated to compromise.",
    k: ["Attested posture versus self-reported: attested data resists tampering and covers fewer devices; self-reported data is universal and forgeable.", "Verify at each report versus at enrollment only: per-report verification catches change and costs processing; enrollment-only is cheap and goes stale."],
    p: ["Making attestation mandatory before the fleet supports it locks out older hardware wholesale.", "Accepting an attestation without checking freshness allows replay of an old clean statement."],
    v: "Submit a genuine attestation and one replayed from an earlier session. Confirm the first verifies and the second is rejected for staleness, and that policy requiring attestation denies a device that has none.",
    dep: ["device-identity-certificates","posture-signal-collection"]
  },
  "posture-freshness": {
    s: "Rules for how recent a posture report must be to count, and what happens when it is too old.",
    d: "Each posture result carries a timestamp. Policy states a maximum age, for example fifteen minutes for sensitive applications and a day for others. When a report is older, the proxy can deny, ask the agent for a fresh report, or treat the result as unknown. Short ages give accurate decisions and put load on devices and the pipeline; devices that are asleep or offline cannot respond. Clock differences between device and edge also matter, so freshness is measured on the server's receive time.",
    k: ["Request a fresh report at decision time versus use the last report: asking gives current data and adds a round trip; using the last report is fast and may be stale.", "Deny stale posture versus degrade to lower access: denial is safe and interrupts users; degraded access keeps work moving and defines a new tier."],
    p: ["Measuring age by the device's own clock lets a wrong clock make an old report look new.", "Sleeping laptops return with stale posture and are denied until the next report, with no explanation."],
    v: "Stop the agent's reporting, wait past the allowed age, and confirm the next request is denied or degraded exactly as configured with a stale-posture reason. Resume reporting and confirm access returns.",
    dep: ["posture-signal-collection","policy-evaluation-engine"]
  },
  "managed-device-classification": {
    s: "Deciding whether a device is organization-managed, personal or unknown, since policy often gives each a different level of access.",
    d: "Classification comes from the device certificate, an entry in the endpoint-management inventory, or the presence of the agent. Managed devices can reach everything policy allows; personal devices may get web-only or read-only access; unknown devices may get only a landing page. The classification must be hard to claim falsely, so it rests on a credential only management can issue and not on a user's say-so. Edge cases include contractors on their own equipment and devices in the middle of being enrolled.",
    k: ["Binary managed versus unmanaged versus tiers: two classes are simple and coarse; tiers fit more situations and multiply rules.", "Classify at enrollment versus on each request: enrollment is cheap and ignores later removal from management; per-request keeps it current."],
    p: ["Classifying by a user-agent string or user-supplied label lets anyone present as managed.", "Devices removed from management keep their managed classification because nothing updates it."],
    v: "Access an application with a managed device, a personal device with the agent and an unknown browser. Confirm each gets the intended tier, and remove the managed device from inventory and confirm it loses the status.",
    dep: ["device-identity-certificates","endpoint-management-integration"]
  },
  "endpoint-management-integration": {
    s: "The link between the proxy and the system that manages company devices, supplying inventory, compliance state and certificates.",
    d: "The endpoint-management system knows which devices exist, who owns them and whether they meet baseline settings. The proxy reads that data through an API or receives events, and may rely on the system to deploy the agent and issue device certificates. Compliance flags can feed policy directly. Integration lag and mismatched identifiers are the usual problems: one system calls a device by serial number, another by certificate subject, and records can be duplicated after a reimage.",
    k: ["Pull inventory on a schedule versus receive events: scheduled pulls are simple and lag; events are prompt and need delivery handling.", "Trust the management system's compliance flag versus recheck locally: trusting avoids duplicate work and inherits its mistakes; rechecking doubles collection."],
    p: ["Duplicate device records after a reimage make one machine appear compliant while another copy is not.", "An outage of the management system blocks compliance data and so access for everyone."],
    v: "Mark a device noncompliant in the management system and measure how long until the proxy denies the application that requires compliance. Remove the mark and confirm access returns.",
    dep: ["posture-signal-collection","configuration-distribution"]
  },
});
