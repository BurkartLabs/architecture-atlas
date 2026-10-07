// Details for the VPN gateway plate, part 2: authentication and access policies.
ATLAS.details("vpn-gateway", {
  "certificate-auth": {
    s: "Authenticates a peer by a signed certificate and proof of possession of its private key, validated against trusted issuers and the identity the certificate names.",
    d: "During the handshake the peer sends a certificate chain and signs a value that binds the session, proving it holds the private key. The gateway validates the chain to a configured trust anchor, checks validity dates, key usage and revocation, and maps a name in the certificate to a user, device or site. It is the standard choice for site-to-site links and managed devices. It is hard because correctness depends on many small checks, and trusting too broad a set of issuers lets any certificate they sign reach the gateway.",
    k: ["Dedicated issuer for tunnel credentials vs. a general corporate issuer: a dedicated issuer limits who can mint access, but means running another trust hierarchy.", "Identity from the subject name vs. from an extension field: extensions are more precise, but older peers may not set them."],
    p: ["Accepting any certificate from a trusted issuer without matching its name lets one site impersonate another.", "Skipping the key-usage check allows a certificate meant for a web server to open a tunnel."],
    v: "Present a certificate signed by an untrusted issuer, an expired one and one with the wrong name, and confirm each is refused with a distinct logged reason, while a valid certificate connects.",
    dep: ["certificate-store", "revocation-checking", "peer-identity-binding"]
  },
  "pre-shared-keys": {
    s: "Authenticates peers using a secret both sides were configured with in advance, simple to set up for a pair of sites but difficult to manage and to protect at scale.",
    d: "Both peers hold the same secret, and each proves knowledge of it during the handshake, usually mixed into the key derivation so that a wrong secret yields different keys. It requires no issuer, which makes it common for small site-to-site links and for a first connection to a new device. It is hard because the secret is shared, so any exposure compromises both ends, a weak human-chosen value can be guessed offline from a captured handshake, and rotating it needs both sides changed together.",
    k: ["One secret per peer pair vs. one shared by a group: per-pair limits damage from a leak, but the number of secrets grows with the number of peers.", "Pre-shared key vs. certificates: the key needs no issuer and works anywhere, but cannot be revoked for one device and offers weaker identity."],
    p: ["A short passphrase used as a key can be recovered offline from a recorded handshake in minutes.", "The same key reused across many sites means one stolen router configuration exposes all of them."],
    v: "Configure a wrong secret on one side and confirm the handshake fails with an authentication error rather than silently negotiating, then confirm a generated random secret of full length connects.",
    dep: ["key-derivation", "secrets-handling"]
  },
  "identity-provider-federation": {
    s: "Delegates user authentication to an external identity provider, so passwords, directories and sign-in policy live there and the gateway only receives a verified result.",
    d: "The gateway acts as a relying party or as a client of a directory protocol. A user's client is sent to the identity provider, signs in there, and the gateway receives a signed assertion or token naming the user and their groups. The gateway checks the signature, audience and time, then maps the identity to a policy. Account disablement at the provider therefore takes effect at the next sign-in. It is hard because the tunnel client is not a browser, and the provider's availability becomes part of the gateway's availability.",
    k: ["Federated sign-in vs. local accounts on the gateway: federation gives one place to disable a person, but ties tunnel availability to the provider's.", "Group claims in the token vs. a directory lookup at connect: claims are fast, but can be stale for the life of the token."],
    p: ["Accepting a token without checking its audience lets a token issued for another application open a tunnel.", "Group membership copied at connect time stays valid for days after a user changes roles."],
    v: "Disable a user at the identity provider and confirm the next connection attempt is refused, and confirm a token issued for a different application is rejected by the gateway.",
    dep: ["group-role-mapping", "multi-factor-challenge", "reauthentication-timers"]
  },
  "multi-factor-challenge": {
    s: "Requires a second proof beyond a password, such as a one-time code, a push approval or a hardware key, before a user session is allowed.",
    d: "The challenge runs either inside the identity provider's sign-in or as an extra round trip in the tunnel's own authentication. Methods vary in strength: codes can be phished in real time, approvals can be accepted by a tired user, hardware keys bound to the gateway's name resist both. Some deployments require it only for sensitive groups or new devices. It is hard because the tunnel client has limited user interface, and some protocols have a short time limit that a person looking for a phone will exceed.",
    k: ["Phishing-resistant hardware keys vs. one-time codes: hardware keys resist real-time relay attacks, but cost more and need a fallback process for lost devices.", "Prompting at every connect vs. once per period: frequent prompts are safer, but train users to approve without reading."],
    p: ["Unlimited push prompts let an attacker with a stolen password wear a user down until they approve one.", "A recovery path that skips the second factor is the one attackers use."],
    v: "Sign in with a correct password and no second factor and confirm no tunnel is established. Then supply a valid factor and confirm a session starts, with the factor method named in the connection log.",
    dep: ["identity-provider-federation", "connection-logs"]
  },
  "device-enrollment": {
    s: "The process by which a device obtains its own tunnel credential, such as a certificate issued after an approved request, so access is tied to a known machine and not only a person.",
    d: "A device generates a key pair, sends a signing request along with proof of who it is or an enrollment token, and receives a certificate from the issuer after an approval step that may be automatic for managed devices. The private key stays on the device, ideally in a hardware-backed store. Enrollment protocols handle renewal without a human. It is hard because the first request has to be authenticated before the device has any credential, and because devices that are lost or reset must be re-enrolled without duplicates.",
    k: ["Automatic enrollment for managed devices vs. manual approval: automation scales and renews silently, but trusts the management channel completely.", "Keys generated on the device vs. delivered to it: on-device keys are never transmitted, whereas delivery is simpler for devices with no secure storage."],
    p: ["A reusable enrollment token posted in a chat channel lets anyone mint a device credential.", "Enrolling without recording the device owner leaves a valid certificate nobody can attribute."],
    v: "Enroll a new device using a single-use token, confirm it obtains a certificate and connects, then reuse the same token and confirm the second request is rejected.",
    dep: ["certificate-auth", "secure-key-storage", "credential-lifecycle"]
  },
  "revocation-checking": {
    s: "Determines whether a certificate that is still within its validity dates has been withdrawn, using published lists or an online status query.",
    d: "The gateway consults a revocation list fetched from the issuer, an online status responder, or a locally pushed deny list. Each has a cost: lists grow and go stale, online queries add latency and a dependency on the responder, and a local deny list needs distribution. The gateway must decide what to do when the answer cannot be obtained. It is hard because checking on the connect path makes the issuer's availability a requirement, while not checking leaves a stolen credential working until it expires.",
    k: ["Fail closed when status is unknown vs. fail open: closed is secure but locks out everyone during a responder outage; open keeps access but accepts stolen credentials.", "Cached lists vs. live queries: caching is fast and resilient, but revocations take effect only at the next refresh."],
    p: ["A revocation list that expired in the cache is treated as empty, so revoked certificates pass.", "A responder reachable only over the tunnel itself creates a circular dependency for new connections."],
    v: "Revoke a test certificate, wait for the documented refresh interval, and confirm the next connection with it is refused with a revocation reason, while other certificates from the same issuer still connect.",
    dep: ["certificate-store", "fail-closed-vs-open"]
  },
  "credential-lifecycle": {
    s: "Issuance, renewal, rotation and retirement of every credential the gateway relies on: user and device certificates, server certificates, shared secrets and tokens.",
    d: "Each credential has an owner, a validity period and a renewal path. Short-lived certificates renewed automatically replace revocation for most cases, since a stolen one soon expires. The gateway's own server certificate and issuer certificates need overlap periods so clients trust the new one before the old one is withdrawn. Inventory and expiry tracking prevent surprises. It is hard because a single forgotten expiry stops all connections at once, and because rotation touches both ends.",
    k: ["Short-lived certificates vs. long-lived with revocation: short lifetimes limit theft damage without lists, but need reliable automated renewal everywhere.", "Overlapping old and new issuers vs. a cutover date: overlap avoids an outage, but extends the period the old key remains trusted."],
    p: ["A server certificate that expires on a weekend takes every client down, since nothing was tracking it.", "Rotating a root without first distributing the new one to clients strands every managed device."],
    v: "Renew a server certificate in a test environment and confirm connected clients are unaffected, new clients see the new certificate, and the expiry inventory shows the next date.",
    dep: ["certificate-store", "device-enrollment", "alerting-rules"]
  },
  "reauthentication-timers": {
    s: "Limits how long a session may last without proving identity again, forcing periodic reauthentication so changed permissions and disabled accounts take effect.",
    d: "Sessions carry an absolute lifetime and often an idle timeout. When the lifetime ends, the gateway requires a fresh authentication, silently if a token can be refreshed or interactively if not. Idle timeouts free address and state resources. Rekeying of the tunnel keys is separate and does not by itself re-check the user. The difficulty is user experience: forced disconnects in the middle of a transfer cause complaints, so deployments need warnings and reconnects that preserve running applications.",
    k: ["Short absolute lifetime vs. long: short makes disablement effective sooner, but interrupts users and loads the identity provider.", "Silent token refresh vs. interactive reauthentication: silent is smooth, but a stolen refresh token keeps working."],
    p: ["Treating rekeying as reauthentication leaves a disabled user connected for as long as the keys keep renewing.", "A timer shorter than a long transfer silently kills the job at the same point each day."],
    v: "Set a five-minute session lifetime in a test, connect, disable the user at the provider, and confirm the session ends at the lifetime and the following reconnect attempt is refused.",
    dep: ["identity-provider-federation", "rekeying", "session-limits"]
  },
  "access-policy-model": {
    s: "The rules that map an authenticated identity and context to what that session may do: networks reachable, protocols allowed, address assigned and limits applied.",
    d: "A policy is a set of conditions, such as group, device state, source network and time, and a result: allowed destinations, a filter set, a pool, a bandwidth class. Evaluation order and defaults matter, and the safe default is deny. Policies are compiled into the forms the data plane uses: selectors, routes and filter rules. They change over time and must be re-evaluated for live sessions. The hard part is keeping the model understandable as exceptions accumulate, and proving what a given user can actually reach.",
    k: ["Default deny with explicit allows vs. default allow with blocks: deny is safer and auditable, but needs more up-front work to enumerate legitimate access.", "Policy per user vs. per group: groups are manageable at scale, but make individual exceptions awkward and tempt over-broad grants."],
    p: ["A broad temporary rule added during an incident stays for years because nobody owns removing it.", "Policies checked only at connect time leave a user with old access after a role change."],
    v: "For a test user in one group, enumerate reachable destinations from the client and confirm the list equals the policy's allowed set exactly, with any other internal address refused.",
    dep: ["group-role-mapping", "per-user-filters", "traffic-selectors"]
  },
  "group-role-mapping": {
    s: "Translates identity attributes, such as directory groups, token claims or certificate fields, into the roles and policies the gateway enforces.",
    d: "Identity sources describe people in their own vocabulary, and the gateway maintains a mapping from those attributes to its policy names. A user in several groups may match several policies, so a rule decides whether they merge, take the first match or take the most restrictive. The mapping runs at connect and again on refresh. It is hard because naming drifts at the source, nested groups multiply, and a missing mapping can default either to no access, which is a support burden, or to a broad default, which is a security problem.",
    k: ["First match vs. merge of all matching policies: first match is predictable, whereas merging gives the union of access but is harder to explain.", "Mapping on group names vs. stable group identifiers: identifiers survive renames, but are unreadable in the configuration."],
    p: ["A renamed directory group stops matching and silently drops a whole department to the default policy.", "Nested group expansion that is not capped lets an inherited membership grant access nobody intended."],
    v: "Place a test user in two groups with different policies and confirm the resulting session gets the documented combination, then remove one group and confirm access narrows at the next refresh.",
    dep: ["identity-provider-federation", "access-policy-model"]
  },
  "address-pool": {
    s: "The range of inner addresses handed out to connecting clients, with allocation, reuse and exhaustion handling, and optional stable addresses per user or per group.",
    d: "On connect the gateway assigns an address from a pool and tells the client, along with routes and DNS servers. Addresses are recovered when sessions end, after a hold time so a quick reconnect gets the same one. Pools may be carved by group so firewalls elsewhere can filter by source range. Some designs fetch addresses from a central address management service. It is hard because exhaustion looks like random connect failures, and reuse means logs keyed on address alone are ambiguous.",
    k: ["Dynamic pool vs. fixed address per user: dynamic is simple and compact, but fixed addresses make downstream firewall rules and logging unambiguous.", "One pool per gateway vs. a shared pool: per-gateway pools need no coordination, but a shared pool uses space better and needs state synchronization."],
    p: ["A pool sized for average users runs out at the morning peak and new users fail to connect.", "Pool ranges overlapping a user's home network make internal destinations unreachable from that user."],
    v: "Connect a client, disconnect, reconnect within the hold time and confirm the same address returns; then exhaust a small test pool and confirm the gateway reports exhaustion in logs and an alert.",
    dep: ["access-policy-model", "state-synchronization"]
  },
  "per-user-filters": {
    s: "Packet filters applied to a particular session or group inside the tunnel, restricting destinations, ports and directions beyond what routing alone enforces.",
    d: "After decryption, packets from a client pass through a filter specific to that session before being forwarded, and traffic toward the client is filtered in the same way. Filters are installed from the session's policy and removed when it ends. Because they key on the inner source address, the gateway must make sure a client cannot send packets with another client's address. It is hard because filter lists grow, ordering matters, and a filter that is correct for one session can be applied to the wrong one after address reuse.",
    k: ["Filtering on the gateway vs. on downstream firewalls: the gateway knows the identity directly, while downstream devices have more mature inspection but see only addresses.", "Per-session filter instances vs. shared group filters: per-session is precise, whereas shared filters use less memory and update faster."],
    p: ["Not checking the inner source address against the assigned one lets a client spoof a more privileged peer.", "Filters left installed after a session ends apply to the next user who receives that address."],
    v: "From a restricted test user, attempt to reach one allowed and one forbidden internal host and port, and confirm the first answers and the second is dropped with a counter increment; then spoof another address and confirm that is dropped too.",
    dep: ["address-pool", "encap-decap-pipeline", "access-policy-model"]
  },
  "posture-assessment": {
    s: "Checks the state of the connecting device, such as operating system version, disk encryption, security software and management status, and adjusts access accordingly.",
    d: "The client reports attributes, or the gateway queries a device management system by device identity, and the result is compared with posture requirements. Outcomes range from full access through a restricted remediation network to refusal. Checks can repeat during the session. It is hard because anything the client reports can be forged by a compromised device, so posture is only as trustworthy as the channel and attestation behind it, and because strict rules generate support requests when they fail on legitimate machines.",
    k: ["Client-reported posture vs. hardware-attested or management-system verified: reported is easy to deploy but forgeable; attestation is stronger but limited to supported devices.", "Block on failure vs. quarantine to a remediation network: blocking is strict, whereas quarantine lets users fix the problem themselves."],
    p: ["Trusting a self-reported flag means malware only has to claim the machine is clean.", "A posture rule applied only at connect lets a device that later disables its protections stay connected."],
    v: "Connect a test device with disk encryption turned off and confirm it lands in the restricted network with only remediation resources reachable, then enable it, reconnect and confirm full access.",
    dep: ["access-policy-model", "device-enrollment"]
  },
  "session-limits": {
    s: "Caps on concurrent sessions per user, idle time, total session duration and total gateway capacity, so shared credentials and runaway clients cannot exhaust the system.",
    d: "Per-user limits prevent one credential being used by many people, and either refuse the new session or end the oldest. Idle timeouts reclaim resources from forgotten sessions, and global limits protect handshake and crypto capacity. When limits are hit, behavior is chosen deliberately: queue, refuse, or shed lowest-priority sessions. It is hard because legitimate users have several devices, and because a limit counted at the wrong place, such as per gateway in a cluster, is not enforced globally.",
    k: ["Refuse new sessions at the cap vs. disconnect the oldest: refusing protects active work, while replacing the oldest handles a dropped session the gateway has not noticed yet.", "Per-gateway counters vs. cluster-wide: per-gateway is cheap, but cluster-wide needs synchronized state to be accurate."],
    p: ["A stale session that the gateway has not timed out blocks a user from reconnecting after a network drop.", "A limit of one session per user breaks anyone with both a laptop and a phone."],
    v: "Set a limit of two sessions, connect three clients as one user, and confirm the third is refused or replaces the oldest as configured, with the decision visible in the connection log.",
    dep: ["state-synchronization", "reauthentication-timers", "connection-logs"]
  },
  "bandwidth-shaping": {
    s: "Rate limits and priority classes applied per user, group or tunnel, so heavy transfers do not starve interactive traffic or other users of a shared uplink.",
    d: "A shaper meters traffic per session or class and delays or drops what exceeds its rate, using token buckets and queues. It can apply before encryption, where traffic is classified by inner header, or after, where only outer headers are visible. Voice and interactive traffic can be given priority. It is hard because encryption hides the inner markings from queues downstream, because the real bottleneck is often the ISP link and not the gateway, and because per-user state costs memory at scale.",
    k: ["Shaping before encryption vs. after: before lets the gateway see inner classes, whereas after only controls the outer rate the link actually carries.", "Hard per-user caps vs. fair sharing of what is available: caps are predictable, but waste capacity when others are idle."],
    p: ["Shaping on the gateway while the congested link is elsewhere shifts the queue without fixing the delay.", "A shaper that drops instead of delaying causes retransmissions that make congestion worse."],
    v: "Run one bulk transfer and one interactive latency test through the same gateway, and confirm the shaper keeps interactive latency within target and the bulk flow at its configured rate.",
    dep: ["access-policy-model", "encap-decap-pipeline"]
  }
});
