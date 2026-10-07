// Details for the VPN gateway plate, part 1: configuration, distribution, logging and monitoring.
ATLAS.details("vpn-gateway", {
  "admin-interface": {
    s: "The web console, command line and API through which operators define tunnels, users, policies and certificates, and inspect live sessions on the gateway.",
    d: "Operators work through a web interface, a command line or an automation API that all call the same underlying configuration functions. Access is itself authenticated, role-limited and usually restricted to a management network so the gateway's control surface is not exposed to the same internet it serves. Changes are staged and applied through the commit path. It is hard because the management plane has the power to read every key and redirect all traffic, so it is the most valuable target on the device.",
    k: ["Management on a separate interface vs. on the tunnel-facing interface: isolation shrinks exposure; remote administration then needs its own secure path.", "One API behind every front end vs. separate code per front end: behavior stays consistent, but the API must be complete before the console can use it."],
    p: ["A management page reachable from the public side turns any flaw in it into a way to take over every tunnel.", "Shared administrator accounts leave the audit trail unable to say who changed a policy."],
    v: "From an address outside the management network, confirm the admin port refuses connections. Then make one change as a limited-role administrator and confirm it is rejected when it exceeds that role.",
    dep: ["config-store", "audit-trail"]
  },
  "config-store": {
    s: "The persistent, versioned record of everything the gateway is told to do: peers, policies, address pools, certificates and settings, with the current and previous versions retained.",
    d: "Configuration is held as structured data with a schema, separate from the runtime state derived from it. Each committed version is kept so an operator can compare or return to an earlier one. Secrets are stored apart or encrypted so a configuration export does not leak keys. Runtime components read from it at start and on reload. The hard parts are schema changes across software upgrades, keeping a cluster's members identical, and making sure that what is stored is what is actually running.",
    k: ["Declarative desired state vs. imperative commands: state can be diffed and re-applied after a reboot, but one-off emergency actions become awkward to express.", "Secrets inside the main configuration vs. a separate store: one file is simple to back up, but exports and support bundles then carry keys."],
    p: ["Backups that include private keys in plain form leave a copy of every identity on a file share.", "A configuration that differs between cluster members makes failover change behavior silently."],
    v: "Commit a change, export the configuration, restore it onto a clean gateway and confirm the same tunnels come up and the export contains no private key material in readable form.",
    dep: []
  },
  "config-validation-commit": {
    s: "Checks a proposed change for syntax, conflicts and lockout risk, then applies it atomically with an automatic rollback if the operator cannot reconnect.",
    d: "A candidate configuration is validated against the schema and against semantic rules: overlapping address pools, selectors that conflict, a certificate that has expired, a rule that would drop the management session. It is then applied to the running system in one step so partial changes never exist. Many gateways add a confirmed commit: the change reverts unless confirmed within minutes. Hard cases include changes that must reset live tunnels, and applying to several cluster members consistently.",
    k: ["Confirmed commit with timed rollback vs. immediate commit: remote mistakes are recoverable, but a rollback also drops tunnels that were set up in the meantime.", "Full replace on commit vs. incremental diff: replacing is simple to reason about, but resets tunnels that did not change."],
    p: ["A change that removes the route to the management network applies cleanly and strands the operator with no way back.", "Validation that checks syntax only lets a conflicting selector go live and break an existing site."],
    v: "Commit a deliberately broken policy that blocks the admin session, do not confirm, and observe the gateway revert within the timeout while unrelated tunnels stay up throughout.",
    dep: ["config-store"]
  },
  "client-profile-generator": {
    s: "Builds the per-user or per-group connection settings a client needs: gateway names, protocol, trust anchors, routes, DNS and authentication method.",
    d: "From the gateway configuration and the user's group, it produces a profile file or provisioning record in a format the client understands. It embeds or references the certificate authority to trust, the server names or addresses to try, accepted algorithms, the routes and DNS servers to apply and how to authenticate. Profiles can be templated per department. The hard part is that the profile and the gateway must agree exactly, including the identity the client expects the server to present, so changes to either side need coordinated roll-out.",
    k: ["Generated profiles vs. hand-written client configuration: generation keeps clients consistent, but produces a bulk artifact to distribute whenever a server detail changes.", "Embedding secrets in the profile vs. enrolling them separately: one file is convenient, yet any copy of it grants access."],
    p: ["A profile that pins an old server certificate stops every client from connecting on the day it is renewed.", "Profiles with an embedded shared secret get forwarded in email and then cannot be revoked per person."],
    v: "Generate a profile, import it into a clean client and confirm it connects, shows the intended server identity and applies the expected routes and DNS without any manual edit.",
    dep: ["config-store", "access-policy-model"]
  },
  "profile-distribution": {
    s: "The channel through which profiles and enrollment tokens reach client devices: a self-service portal, device management, email links or a configuration endpoint on the gateway.",
    d: "A person may download a profile from an authenticated portal, a device management system may push it silently, or the client may fetch it from a configuration endpoint after signing in. The channel must authenticate the requester and protect the profile in transit. Some designs have the client retrieve updated settings at each connect so changes reach it without a re-install. The difficulty is trust bootstrapping: the first profile has to arrive over a channel the client can already trust.",
    k: ["Pull at each connect vs. push by device management: pull keeps settings current without extra infrastructure, but needs the client to reach the gateway first.", "Self-service download vs. managed push: self-service scales to personal devices, while managed push gives control over which devices hold access."],
    p: ["A download link that never expires lets a former employee fetch a working profile after leaving.", "Distributing over an unauthenticated page lets an attacker substitute a profile that points at a hostile gateway."],
    v: "Download a profile as an authorized user and as an unauthenticated visitor and confirm only the first succeeds. Then change a route on the gateway and confirm a connected client receives it at next connect.",
    dep: ["client-profile-generator", "identity-provider-federation"]
  },
  "client-software-update": {
    s: "Delivers new client versions and enforces a minimum version, so protocol fixes and algorithm changes reach the endpoints that depend on them.",
    d: "The gateway or a management system advertises the current and minimum acceptable client versions. Clients check at connect, download signed packages, verify the signature before installing and may refuse to connect while below the minimum. This is how an algorithm can be retired, since clients must be able to speak the replacement first. It is hard because clients are on devices the operator may not manage, and an update that breaks connectivity removes the very channel needed to deliver the fix.",
    k: ["Enforced minimum version vs. advisory notice: enforcement lets old algorithms be retired, but locks out devices that cannot update.", "Updates over the tunnel vs. out of band: in-tunnel updates are convenient, but a broken client cannot reach the update."],
    p: ["Unsigned or weakly verified packages let a network attacker push a hostile client to every user.", "A minimum version raised before the new client is widely available locks out the whole workforce."],
    v: "Raise the minimum version in a test group and confirm an older client is told to update, receives a package whose signature verifies, and then connects, while a tampered package is rejected.",
    dep: ["client-profile-generator"]
  },
  "multi-site-orchestration": {
    s: "Coordinates configuration, keys and policy across many gateways and branch sites so that they stay consistent without being edited one at a time.",
    d: "A central controller holds the intended topology and policy, pushes the resulting settings to each gateway, and collects their status. It allocates site addresses, issues credentials and generates the pairwise tunnel settings that would otherwise be typed by hand and grow with the square of the number of sites. Gateways keep working from their last known settings if the controller is unreachable. It is hard because partial rollouts leave sites with mismatched ends of the same tunnel.",
    k: ["Central controller vs. peer-configured sites: a controller removes pairwise typing errors, but becomes a high-value dependency whose outage blocks changes.", "Push on change vs. periodic pull by sites: push is faster, while pull works through restrictive networks and tolerates sites that were offline."],
    p: ["Rolling out a changed pre-shared secret to one end of a tunnel before the other drops that site until both match.", "A controller compromise gives an attacker the ability to reroute every site's traffic."],
    v: "Add a new branch in the controller and confirm it receives credentials and tunnels to every intended peer automatically, with the controller then disconnected and the existing tunnels still carrying traffic.",
    dep: ["config-store", "site-to-site-tunnels", "certificate-auth"]
  },
  "connection-logs": {
    s: "Per-session records of who connected, from which address, when, with what credential and policy, how long, and how much traffic they moved.",
    d: "On session start the gateway writes the authenticated identity, the source address, the assigned inner address, the protocol and cipher, and the policy applied. On end it records duration, byte and packet counts and the reason, such as user logout, timeout or error. Failed attempts are logged with the reason that was given internally, which is usually more detailed than what the client is told. The hard part is retention and privacy: these logs map people to times and places, and the inner address must be tied to identity in a way that survives address reuse.",
    k: ["Detailed per-session records vs. minimal counters: detail answers who did what later, but creates a store of personal data subject to retention limits.", "Reporting precise failure reasons in logs but generic ones to clients: operators can diagnose problems, and attackers cannot learn which accounts exist."],
    p: ["Logging only the inner address makes it impossible to name the user after the address pool has reused it.", "Verbose failure messages shown to the client reveal whether a username exists."],
    v: "Connect as a known user, send traffic, disconnect, and confirm one record shows the identity, source and inner address, policy, duration and byte counts that match the data actually sent.",
    dep: ["address-pool", "handshake-state-machine"]
  },
  "audit-trail": {
    s: "A tamper-evident record of every administrative action: who changed which setting, from where, when, and what it was before.",
    d: "Every login to the management interface and every committed configuration change is recorded with the actor, source, timestamp and a before-and-after difference. Records are forwarded off the device promptly and may be chained or signed so that deletion is detectable. It differs from connection logs, which describe users of the tunnel rather than people who run it. It is hard because the audit trail must survive the very compromise it is meant to reveal, so storing it only on the gateway is not enough.",
    k: ["Forwarding records off-box immediately vs. batching: immediate forwarding survives a compromise, but depends on a reachable collector and a queue for when it is not.", "Recording full diffs vs. only the fact of change: diffs support investigation, but may capture secrets that were part of the change."],
    p: ["Audit records stored only on the gateway are erased by an attacker with administrative access.", "Diffs that include a pre-shared secret copy it into a log with a wider readership than the configuration."],
    v: "Change a policy through the console, then confirm an off-device collector received a record naming the administrator, source address and old and new values within seconds, with secrets masked.",
    dep: ["admin-interface", "log-export"]
  },
  "tunnel-metrics": {
    s: "Counters and gauges per tunnel and per gateway: active sessions, throughput, handshake rate and failures, retransmissions, drops by reason, and crypto utilization.",
    d: "The data path increments counters on every packet, and the control plane counts handshakes by outcome. A collector samples them at intervals and exposes them to a monitoring system. Useful views include sessions over time, handshake failure by cause, packets dropped for replay, size or policy, and per-core crypto load. The difficulty is cardinality and cost: per-user series grow without bound, and counters on the hot path must not add locking that lowers throughput.",
    k: ["Per-user metrics vs. aggregates by group: per-user series help support, but multiply storage and monitoring cost with the user count.", "Counting every drop reason vs. one drop counter: reasons let operators separate attacks from misconfiguration, at a small per-packet cost."],
    p: ["Alerting on throughput alone misses a gateway where handshakes fail and no one is connecting.", "Per-core counters summed incorrectly hide a single saturated core behind a healthy average."],
    v: "Generate a known amount of traffic through one tunnel and confirm that the byte and packet counters match the sender's totals, and that a deliberately replayed packet increments the replay-drop counter.",
    dep: ["encap-decap-pipeline", "anti-replay-window"]
  },
  "health-probes": {
    s: "Active checks that exercise the gateway end to end, such as opening a test tunnel, authenticating and reaching an internal address, from the viewpoint of a real client.",
    d: "A synthetic client, usually running outside the gateway's network, performs a full connection: resolve the name, negotiate, authenticate, receive routes, then fetch a known internal resource and measure latency. Results feed alerting and load balancers so unhealthy gateways leave rotation. Probes cover each gateway and each protocol and port offered. They are hard to design because a green status can come from a probe that bypasses the path real users take, such as testing from inside the network.",
    k: ["Full end-to-end probes vs. port and process checks: end-to-end catches broken authentication and routes, but is slower and needs a dedicated probe identity.", "Probing from outside the network vs. inside: outside sees what users see, but gives noisier results across the public internet."],
    p: ["A probe account exempt from posture and multi-factor checks passes while real users are all being rejected.", "Probing only the listening port reports healthy while the identity provider behind it is down."],
    v: "Stop the identity provider connection in a test and confirm the probe turns unhealthy within its interval and the gateway leaves load-balancer rotation, while a plain port check would still report up.",
    dep: ["identity-provider-federation", "client-load-balancing"]
  },
  "packet-capture": {
    s: "Targeted capture of packets at several points, before and after encryption, with filters and limits, to diagnose handshake failures, size problems and policy drops.",
    d: "An operator selects a peer, address or protocol and captures at the outer interface, where traffic is encrypted, and at the virtual interface, where it is clear. Handshake messages are visible on the outer side; the decrypted payload only on the inner. Captures are time-limited and size-limited. Some gateways can export session keys so a captured tunnel can be decrypted offline. It is hard because it exposes user traffic, so access, duration and storage need controls.",
    k: ["Capturing the decrypted inner traffic vs. only the outer: inner capture finds application and routing faults, but exposes user data to whoever holds the file.", "Key export for offline decryption vs. none: export speeds up diagnosis of protocol faults, but a leaked key log undoes forward secrecy for those sessions."],
    p: ["An unlimited capture on a busy gateway fills storage and slows the data path.", "Capture files left on a shared drive contain user traffic long after the incident is closed."],
    v: "Capture on the outer and inner interface for one test session and confirm the outer side shows only encrypted packets of the expected sizes while the inner side shows the clear application traffic.",
    dep: ["virtual-interface", "audit-trail"]
  },
  "log-export": {
    s: "Ships logs, metrics and events to external collectors in standard formats, with buffering so records survive collector outages and the gateway's own failure.",
    d: "Records are sent using standard logging and metrics protocols to a central system, over an authenticated, encrypted channel. A local queue holds records while the collector is unavailable, with a bounded size and a defined policy for what to drop. Fields are normalized so the same event looks the same across gateway models. It is hard because log volume at high connection rates can be large and bursty, and an exporter that blocks can stall the control plane it is observing.",
    k: ["Blocking when the queue is full vs. dropping oldest: blocking never loses records but can stall the gateway; dropping keeps traffic flowing but loses evidence.", "Structured fields vs. free text: structured data is searchable and stable, but needs agreement on field names and versions."],
    p: ["An unbounded local queue fills the disk during a collector outage and takes the gateway down with it.", "Sending logs unencrypted exposes user addresses and times to anyone on the path."],
    v: "Disconnect the collector, generate one hundred sessions, reconnect it, and confirm all hundred records arrive in order with the queue depth metric having risen and returned to zero.",
    dep: ["connection-logs", "audit-trail"]
  },
  "alerting-rules": {
    s: "Conditions over metrics and logs that notify operators: tunnels down, failure spikes, certificate expiry approaching, address pool exhaustion and unusual access patterns.",
    d: "Rules evaluate metrics and log events against thresholds or baselines and route notifications by severity. The most valuable alerts are predictive ones: certificates expiring in thirty days, the address pool at eighty percent, a cluster member out of sync. Security rules watch for repeated failures from one source or a login from an impossible location. The difficulty is noise: an alert that fires daily is ignored, and an alert that needs a person at three in the morning must say what to do.",
    k: ["Threshold alerts vs. anomaly baselines: thresholds are predictable and easy to explain, but baselines catch slow drifts that fixed limits miss, at the price of false positives.", "Alerting on symptoms users feel vs. on component causes: symptoms reduce noise, while causes speed up diagnosis."],
    p: ["No alert on certificate expiry means the first warning is every user failing to connect on the expiry date.", "Alerts that include no gateway name or runbook link waste the first ten minutes of every incident."],
    v: "Lower a certificate's validity in a test environment to under thirty days and confirm an alert is raised naming the certificate and gateway, then renew it and confirm the alert clears.",
    dep: ["tunnel-metrics", "connection-logs"]
  }
});
