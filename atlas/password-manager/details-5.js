// Details for the password manager plate, part 5: server and operations, local device security, cross-cutting concerns.
ATLAS.details("password-manager", {
  "api-gateway": {
    s: "The public HTTP front door that authenticates requests, applies rate limits and size caps, and routes them to the account, sync, storage and mail services.",
    d: "It terminates TLS, validates the session token, enforces per-account and per-address limits, rejects oversized bodies, and forwards to internal services. It also serves the static web client from a separate origin or path. Responses carry strict security headers. Because every request body is ciphertext or derived hashes, the gateway can log little of use, which is intentional. The challenge is abuse handling without content: limits must stop credential stuffing and enumeration, yet not block a family sharing one network address.",
    k: ["Rate limits per account vs per address: account limits stop targeted guessing, while address limits stop floods, and each alone is bypassed by distribution or by shared networks.", "Minimal request logging vs detailed: minimal logs reduce what a breach exposes, but leave less evidence for investigating an attack."],
    p: ["A limit keyed only by address blocks an office behind one shared address after a few typos.", "Verbose error messages reveal whether an account exists or which factor failed."],
    v: "Send repeated failed logins from many addresses against one account and confirm limits trigger. Send requests for existing and nonexistent accounts and confirm responses and timing are identical.",
    dep: ["abuse-protection", "session-tokens", "ciphertext-store", "account-database"]
  },
  "abuse-protection": {
    s: "Limits and detection that make online password guessing, credential stuffing and account enumeration expensive, with escalating delays, challenges and lockouts.",
    d: "Failed authentication attempts are counted per account, address and device. Thresholds add delays, require a challenge, or trigger an email alert. Because the stored value is a derivation of a master password with a high cost, online guessing is rate-limited and offline guessing is limited by the key derivation. Lockout can be abused to deny service to a victim. The difficulty is calibrating friction: strict limits protect the account but lock out the owner, and attackers rotate addresses to avoid per-address counters.",
    k: ["Progressive delays vs hard lockout: delays slow an attacker without letting them freeze the owner out, but lockout stops a persistent guesser outright and enables denial of service.", "Challenge after failures vs on every login: failure-triggered challenges keep daily use smooth, but attackers learn how many tries they get."],
    p: ["A hard lockout lets an attacker disable a victim's login by repeatedly failing it.", "Per-address limits are evaded by a botnet spreading guesses across thousands of addresses."],
    v: "Fail login against a test account until the threshold, confirm delay or challenge applies, and that the owner can still log in after proving a second factor. Spread attempts over many addresses and confirm the account-level counter still triggers.",
    dep: ["account-database", "audit-event-log", "mail-service"]
  },
  "ciphertext-store": {
    s: "The durable storage for encrypted items, attachments and organization data, holding opaque blobs keyed by identifiers and indexed only by what plaintext metadata allows.",
    d: "Item records go in a transactional database and attachments in an object store. Each write includes the revision and is committed atomically with the revision counter. Replication across zones provides durability. Backups contain only ciphertext, so a backup theft carries the same risk as a database theft: an offline attack on each account's master password and key derivation. Deletion must remove blobs and eventually backups. The challenge is that the store cannot help with any query that needs the plaintext, so every feature is shaped by what the server can see.",
    k: ["Records in a relational database vs a document store: relational gives transactions across revision and item, while documents scale horizontally and weaken cross-record atomicity.", "Attachments in an object store vs the database: object stores handle large blobs cheaply, but need a separate consistency story with the item that points to them."],
    p: ["An attachment blob is written but its item is not, and orphaned ciphertext accumulates forever.", "Deleted items remain in backups far longer than the stated retention."],
    v: "Write an item and attachment, kill the service mid-write, and confirm there is no item without its revision and no revision without its item. Delete the item and confirm the blob is purged within the documented window.",
    dep: ["plaintext-metadata", "account-database"]
  },
  "account-database": {
    s: "Stores account records: email, derivation parameters, the hashed authentication value, wrapped keys, public keys, device and organization membership.",
    d: "It holds the data needed before a vault can be opened or authorized: the salt and cost parameters, the second-level hash of the authentication value, the wrapped account key, the public key and encrypted private key. It also stores two-step enrollments, recovery code hashes and organization roles. It is the highest-value target after ciphertext, so fields are separated by sensitivity, access is least-privilege, and backups are encrypted. The challenge is schema evolution without downtime while keeping every wrapped key consistent with its parameters.",
    k: ["One store for accounts and vault data vs separate stores: separation limits what one compromise exposes and allows different access rules, but loses cross-store transactions.", "Hashing email addresses vs storing them: hashing limits breach disclosure, but prevents sending mail and support lookups."],
    p: ["Wrapped keys and parameters are updated in separate steps and a failure leaves an unusable account.", "Support staff have broad read access to account records, widening insider risk."],
    v: "Dump a test account row and confirm no master password, master key or account key appears in usable form. Change parameters and confirm the wrapped key and parameters update in one transaction.",
    dep: ["auth-hash", "kdf-parameters"]
  },
  "audit-event-log": {
    s: "A record of security-relevant events, such as logins, item access, sharing changes and policy edits, which administrators and the person can review without exposing secrets.",
    d: "The server records who did what and when for actions it can observe: sign-ins, failed attempts, device approvals, membership changes, collection edits, exports and password resets. Item reads and fills happen on the client, so the client reports them when policy requires, which a modified client can omit. Logs avoid content and use item identifiers. Organization administrators can export them to a monitoring system. The challenge is completeness: events the server cannot see, such as a copy from an unlocked vault, are not logged.",
    k: ["Client-reported access events vs server events only: client reports show reads and fills, but depend on honest clients; server-only events are reliable, and miss most access.", "Retention for a year or more vs short: long retention supports investigations and compliance, but increases stored personal data and its exposure."],
    p: ["Logs include item names or addresses in event text, undoing part of the zero-knowledge design.", "A compromised administrator account deletes or edits log entries covering their actions."],
    v: "Perform a login, a failed login, a collection change and an export on a test organization and confirm each appears with actor, time and identifier, no item content, and cannot be edited by an administrator.",
    dep: ["role-management", "api-gateway", "admin-console"]
  },
  "admin-console": {
    s: "The administrative interface for organizations: members, groups, policies, event log, billing and reports, built to manage access without ever displaying secrets.",
    d: "It is a web client talking to organization endpoints that return membership, role and policy data and ciphertext only where an administrator holds keys. It supports invitation, confirmation, removal, group edits, policy toggles, export of events and usage reports. Reports use metadata the server holds, or health data that members' clients report. Strong authentication and a separate role are expected for administrators. The challenge is power: this console is the most sensitive surface of the service, since administrator actions change who can decrypt what.",
    k: ["Separate administrator authentication vs the same login: stronger separate controls protect the most powerful actions, but add friction for routine tasks.", "Reports from server metadata vs client-reported health: metadata is reliable and limited, while client reports give richer insight and must be trusted from the client."],
    p: ["An administrator's session is hijacked and the attacker confirms their own account into the organization.", "Bulk actions apply to the wrong group because filters were not clear and cannot be undone."],
    v: "Perform each administrative action on a test organization and confirm it needs the expected role, is recorded in the event log, and that no screen ever shows a stored password or encrypted item contents.",
    dep: ["role-management", "org-policies", "audit-event-log", "api-gateway"]
  },
  "breach-range-service": {
    s: "A lookup service that answers hash-prefix queries against a corpus of known exposed passwords, returning candidate suffixes without learning which password was checked.",
    d: "The corpus is stored sorted by hash. A request carries a short prefix and the service returns every suffix beginning with it, with counts. The service may add padding entries so responses are of similar size. Updates ingest new breach dumps regularly. Because the data is public and the query reveals little, it can be cached at the edge. The challenge is volume and trust: the corpus is large, its provenance varies, and the service must not log full queries tied to accounts, or the privacy property is lost.",
    k: ["Short prefix with many matches vs long prefix: a short one reveals little but returns large responses; a long one is small and narrows candidates.", "Self-hosted corpus vs a third-party service: self-hosting avoids sending prefixes outside, but requires ingesting and updating a very large dataset."],
    p: ["Request logs tie hash prefixes to account identifiers, weakening the privacy property.", "The corpus update is delayed, so a newly published breach is not detected for weeks."],
    v: "Query a known-breached test hash prefix, verify the response includes the matching suffix and count, and verify server logs contain no account identifier or full hash for the request.",
    dep: ["api-gateway"]
  },
  "mail-service": {
    s: "Sends the account's security email: verification, new device alerts, invitations, emergency access notices and recovery messages, which must carry no secrets.",
    d: "The service renders templates and hands them to a mail relay with signing and sender policy records set up. Messages contain links with one-time tokens that expire. Because mail is a recovery channel and a notification channel, it is also a target: an attacker who controls the mailbox can intercept links. For that reason, the master password and vault are never protected by email alone. The challenge is deliverability and trust: alerts that land in spam fail silently, and phishing imitations of the service's mail train people to click.",
    k: ["Links with short-lived tokens vs codes typed into the client: links are easy, but can be forwarded and prefetched; codes are harder to phish and need an open session.", "Plain notification text vs rich templates: plain text is harder to spoof visually, but less clear for non-technical people."],
    p: ["A mail security scanner follows the one-time link and consumes the token before the person clicks.", "Alert emails land in spam and the person never learns of a new device."],
    v: "Trigger each message type for a test account, confirm each is delivered with valid signing and sender policy, contains no key or password, and that its token works once and expires after the stated time.",
    dep: ["account-database"]
  },
  "self-hosting": {
    s: "A packaged deployment of the server that customers run themselves, giving control of where ciphertext lives at the cost of operating backups, updates and availability.",
    d: "The package bundles the services, database and storage with configuration for a single host or a cluster. The same client works against it. Because the server never sees plaintext, hosting yourself mainly changes who can steal or destroy ciphertext, and who is responsible for availability, updates and TLS. Licensing may limit some organization features. The challenge is operations: customers delay updates, misconfigure access, forget backups, and expose administration pages to the internet.",
    k: ["Self-hosting for control vs managed service: it keeps ciphertext inside the organization, but moves patching, backup and availability to a team that may not have the skills.", "One image with defaults vs configurable components: defaults make a first install easy, but hide choices that matter, such as database durability and mail setup."],
    p: ["The host is not updated for months and runs a version with a known server flaw.", "Backups were never tested and a disk failure destroys every vault with no copy."],
    v: "Install the package on a clean host, create an account, then back up and restore onto a second host and confirm the vault opens identically. Confirm administration endpoints are not reachable from outside the configured network.",
    dep: ["ciphertext-store", "account-database", "api-gateway", "mail-service"]
  },
  "local-vault-cache": {
    s: "The encrypted copy of the vault kept on each device so the app can open offline and quickly, protected by the same keys as the server's copy.",
    d: "After sync the client stores items as ciphertext in a local database or file. Unlock derives or retrieves the keys and decrypts on demand. The cache can include the wrapped account key so unlock works offline. Policies can limit how long the cache lives and delete it on logout. It is a copy of the same data an attacker would want from the server, but sits on a less controlled device. The challenge is that disk-level protection is only as strong as the master password and the derivation cost.",
    k: ["Persist the cache vs fetch on every unlock: persisting is fast and works offline, but leaves ciphertext on a lost device for offline attack; fetching leaves less but needs a network.", "Store the wrapped account key locally vs fetch it: local allows offline unlock, but gives an attacker everything needed except the password."],
    p: ["Cloud backup of the application data folder copies the cache to another service.", "A logout leaves the cache behind, and a later user of the same account profile finds it."],
    v: "Log out and confirm the cache and tokens are deleted. On a locked, still logged-in device, copy the cache files and confirm no item name, username or password can be read without the keys.",
    dep: ["vault-format", "key-hierarchy", "secure-os-storage"]
  },
  "secure-os-storage": {
    s: "The platform facility for keeping small secrets, such as unlock keys and tokens, in hardware-backed or operating-system-protected storage, released only under conditions like biometrics.",
    d: "The client asks the platform keystore to create a key that never leaves hardware where supported, with usage constraints such as requiring user presence or biometrics. It encrypts small secrets under that key and stores the result. Different platforms offer different guarantees, from secure hardware to a file protected by the user's login. The client must degrade honestly: a weaker store gets weaker claims. The challenge is the variety, and that any process running as the same user can often ask the store for the same secret.",
    k: ["Hardware-backed key with user-presence constraint vs software storage: hardware resists extraction, but is not available everywhere and can be wiped by platform changes.", "Per-application access control vs per-user: per-application stops other programs from asking, but relies on platform support and can be bypassed by code injection."],
    p: ["A secret stored under a user-level key is read by any program running as that user.", "A platform update changes keystore behavior and every stored unlock key becomes unreadable."],
    v: "Store a test unlock key, attempt to read it from another process and from a copied data folder on another machine, and confirm both fail. Confirm the client reports which protection level the platform provided.",
    dep: []
  },
  "memory-hygiene": {
    s: "Practices that shorten how long decrypted secrets stay in memory, such as zeroing buffers, avoiding copies, locking pages out of swap and clearing state on lock.",
    d: "Keys and passwords are kept in dedicated buffers that are overwritten after use, and are excluded from crash dumps and swap where the platform permits. Managed runtimes make this hard because strings are immutable and copied, and garbage collectors move data. Sensitive values are held as byte arrays and cleared explicitly. On lock, the client drops references and clears caches. The challenge is that it cannot be perfect: an attacker who dumps memory while the vault is unlocked gets what is there, and hygiene only narrows the window.",
    k: ["Zeroing buffers explicitly vs relying on the runtime: explicit clearing shortens exposure, but is error-prone and ineffective where the runtime copies values.", "Excluding pages from swap vs allowing it: excluding avoids secrets written to disk, but needs privileges and increases pressure on locked memory."],
    p: ["A password is converted to a string for convenience and copies persist in memory long after lock.", "A crash reporter uploads a memory dump containing an unlocked vault."],
    v: "Unlock, fill a credential, lock, then dump process memory and search for the password and key bytes, confirming none are found. Confirm crash dumps and swap contain no plaintext on a forced crash.",
    dep: []
  },
  "screen-capture-protection": {
    s: "Prevents screenshots, screen recording and app-switcher previews from capturing secrets shown in the interface, on platforms that allow it.",
    d: "The client marks sensitive windows or views as secure so the system blocks capture and shows a blank frame in task switchers. It hides passwords by default and requires a click to reveal. Mobile platforms offer a secure window flag, desktop platforms offer content protection with varying support. It cannot stop a camera pointed at the screen or malware with higher privilege. The challenge is usability, since people legitimately want to screenshot a recovery code, and the setting must be explicit.",
    k: ["Block capture by default vs allow with warning: blocking prevents accidental leaks to photo libraries, but frustrates people saving recovery information, who then use worse methods.", "Hide passwords until clicked vs show: hiding defeats shoulder-surfing, but adds a click per use."],
    p: ["The app switcher stores a snapshot of the unlocked vault that another person can view.", "Screen sharing during a meeting exposes a revealed password to the whole call."],
    v: "Open a password reveal, take a screenshot and open the app switcher, and confirm both show a blank or masked view. Start a screen recording and confirm the protected view is excluded.",
    dep: ["desktop-app", "mobile-app"]
  },
  "process-isolation": {
    s: "Separates the parts of the client that handle secrets from the parts that handle untrusted content, using processes, sandboxes and strict permissions.",
    d: "In the browser extension, keys live in the background context and pages receive only a filled value. In the desktop app, rendering uses a sandboxed process without direct access to keys or the file system, and talks to a privileged process over a narrow channel. Where the app embeds web content, remote content is never loaded in the privileged context. Inter-process messages are validated as untrusted input. The challenge is discipline: a single convenience shortcut that exposes an interface to rendering code collapses the boundary.",
    k: ["Privileged core with a sandboxed interface vs a single process: separation limits damage from a rendering flaw, but adds messaging code and latency for every action.", "Strict message validation vs trusting the sibling process: validation contains a compromised renderer, but needs a maintained schema for every message."],
    p: ["A convenience API exposes a native function to rendering code, and a cross-site scripting flaw becomes full vault access.", "An unvalidated message from the renderer triggers a file write or export."],
    v: "From the rendering process, attempt to call the key store and read vault files, and confirm both are denied. Send malformed and out-of-range messages to the privileged process and confirm they are rejected without effect.",
    dep: ["browser-extension", "desktop-app"]
  },
  "client-updates": {
    s: "The mechanism that delivers new client versions and fixes, through stores or a built-in updater, with signed packages and a way to force upgrade of unsafe versions.",
    d: "Browser and mobile clients update through their stores on the store's schedule. Desktop clients use an updater that downloads a signed package, verifies the signature against an embedded key and replaces the application. The server can set a minimum supported version and refuse older clients. Security fixes need a fast path. The challenge is the dependency on update channels: a compromised updater distributes malicious code to every user, and slow update uptake leaves old clients with known flaws talking to the service.",
    k: ["Mandatory minimum version vs allowing old clients: a minimum removes known-vulnerable code from circulation, but locks out people who cannot or will not update.", "Automatic silent updates vs prompted: silent updates keep fleets safe, but also let a bad release reach everyone at once."],
    p: ["An updater that does not verify signatures lets a network attacker deliver malicious code.", "A server raises the minimum version before the store approves the new client and everyone is locked out."],
    v: "Serve a tampered update package to a test client and confirm signature verification rejects it. Raise the minimum version on a test server and confirm an old client prompts for update instead of syncing.",
    dep: ["release-integrity"]
  },
  "release-integrity": {
    s: "Evidence that the client code people run is the code that was reviewed, through reproducible builds, signed releases and published hashes, so a compromised build system is detectable.",
    d: "Builds run in a controlled pipeline with pinned dependencies. Releases are signed with keys held apart from the build system, and hashes are published. Reproducible builds let independent parties rebuild the same bytes and compare. Dependency updates are reviewed since a password manager is an especially attractive supply-chain target. Source and builds are often published for audit, and third parties perform periodic reviews. The challenge is cost and coverage: the web client cannot be signed in the same way since it is served fresh on each visit.",
    k: ["Reproducible builds vs trusting the build system: reproducibility lets outsiders verify a binary matches source, but takes engineering effort and constrains toolchains.", "Minimal dependencies vs convenient libraries: fewer dependencies shrink the supply-chain surface, but mean more code written and maintained in-house."],
    p: ["A transitive dependency is compromised and shipped in a routine update.", "The signing key lives on the build server, so compromising the pipeline also compromises signatures."],
    v: "Rebuild the published release from source in a clean environment and compare the output hash with the published one. Verify the signature on the release using a key kept off the build system.",
    dep: []
  },
  "threat-model": {
    s: "The written statement of which attackers and failures the design resists, such as a breached server, a stolen device or a phishing site, and which it does not, such as malware on an unlocked machine.",
    d: "It lists assets, such as vault contents, keys and the master password, and adversaries, from a network observer to a malicious server to a person with a stolen laptop. For each it states what is protected, what is leaked and what is out of scope. Design choices trace back to it: zero knowledge answers server breach, origin matching answers phishing. The challenge is honesty: an unstated or optimistic model leads to features that appear secure but fail against the attacker people actually meet.",
    k: ["Assume a fully malicious server vs an honest-but-curious one: the stronger assumption forces key verification and rollback detection, at significant protocol complexity.", "Treat compromised endpoints as out of scope vs mitigate: out of scope is honest, since software cannot defend an owned device, but leaves the most common real attack unaddressed."],
    p: ["Marketing claims about security exceed what the threat model supports and people trust the product beyond its limits.", "The model is written once and never revisited when new features such as sharing or SSO add attackers."],
    v: "For each listed adversary, run an exercise or review that attempts the stated attack and confirm the documented protection holds and each documented leak is the only thing exposed.",
    dep: ["key-hierarchy", "origin-matching", "ciphertext-store"]
  },
  "zero-knowledge-boundary": {
    s: "The line that decides what the server may ever receive: ciphertext, derived hashes and limited metadata, with no plaintext secret and no key able to decrypt one.",
    d: "Every feature is checked against this line. Search runs on the client. Breach checks use partial hashes. Reports use data clients compute. Sharing uses wrapped keys. Anything requiring server-side plaintext, such as emailing a password or previewing contents, is not built. The boundary gives a strong claim: a server breach exposes ciphertext only. Its limits are its metadata, the code the server delivers to web clients, and features that deliberately add a decryption path such as administrator recovery. The challenge is that each convenience request pulls the line inward.",
    k: ["Strict boundary vs convenience features: strict gives a clear breach story, but forbids features like server-side search or password recovery that people ask for.", "Server-supplied web client vs signed local clients: web clients are convenient, but fall inside the boundary because the server supplies the code that handles plaintext."],
    p: ["A new feature quietly sends a plaintext field to the server for analytics or a preview.", "Escrow and recovery features are added without updating the claim that the provider cannot read vaults."],
    v: "Capture all traffic during a full session of typical actions and confirm no password, key, item name or address appears in any request, and that every field the server stores matches the published list.",
    dep: ["plaintext-metadata", "key-hierarchy", "auth-hash"]
  },
  "usability-security-tradeoff": {
    s: "The recurring choice between friction that protects and convenience that people will actually use, set so that the secure path is also the easy one.",
    d: "Aggressive locking, confirmation dialogs and long master passwords protect more, but people respond by disabling them or choosing weak PINs. Autofill that fills exactly on the right origin is both safer and easier than typing. Defaults carry most weight since most people never change them. Each setting has a safe default, an escape hatch and a clear warning. The challenge is measuring: security failures are rare and invisible, while friction shows up in support requests and cancellations, so pressure always runs toward convenience.",
    k: ["Secure defaults with opt-out vs opt-in security: secure defaults protect the majority, but raise friction and churn for some; opt-in leaves most people on the weakest setting.", "Warnings versus blocking: warnings respect judgment but get dismissed; blocking prevents errors and frustrates experienced users."],
    p: ["Frequent re-authentication prompts train people to approve anything, including attacker prompts.", "A convenience option such as fill on load is enabled by default and exploited by hidden forms."],
    v: "Measure the share of accounts that keep each default after thirty days, and run a task study showing a typical person can complete sign-in, save and fill on the safe settings without a workaround.",
    dep: ["unlock-and-timeouts", "autofill-injection", "biometric-unlock"]
  },
  "cryptographic-agility": {
    s: "The ability to replace algorithms, parameters and key sizes over time without losing data, by versioning every format and keeping migration paths tested.",
    d: "Algorithms weaken, hardware gets faster and standards change, so formats carry identifiers and clients support more than one at a time. Agility appears in derivation parameters, cipher envelopes, key sizes and signature types, and in the sync protocol that must carry both. It has a cost: more algorithms mean more code, and a negotiable algorithm can be downgraded by an attacker. The challenge is to keep a short list of well-tested options, upgrade in order, and ensure an attacker cannot select the weaker one.",
    k: ["Many algorithms negotiated vs one fixed with a version number: negotiation adapts fast but allows downgrade; a single version per release is simple and needs a full migration to change.", "Quantum-resistant hybrids early vs waiting: early adoption protects stored data against later decryption, but adds size and unproven code."],
    p: ["An old algorithm is kept readable forever and an attacker forces its use through a crafted record.", "A migration path is written but never exercised, and fails on real data when finally needed."],
    v: "Run a full migration from the oldest to the newest format on a representative vault in a test environment, confirm round-trip equality and confirm records with a downgraded algorithm identifier are rejected.",
    dep: ["format-versioning", "vault-format", "kdf-parameters"]
  },
  "availability-and-recovery": {
    s: "The set of promises about getting back in: what survives a lost device, a forgotten password or a service outage, and which losses are permanent by design.",
    d: "Zero knowledge means the provider cannot restore a vault it cannot read, so availability relies on copies and recovery paths the person controls: multiple devices, offline caches, recovery kits, emergency contacts and exports. Service outages are covered by local caches that work offline. Each path widens the attack surface, so the set is chosen deliberately. The challenge is that people discover the limits only after a loss, which is too late, so the product has to make the limits visible and nudge safe preparation early.",
    k: ["Permanent loss on a forgotten password vs provider-assisted recovery: permanent loss keeps the boundary, but costs people their data; assisted recovery rescues them and adds a decryption path.", "Prompt people to set recovery up early vs on demand: early prompts improve outcomes, but add steps to onboarding that many skip."],
    p: ["A person with a single device and no kit loses it and the entire vault.", "Provider outage during travel leaves no offline copy because the cache was never populated."],
    v: "Run a loss drill on a test account: lose the only device, then restore using each documented path in turn, and confirm each either succeeds or fails exactly as the documentation says.",
    dep: ["recovery-kit", "emergency-access", "offline-mode", "admin-recovery"]
  },
  "telemetry-privacy": {
    s: "Rules for what usage and error data the clients and service collect, designed so analytics never carry vault contents, site names or anything that identifies what a person stores.",
    d: "Operations need crash reports, performance numbers and abuse signals. For a product whose customers' sites and habits are themselves sensitive, even domain names or timing are private. Collection is minimal, opt-in where possible, and scrubbed of item data. Third-party analytics scripts are kept out of the web vault entirely. Server logs avoid identifiers and are kept for short periods. The challenge is the pull of product decisions toward more data, and the fact that stack traces and memory dumps can contain what must never leave.",
    k: ["No client analytics vs limited anonymous counters: none is the strongest promise, but leaves the team blind to broken flows; limited counters help while still revealing usage patterns.", "Short log retention vs long: short limits exposure in a breach, but hampers investigation of abuse reported later."],
    p: ["A crash report attaches a screenshot or memory section containing a revealed password.", "A third-party script added to a marketing page of the same origin gets access to the web vault."],
    v: "Trigger crashes and typical actions on a test account, capture all outbound telemetry, and confirm no item names, addresses or key material appear. Confirm the web vault loads no third-party script.",
    dep: ["zero-knowledge-boundary", "process-isolation", "web-vault"]
  },
});
