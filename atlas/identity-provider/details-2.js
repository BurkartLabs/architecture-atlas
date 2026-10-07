// Details for the identity provider plate, part 2: credentials, multi-factor, risk and abuse defense.
ATLAS.details("identity-provider", {
  "password-hashing": {
    s: "Turns a password into a stored verifier with a slow, memory-hungry, salted function so that a stolen database cannot be cracked cheaply.",
    d: "On registration the provider generates a random salt per user, runs the password through a deliberately expensive function tuned for memory and time, and stores the algorithm, parameters, salt and output together. At login it recomputes and compares in constant time. Some deployments add a secret pepper held outside the database. Cost parameters are set so one verification takes tens to hundreds of milliseconds on the server. The tension is capacity: strong hashing makes each login costly, which attackers exploit by sending many attempts to exhaust the service.",
    k: ["Memory-hard function with high cost vs a fast hash: memory-hard resists offline cracking hardware, but consumes server memory and invites resource-exhaustion attacks.", "A pepper kept in a hardware module vs salt only: a pepper protects against a database-only leak, but adds a dependency that must be backed up and rotated."],
    p: ["Cost parameters chosen once and never raised leave old hashes cheap to crack as hardware improves.", "Comparing hashes with an ordinary string compare leaks timing that helps guessing."],
    v: "Inspect a stored record to confirm it holds algorithm, parameters, salt and hash with no plaintext, time one verification against the target cost, and confirm two users with the same password have different hashes.",
    dep: ["credential-store","hardware-key-protection"]
  },
  "password-policy": {
    s: "Rules for acceptable passwords: minimum length, blocked values, expiry only on evidence of compromise, and how many failed attempts are tolerated.",
    d: "The policy checks a candidate when set or changed: length, a list of common and context-specific words such as the username or tenant name, and a breach check. Current guidance favors long passphrases, no composition rules and no scheduled rotation, replacing a password only when it is known or suspected to be exposed. Policy is configured per tenant, so the checker must evaluate rules and explain the failures. The difficulty is human: strict rules produce predictable substitutions, and tenants insisting on legacy rules harm their own security.",
    k: ["Length and blocklist rules vs composition rules: length and blocklists raise real entropy, while composition rules produce predictable patterns and frustration.", "Rotation on compromise vs scheduled rotation: event-driven rotation avoids weak incremental changes, but depends on detecting compromise, which compliance auditors may not accept."],
    p: ["Truncating long passwords silently means two different passphrases are accepted as the same.", "Policy errors that list which rule failed against a leaked-password list reveal the password was in a breach."],
    v: "Try setting a password equal to the username, a common password and a long random passphrase, and confirm the first two are refused with a clear reason and the third is accepted.",
    dep: ["breached-password-check","tenant-configuration"]
  },
  "breached-password-check": {
    s: "Compares candidate and existing passwords against known leaked passwords without sending the password itself anywhere outside the provider.",
    d: "A dataset of leaked passwords is held locally as hashes or queried through a privacy-preserving protocol that sends only a short prefix of a hash. It is checked when a password is set and, using the plaintext available at login, when existing users sign in. A match forces a change or additional proof. The data must be refreshed continuously. The hard parts are privacy and false comfort: the check finds only passwords already in a collected list, and a login-time check handles the plaintext carefully in memory.",
    k: ["Local dataset vs external lookup service: local avoids sending data out and works offline, but must be large, updated and stored, while a lookup service is easy and depends on a third party.", "Blocking at set time only vs also checking at each login: login checks catch passwords leaked after they were set, at the cost of handling plaintext in another code path."],
    p: ["Sending a full password hash to a remote service gives that service material to crack it.", "A stale dataset passes passwords that were published months ago."],
    v: "Attempt to set a password present in the dataset and confirm refusal, then sign in with an existing account whose password is added to the dataset and confirm a forced change follows.",
    dep: ["password-policy","credential-store"]
  },
  "credential-store": {
    s: "The protected storage that holds password verifiers, factor secrets, public keys and recovery material, kept apart from general profile data.",
    d: "Credentials live in their own tables or service with stricter access, encryption and auditing than profiles. Records include password verifiers, authenticator seeds, public keys for passkeys, recovery code hashes and metadata such as creation time and last use. Access is limited to the authentication service, with no administrator read path. Backups carry the same protection. The design goal is that no bulk query or reporting tool can read secrets, and that a compromise of the profile database reveals no credentials.",
    k: ["A separate credential service with its own database vs the same database with different permissions: separation limits blast radius and access paths, at the cost of an extra network hop and operations.", "Encrypting seeds at rest with a key outside the database vs relying on disk encryption: application-level encryption protects against database dumps, though key handling adds complexity."],
    p: ["Reporting or support tools granted read access to the credential tables expose seeds to many staff.", "Backups of credential data stored with weaker controls than production become the easiest theft."],
    v: "Using the account that runs reporting queries, attempt to read the credential store and confirm access is denied, and confirm a database dump of the profile store contains no secrets or verifiers.",
    dep: ["attribute-encryption","user-store"]
  },
  "hash-upgrade-on-login": {
    s: "A mechanism that re-hashes a password with a stronger algorithm or higher cost the next time the user signs in, since only then is the plaintext available.",
    d: "Each stored verifier records its algorithm and parameters. After a successful verification the service checks whether they meet the current target, and if not, computes a new verifier from the plaintext in hand and replaces the old one atomically. The same mechanism imports accounts from another system with a legacy hash: verify against the old format, then store the new. Inactive accounts never upgrade, so some deployments wrap old hashes in a stronger one in bulk. The difficulty is long tails: users who never return keep the weakest hash.",
    k: ["Upgrading on login vs wrapping all hashes in bulk: on login is exact and simple, while wrapping protects everyone immediately but keeps the legacy hash inside a layered verifier.", "Importing users with their old hashes vs forcing resets: keeping hashes avoids mass disruption, but keeps a weak algorithm in the verification path."],
    p: ["A failed upgrade write after a successful login can leave a half-updated record that blocks the next sign-in.", "Supporting a weak legacy format indefinitely allows downgrade by forcing an old record type."],
    v: "Seed a user with a low-cost hash, sign in, and confirm the stored record now carries the current algorithm and cost and the same password still verifies.",
    dep: ["password-hashing","credential-store"]
  },
  "workload-credentials": {
    s: "Credentials for programs rather than people: client secrets, signed assertions, certificates and short-lived tokens that let a service authenticate to the provider.",
    d: "Programs authenticate at the token endpoint with a shared secret, a private key signing a short assertion, or a mutual-TLS certificate, and can obtain tokens for what they are allowed to call. Stronger options avoid long-lived shared secrets and bind identity to the platform the workload runs on. Rotation is overlapping: the old and new credential both work during a window. The problem is sprawl: secrets copied into configuration files, build systems and chat messages outlive their owners.",
    k: ["Signed assertions and certificates vs shared secrets: key-based methods never send the secret and resist replay, while shared secrets are easy to start with but leak easily.", "Platform-attested identity vs stored credentials: attestation removes stored secrets, but ties the provider to the platform's trust model."],
    p: ["A client secret placed in source control remains valid until someone notices and rotates it.", "No overlap window during rotation causes an outage when one consumer is slower than the rest."],
    v: "Rotate a workload's credential and confirm both old and new work during the window, the old stops after it, and no outage is recorded for a consumer using the new one.",
    dep: ["client-registry","token-endpoint","credential-store"]
  },
  "factor-enrollment": {
    s: "The process by which a user registers an additional authenticator, proving possession and recording it, usually after proving they are already the account owner.",
    d: "Enrollment requires recent authentication, then runs a factor-specific ceremony: scanning a seed for a code generator, registering a public key with a device, or verifying a phone. The provider stores the factor, names it and prompts for a recovery path. Enrollment is also an attack: an attacker with a stolen session adds their own device. So it needs fresh proof, notification and sometimes a delay before the new factor counts for sensitive actions.",
    k: ["Requiring fresh proof to add a factor vs allowing it in any session: fresh proof stops session thieves from persisting, but adds friction for legitimate users.", "Mandatory enrollment at first login vs deferred enrollment: mandatory guarantees coverage, but pushes new users to make poor choices under time pressure."],
    p: ["Enrolling a factor without notifying the owner lets a session thief add a permanent second door.", "Letting a user remove all but a weak factor quietly downgrades their own security."],
    v: "Enroll a code generator from a recently authenticated session, confirm the owner receives a notice, then attempt enrollment from a stale session and confirm fresh authentication is demanded.",
    dep: ["step-up-authentication","credential-store","message-delivery"]
  },
  "totp-factors": {
    s: "Six-digit codes derived from a shared secret and the current time, entered by the user from an authenticator app to prove possession of the enrolled device.",
    d: "At enrollment the provider generates a random seed and shows it as a code the app scans. At login, the provider computes the expected code for the current thirty-second step and a small window either side, and compares. Each accepted code is remembered so it cannot be reused within its window. Drift between clocks is tolerated within limits. It is hard because it is phishable: a real-time proxy relays the code, and the seed must be stored recoverably, so its protection depends on the credential store.",
    k: ["Wider acceptance window vs tight window: wider tolerates clock drift and slow typing, but multiplies the number of valid codes an attacker can guess.", "Seeds stored encrypted and recoverable vs hashed: codes need the actual seed, so they cannot be hashed, which makes the store a high-value target."],
    p: ["Accepting the same code twice lets a real-time phishing relay use it after the user has.", "No attempt limit allows a million guesses to find a six-digit code."],
    v: "Enter a valid code once and confirm success, enter it again within its window and confirm refusal, then enter incorrect codes repeatedly and confirm throttling.",
    dep: ["credential-store","rate-limiting","factor-enrollment"]
  },
  "passkey-credentials": {
    s: "Public-key credentials held by a device or password manager, bound to the provider's domain, which prove possession by signing a fresh challenge and cannot be phished.",
    d: "At registration the authenticator creates a key pair for the provider's domain and returns the public key and attestation; the provider stores it with a signature counter and metadata. At sign-in the provider sends a random challenge, the authenticator signs it along with the domain and a user-verification flag, and the provider checks all of it. Because the domain is signed in, a lookalike site obtains nothing. Hard parts are recovery, sync across devices, which blurs the possession guarantee, and varied authenticator behavior.",
    k: ["Synced passkeys vs device-bound keys: synced ones recover easily and reach more users, while device-bound ones give stronger assurance and harder recovery.", "Requiring user verification always vs when preferred: requiring it makes the credential a full multi-factor proof, but excludes some authenticators and older devices."],
    p: ["Registering a passkey without any fallback leaves users locked out when the device is lost.", "Not checking the relying party identifier and origin in the response defeats the phishing resistance."],
    v: "Register a passkey, sign in with it, then try the same assertion on a lookalike domain in a test harness and confirm the provider rejects the mismatched origin.",
    dep: ["credential-store","factor-enrollment","user-store"]
  },
  "push-approval": {
    s: "A prompt sent to an enrolled mobile app asking the user to approve or deny a sign-in, often with a number to match to prevent blind approvals.",
    d: "The provider creates a pending challenge, notifies the user's app through a mobile notification service, and waits while the app shows the application, location and a number to type or compare. The app signs its response with a device-bound key. The provider validates it, expires the challenge and records the decision. The weakness is people: attackers send repeated prompts until the user taps approve, so number matching, rate limits and clear context matter.",
    k: ["Number matching vs simple approve or deny: matching forces the user to look at the sign-in screen, but adds effort and does not help when the user is being walked through it.", "Notification service delivery vs polling by the app: notifications are timely but depend on a third-party path, while polling is reliable and drains battery."],
    p: ["Unlimited prompts allow fatigue attacks where the user approves one to make them stop.", "Showing no location or application detail leaves the approver unable to tell a stranger's attempt."],
    v: "Trigger a sign-in, confirm the prompt shows application and location with a number to match, approve with the wrong number and confirm refusal, then send repeated prompts and confirm throttling.",
    dep: ["factor-enrollment","credential-store","rate-limiting","message-delivery"]
  },
  "message-codes": {
    s: "One-time codes sent by text message or voice call to a registered phone number, entered by the user to prove access to the number.",
    d: "The provider generates a short random code, stores a hash with an expiry and attempt count, and sends it through a messaging carrier. Verification compares and consumes it. It is the widest-reaching second factor and the weakest: numbers can be hijacked by carrier fraud or swapped, messages can be intercepted or forwarded, and sending costs money. Attackers also abuse the endpoint to send floods of messages, so volume limits and cost controls are needed.",
    k: ["Offering message codes as a fallback vs as a primary factor: as a fallback it reaches users without apps, but weakens the account to the level of its weakest allowed method.", "Per-number and per-tenant send limits vs unrestricted sending: limits control cost and abuse, but can block a legitimate burst such as a launch."],
    p: ["Unthrottled sending lets attackers pump traffic to premium numbers they own and bill the provider.", "Treating number changes as ordinary profile edits lets an attacker move the factor to their own phone."],
    v: "Request a code, enter it correctly once and confirm success, confirm a reuse and an expired code fail, and send many requests to one number and confirm the limit stops further sends.",
    dep: ["message-delivery","rate-limiting","credential-store"]
  },
  "magic-links": {
    s: "A single-use link emailed to the user that, when opened, completes sign-in or confirms an action, trading a password for control of the mailbox.",
    d: "The provider creates a random token with a short life, stores a hash, and sends a link. Opening it should confirm in the same browser that requested it, because otherwise the link works from any device. The token is consumed on first use. It reduces password handling but moves all trust to the mailbox. Mail scanners that fetch links can consume the token before the user does, so the link opens a confirmation page rather than signing in directly.",
    k: ["Binding the link to the requesting browser vs allowing any device: binding blocks interception, but breaks the common case of reading mail on a phone and signing in on a computer.", "Link containing the token vs a typed code: links are easy to follow, while typed codes avoid scanner consumption and logging of the URL."],
    p: ["Security scanners opening the link consume it, and the real user sees an expired link.", "Links valid for hours remain usable from old mail left in shared inboxes."],
    v: "Request a link, open it in a different browser and confirm the binding rule is applied, then open the original in the requesting browser and confirm sign-in, and reuse and confirm refusal.",
    dep: ["message-delivery","session-store","credential-store"]
  },
  "step-up-authentication": {
    s: "A request, usually made by an application, that the user prove themselves again or with a stronger method before a sensitive action, even though a session exists.",
    d: "Applications ask for a level of assurance or a maximum age of authentication in the authorization request. The provider compares what the session already proves, and if it falls short, runs only the missing step and records the new level and time on the session. Tokens then carry claims about the method and authentication time so the application can verify. It is hard because levels are not a standard scale: tenants name and rank methods differently, and applications must trust claims they cannot check.",
    k: ["Per-request assurance levels vs fixed session levels: per-request fits sensitive actions, but needs applications to understand and request the right level.", "Time-bound step-up vs once per session: time-bound limits the value of a stolen session, while once per session is less annoying and weaker."],
    p: ["Applications that check the authentication method claim but not its age accept proof from days earlier.", "Step-up that only re-asks the password gives no extra assurance when the session was stolen."],
    v: "Request a resource needing a recent factor with a session older than the limit and confirm the provider prompts for the factor, and that the new token reports the method and a fresh time.",
    dep: ["session-store","factor-policy-engine","authorization-endpoint"]
  },
  "factor-policy-engine": {
    s: "The logic that decides which factors are required, allowed or offered for a given user, application, tenant and risk level at each sign-in.",
    d: "It takes the user's enrolled factors, the tenant's rules, the target application's requirements, the device and the risk score, and returns the acceptable set and the required assurance. Rules can be written as ordered conditions with outcomes such as allow, require a factor, require a phishing-resistant factor or deny. The result drives the flow orchestration. It is hard because users have different factors, rules interact, and a mistake blocks people or silently relaxes protection, so policies need simulation before they apply.",
    k: ["Ordered rules with first match vs combining rules by strictest outcome: first match is easy to read but order errors relax protection, while strictest wins is safer and harder to override.", "Policy defined per tenant vs per application: per application matches sensitivity, but multiplies configuration that must be reviewed."],
    p: ["A rule that allows any enrolled factor lets users keep a weak method forever even after stronger ones exist.", "Untested rule changes that require an unavailable factor lock out an entire department."],
    v: "Run a simulation of a proposed rule against last week's sign-ins and confirm it lists the users who would be blocked or prompted, then apply and confirm one sample behaves as simulated.",
    dep: ["tenant-configuration","adaptive-authentication","client-registry"]
  },
  "rate-limiting": {
    s: "Limits on how many requests of each kind a client, address, account or tenant can make in a period, protecting both users and the service.",
    d: "Counters are kept in a fast shared store keyed by combinations such as address, identifier, client and endpoint, with token bucket or sliding window semantics. Different endpoints get different budgets: password checks are tighter than discovery metadata. Limits return a clear response with a retry time, and some responses are slowed instead of refused. The challenge is picking keys: per address punishes shared networks, per account lets attackers lock out a victim, and per tenant lets one noisy customer affect others.",
    k: ["Limits per account and per address together vs one key: combining catches both a single noisy address and a distributed attack on one account, at the cost of tuning two budgets.", "Hard refusal vs progressive delay: refusal is clear and cheap, while delays frustrate scripts without stopping real users who mistype."],
    p: ["Limits keyed only on the claimed forwarding header let an attacker rotate the value and bypass them.", "A counter store outage with fail-open behavior removes all protection exactly when under attack."],
    v: "Send requests to the password endpoint above the limit from one address and confirm later ones receive a retry response, while a different address and an unrelated endpoint stay unaffected.",
    dep: ["cache-layer"]
  },
  "credential-stuffing-defense": {
    s: "Detection and blocking of automated logins that try leaked username and password pairs across many accounts, each tried only once or twice so per-account limits never fire.",
    d: "Signals include a high ratio of failures to successes, many distinct identifiers from one source or network range, known automation signatures, and attempts that match the format of leaked lists. Responses escalate: challenge, slow, block or require a second factor. Shared reputation and the breached-password check help. The difficulty is that attackers spread across large pools of residential addresses and imitate browsers, so no single signal is decisive, and heavy-handed blocking harms real users.",
    k: ["Blocking by network and fingerprint vs by credential pair: network blocks are cheap but evaded by rotating addresses, while pair checks against known leaks catch the attack at its source.", "Challenge first vs block first: challenges let real users through, but cost the service when attackers solve them with services."],
    p: ["Defenses tuned on yesterday's attack let a new distributed pattern run for days unnoticed.", "Lockouts triggered by the attack deny service to the victims whose accounts are being tested."],
    v: "Replay a recorded list of ten thousand pairs from a test pool and confirm the system detects the pattern, escalates to challenge or block within the expected time, and normal users keep signing in.",
    dep: ["rate-limiting","ip-reputation","device-recognition","breached-password-check","anomaly-scoring"]
  },
  "bot-challenge": {
    s: "A test or silent check that distinguishes automated clients from people, shown only when other signals raise suspicion.",
    d: "The challenge may be a proof-of-work puzzle, a behavioral check scored in the browser, or an interactive test. The page receives a signed result that the server verifies for freshness and binding to the attempt. It is deployed after other defenses flag a request, to reduce friction. Accessibility and privacy are real constraints: some tests exclude users with disabilities, and behavioral checks collect data. Attackers bypass many tests with paid solving services, so a challenge raises cost rather than stopping them.",
    k: ["Silent behavioral scoring vs an interactive test: silent scoring spares users, but collects behavioral data and is harder to explain or appeal.", "Own implementation vs third-party service: a third party sees broad traffic patterns, while an own implementation sees only the provider's own traffic."],
    p: ["Accepting a challenge solution without binding it to the attempt lets one solved token be reused across many.", "A challenge with no accessible alternative locks out users who cannot complete it."],
    v: "Submit a login with a missing, expired and reused challenge token and confirm all three are refused, then complete the challenge normally and confirm the attempt proceeds.",
    dep: ["adaptive-authentication","rate-limiting"]
  },
  "device-recognition": {
    s: "Recognizing a browser or device seen before, using a long-lived cookie or key and signals about the client, to treat familiar devices differently from new ones.",
    d: "After a successful sign-in the provider may set a device identifier, store a record of its attributes and consider the device known. Later attempts present the identifier and are compared with the record. Known devices may skip a prompt; unfamiliar ones raise risk. Raw fingerprinting without an identifier is unstable and raises privacy concerns. The problem is brittleness: browsers clear cookies and change attributes, and a stolen device identifier lets an attacker appear familiar.",
    k: ["A stored device key vs passive fingerprinting: a key is reliable and transparent to users, while fingerprinting needs no state but is fuzzy and privacy-invasive.", "Skipping factors on known devices vs always prompting: skipping reduces friction, but turns a stolen cookie into a bypass."],
    p: ["Device identifiers that are not bound to the account let one cookie vouch for many users on a shared computer.", "Treating any changed attribute as a new device floods users with alerts after a browser update."],
    v: "Sign in from a fresh browser and confirm a prompt and a new-device notice, sign in again from the same browser and confirm familiarity is recognized, and clear cookies and confirm it returns to new.",
    dep: ["session-store","anomaly-scoring","trusted-device-memory"]
  },
  "anomaly-scoring": {
    s: "Combines signals about an attempt, such as location, time, device, velocity and past behavior, into a risk score used by policy.",
    d: "Features come from the request, the device record, the user's history, network reputation and global threat data. A model or weighted rules produce a score and the reasons. Policies map score bands to actions. It must run in the sign-in path in a few milliseconds, so features are precomputed and cached. Hard problems include cold start for new users, travel that looks like impossible travel through proxies, and explaining a decision to a blocked user or an auditor.",
    k: ["Explainable rules vs a learned model: rules are auditable and predictable, while a model finds subtler patterns but is harder to justify and tune.", "Per-user baselines vs global rules: baselines personalize and cut false alarms, but need history and are poisoned by an attacker who is already in."],
    p: ["Scores computed from client-supplied location data are easily spoofed.", "Models trained on past attacks stop working when attackers change method, and nobody notices because blocked volume simply falls."],
    v: "Replay a sign-in from a new country five minutes after one in the home country and confirm the score rises with the reasons listed, and that a routine sign-in from a known device scores low.",
    dep: ["device-recognition","ip-reputation","audit-event-log","cache-layer"]
  },
  "adaptive-authentication": {
    s: "Policy that changes the required proof at sign-in according to risk: allow, require another factor, require a stronger factor, or deny.",
    d: "After identifying the user, the provider evaluates the risk score and context against tenant rules. Low risk may allow a remembered device with only a password; elevated risk may demand a passkey; high risk may deny and alert. The decision is attached to the session along with its reason. The aim is to apply friction only where it pays. It is hard to tune: rules that are too lenient miss attacks, rules that are too strict train users to find workarounds.",
    k: ["Risk-based prompts vs uniform requirements: adaptive reduces friction for most, but makes behavior less predictable and complicates support.", "Deny on high risk vs always allow a path through: denial stops attacks, while a path through avoids locking out a user who is traveling."],
    p: ["Letting low risk bypass a factor entirely makes the risk score the single point of failure.", "Decisions without a recorded reason leave support unable to explain why someone was blocked."],
    v: "Sign in under low, medium and high risk test conditions and confirm the proof demanded escalates accordingly, and that each decision's reason is stored with the session and in the log.",
    dep: ["anomaly-scoring","factor-policy-engine","bot-challenge"]
  },
  "account-lockout": {
    s: "Temporarily blocking sign-in for an account after repeated failures, balancing protection against guessing with the risk of letting attackers lock people out.",
    d: "Failed attempts are counted per account, often with decay, and after a threshold the account is delayed or blocked for a period or until recovery. Some designs lock only the attacking source or require a challenge instead of a full block. Locked state must apply to all paths, including tokens by password grant and factor checks. The tension is that a lockout is a denial-of-service tool: an attacker who knows a username can keep a victim out indefinitely.",
    k: ["Locking the account vs throttling attempts: locking stops guessing fully, but is weaponizable, while throttling slows attackers without taking the account away.", "Automatic unlock after a delay vs manual unlock: delay requires no staff, while manual unlock is safer for sensitive accounts but loads support."],
    p: ["A lockout counter that resets on any success lets an attacker alternate guesses with the user's own logins.", "Lockout visible only on the web form leaves an alternate token endpoint open to guessing."],
    v: "Make the threshold number of wrong attempts on a test account and confirm further attempts fail with the correct password for the lock period on every endpoint, and that the owner can recover with another method.",
    dep: ["credential-store","rate-limiting","audit-event-log"]
  },
  "ip-reputation": {
    s: "Scores for network addresses and ranges based on past abuse, anonymizing services and hosting origins, used as an input to risk decisions.",
    d: "Data comes from the provider's own history of abusive attempts plus external feeds of proxies, hosting ranges and known botnets, loaded into a lookup structure for fast queries. The score influences rate limits and challenges rather than deciding alone. Addresses change hands and many users share addresses through carrier gateways and offices. The pitfall is collateral damage: blocking a large shared address blocks innocent people, and reputation is poor evidence about a single person.",
    k: ["Using reputation to adjust friction vs to block: adjusting friction limits harm from false positives, while blocking is simple and wrongly excludes whole networks.", "Own history vs external feeds: own history is accurate for your users, but thin; feeds are broad and lag behind new attacks."],
    p: ["Treating a privacy network as hostile blocks users who chose it for safety.", "A feed that is not refreshed keeps blocking addresses long since reassigned."],
    v: "Query a known abusive test address and a clean one, confirm the stored scores differ and that the abusive one triggers a challenge rather than a block, and that the score changes after a feed update.",
    dep: ["cache-layer","audit-event-log"]
  }
});
