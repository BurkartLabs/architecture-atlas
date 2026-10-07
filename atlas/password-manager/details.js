// Details for the password manager plate, part 1: client surfaces (apps, autofill).
ATLAS.details("password-manager", {
  "browser-extension": {
    s: "The add-on inside the browser that holds the unlocked vault in memory, detects login forms, fills credentials and offers to save new ones as the person browses.",
    d: "It has a background context that holds keys and talks to the server, and content scripts injected into pages that find fields and fill them. The two communicate by message passing, so page scripts never touch keys. A popup or side panel shows the vault. Because the browser may suspend the background context at any time, the extension must rebuild its unlocked state from session storage or require a new unlock. It is hard because it runs beside untrusted pages and must expose almost nothing to them.",
    k: ["Keys only in the background context vs in content scripts: pages cannot reach the keys through script bugs; every fill needs a message round trip and a state that survives suspension.", "Extension store updates vs fetching code from the server: store review limits what a compromised server can push, but fixes ship only as fast as the store approves them."],
    p: ["A suspended background context silently drops the unlocked state, and the next fill fails with no visible reason.", "Overly broad page permissions let a compromise of the extension read every site the person visits."],
    v: "Unlock the vault, open a login page and fill it, then inspect the page's scripting context and confirm no key material or full vault is reachable from it, only the one filled credential.",
    dep: ["client-core-library", "autofill-injection", "form-detection", "native-messaging-bridge"]
  },
  "native-messaging-bridge": {
    s: "A local channel that lets the browser extension ask the desktop app to unlock, so biometrics and platform key storage can open the vault without typing the master password.",
    d: "The browser launches a small helper through a manifest the installer registered, and the two talk over standard input and output with length-prefixed messages. Because any local process could try to impersonate either side, the pair first runs a key exchange: the extension and app agree on a shared secret, and later messages are encrypted and authenticated with it. The app can then release the vault key or a derived unlock key after a biometric check. The hard part is authenticating the extension, since the helper cannot trust the name or path it was started from.",
    k: ["Encrypted channel with a pairing step vs trusting the local pipe: a hostile local process cannot read or forge messages, at the cost of a pairing flow and a way to reset it.", "Releasing the vault key vs releasing a limited unlock token: the full key makes unlock simple, while a token limits harm if the extension is compromised but needs a second derivation step."],
    p: ["A pairing secret stored in a user-readable file lets any local program impersonate the extension and request unlock.", "Different browsers register their helper manifests in different places, so unlock works in one browser and silently fails in another."],
    v: "Enable biometric unlock, restart the browser and confirm the extension unlocks only after a biometric prompt on the app. Then run an unpaired process against the pipe and confirm it is refused.",
    dep: ["desktop-app", "biometric-unlock", "browser-extension", "secure-os-storage"]
  },
  "desktop-app": {
    s: "A standalone application with its own window that offers the full vault, system-wide shortcuts, tray access and the brokering of biometric unlock for other clients on the machine.",
    d: "It embeds the shared client core, keeps an encrypted local cache and holds unlocked keys in process memory. It registers global shortcuts, can type credentials into other applications, and runs the local bridge the browser extension calls. It uses the platform keystore for biometric unlock keys. It is hard because it spans three operating systems with different keystore, window and accessibility rules, and because an embedded web view can widen the attack surface if remote content is ever loaded into it.",
    k: ["Embedded web UI shell vs native widgets: one interface across platforms is cheaper to build and test, but ships a large engine to update and widens the attack surface.", "System-wide auto-type vs fill in browsers only: it works in any application, but simulated keystrokes can land in the wrong window if focus changes between the match and the typing."],
    p: ["Auto-type sends a password into whichever window has focus when a notification steals it.", "Crash reports or logs capture window titles or memory regions that contain vault data."],
    v: "Lock the vault, press the global shortcut and confirm a prompt is required. Then unlock, trigger auto-type into a test field, and confirm the keystrokes land only in the intended window.",
    dep: ["client-core-library", "local-vault-cache", "secure-os-storage", "biometric-unlock"]
  },
  "mobile-app": {
    s: "The phone and tablet client, which holds the vault behind biometrics and registers with the operating system as the provider that fills credentials into other apps and websites.",
    d: "It uses the same core logic as other clients but different storage and lifecycle: the operating system can suspend or kill it at any time, so locking and sync have to be restartable. Keys live in hardware-backed storage released by biometrics. It registers an autofill service and a credential provider for passkeys. Constraints include background execution limits, extension processes with small memory budgets, and platform rules for what the app may do while the screen is locked.",
    k: ["Biometric-gated keystore key vs password re-entry on every launch: fast daily use, but a changed fingerprint set or a reset device forces the full password path, which people forget.", "Do work in a small autofill extension vs hand off to the main app: the extension keeps the flow in place but has little memory for the key derivation."],
    p: ["The operating system kills the app mid-sync and a half-applied change is treated as complete on next launch.", "A backup of the app's data folder to a cloud service copies the cached ciphertext and weakens the device-loss story."],
    v: "Force-stop the app while a sync is in progress, relaunch, and confirm the vault is consistent and the sync resumes. Remove a biometric enrollment and confirm the app demands the master password.",
    dep: ["client-core-library", "os-autofill-service", "secure-os-storage", "biometric-unlock"]
  },
  "command-line-client": {
    s: "A terminal program that reads and writes vault items for scripts and developers, using a session token held in an environment variable instead of an interactive unlock.",
    d: "Login derives the keys as in other clients, then the program prints a session value that is itself a key the program uses to decrypt a local cache. Commands list, get, create and edit items and output text or structured data. It also fetches secrets for build systems. It is hard because a terminal has no secure input channel: arguments appear in process listings, histories keep commands, and long-running scripts hold decrypted values in environment variables that child processes inherit.",
    k: ["Session key in an environment variable vs a prompt per command: scripts can run unattended, but every child process and crash dump can see the key.", "Local cache with sync on demand vs always online: fast repeated reads, but a stale cache can return a rotated password after a change elsewhere."],
    p: ["Passing a password as a command argument leaves it in shell history and process listings.", "A script logs its environment when it fails and writes the session key into a build log."],
    v: "Run a get command with tracing on, and confirm the item appears in output only, never in arguments, the process list or the shell history file. Log out and confirm the old session value no longer decrypts anything.",
    dep: ["client-core-library", "session-tokens", "local-vault-cache"]
  },
  "web-vault": {
    s: "The browser-based client served from the provider's own origin, offering full vault management and account settings without installing anything.",
    d: "Script and styles are fetched on each visit, then do key derivation and encryption in the page using the browser's cryptography interface. It is the client with the weakest integrity guarantee, since the same server that must never see secrets also supplies the code that handles them. Mitigations include strict content security policies, subresource integrity and hosting the static code separately from the API. It also handles flows that need no install, such as accepting an invitation or viewing a shared link.",
    k: ["Code served fresh each time vs signed installable bundles: instant updates and no install, but a compromised server can serve code that steals the master password.", "Strict content security policy vs flexibility: blocking inline script and third-party content closes cross-site scripting routes, but forbids many convenient analytics and widget libraries."],
    p: ["A third-party script loaded for analytics runs with full access to the unlocked vault.", "Caching an old script bundle against a new API leaves the client unable to read new item formats."],
    v: "Load the web vault and list every script origin and inline script it executes. Confirm all are first-party, hashed or nonced, and that a blocked-inline-script report fires when one is injected from the console.",
    dep: ["client-core-library", "api-gateway", "release-integrity"]
  },
  "client-core-library": {
    s: "The single library of cryptography, vault model, sync and validation logic that every client embeds, so a rule is implemented once and behaves identically on all devices.",
    d: "It holds key derivation, encryption, item parsing, sync merge and policy checks, and exposes them to each client's interface layer. Sharing it means a fix reaches every surface and test vectors apply everywhere. It is compiled or bundled for each target. The difficulty is the boundary: platform pieces such as secure storage, networking and random number access must be injected behind interfaces, and the library must keep working with data written by older and newer versions of itself.",
    k: ["One shared core vs per-platform reimplementation: behavior and security fixes stay consistent, but a bug or build problem in the core hits every client at once.", "Thin platform interfaces vs rich ones: keeping the injected surface small makes the core portable, but pushes work such as secure storage details out to each client."],
    p: ["A platform quirk in randomness or memory handling is hidden behind the interface and weakens one client only.", "A core release that changes a data format ahead of server and other clients breaks sync for people on mixed versions."],
    v: "Run one shared set of encryption and derivation test vectors through every client build and confirm identical output bytes. Decrypt a vault written by the oldest supported version with the newest one.",
    dep: ["authenticated-encryption", "master-key-derivation", "item-schema", "sync-protocol"]
  },
  "form-detection": {
    s: "Finds login, registration and password-change fields in a page, including dynamically built forms, and decides which field is the username, password or one-time code.",
    d: "Detection reads field types, names, labels, placeholders, autocomplete hints and layout, and watches the page for new nodes since many sites build forms after load. It scores candidates and classifies the form as login, sign-up, change-password or code entry. Single-page apps that split username and password across steps need stateful handling. It is hard because there is no reliable standard in the wild: custom widgets, shadow trees and obfuscated names defeat simple rules, and false positives can fill secrets into unrelated fields.",
    k: ["Heuristic scoring vs per-site rules: heuristics cover the long tail without maintenance, but each hard site needs special handling, so the product ships a growing exception list.", "Fill on page load vs only on person action: loading-time fill saves a click but lets a hidden form be filled without anyone seeing it."],
    p: ["A site renders a hidden second login form and the manager fills a credential into a field the person cannot see.", "A page redesign changes labels and breaks detection for a popular site until the next release."],
    v: "Run detection against a fixture set of real login pages, including multi-step and shadow-tree forms, and confirm each field is classified correctly. Confirm a hidden form is flagged as not fillable.",
    dep: ["browser-extension", "frame-policy"]
  },
  "origin-matching": {
    s: "Decides whether a stored credential belongs to the page's origin, comparing scheme, host and port by rule so a lookalike domain never receives a password.",
    d: "Each item stores one or more match entries, and the matcher compares them with the current page's address using a chosen rule: exact host, same registrable domain, prefix, regular expression or never. It uses a public suffix list to know where a domain ends. Subdomain handling is the main policy knob. Phishing resistance comes from this step: a person can be fooled by a lookalike address, but the matcher compares exact strings and offers nothing, which is itself the warning.",
    k: ["Match on registrable domain vs exact host: domain matching works across a site's login subdomains, but lets a hostile subdomain on a shared hosting domain receive credentials.", "Strict scheme matching vs ignoring it: requiring HTTPS prevents a downgraded page from capturing the secret, but breaks fill on legacy internal sites."],
    p: ["A shared hosting domain treated as one site gives every tenant a chance to collect each other's credentials.", "Internationalized lookalike hostnames render alike but compare differently, and a manual match rule saved from the display form misses the real one."],
    v: "Store a credential for a bank domain, visit a lookalike with a swapped letter and confirm the manager offers nothing. Visit a hosted subdomain on a shared suffix and confirm the credential is not offered.",
    dep: ["item-schema", "form-detection"]
  },
  "autofill-injection": {
    s: "Writes the chosen credential into the page's fields in a way the site's own code accepts, then clears the credential from its own working memory.",
    d: "The background context sends the credential to the content script for one frame and one form. The script sets values and fires the input, change and keyboard events that frameworks listen for, because a plain value assignment is often ignored by the site's state. It may focus fields in order, then submit. Sites that block paste or use custom inputs need simulated typing. The challenge is the page can observe everything the script writes, so the credential should arrive as late as possible and only after the person's action.",
    k: ["Direct value setting with synthetic events vs simulated keystrokes: events are fast and exact, but custom inputs sometimes ignore them and need slower, key-by-key typing.", "Auto-submit after fill vs leave the form for review: submit saves a step, but it can send a password to a surprising endpoint the person never inspected."],
    p: ["A page script listens for input events on every field and reads the value the instant it is written.", "A framework's state is not updated by assigned values, so the form shows a filled password and still submits empty."],
    v: "Fill a test form built with a state-managed framework and confirm the submitted request carries the credential. Instrument the page and confirm no value was delivered before the person's click.",
    dep: ["origin-matching", "form-detection", "frame-policy"]
  },
  "frame-policy": {
    s: "The rules for filling inside embedded frames: which frame's origin counts, whether a cross-origin frame may be filled, and when to ask the person first.",
    d: "A login form may sit in a frame whose origin differs from the top page, such as a payment or identity widget. The policy checks the frame's own origin against the item, not the top page's, and may require that the top page and frame be related. It blocks filling into frames that are hidden, tiny or off screen. It treats sandboxed or null-origin frames as unfillable. The difficulty is that legitimate designs and clickjacking-style embeds can look alike, so the default must prefer refusal.",
    k: ["Match the frame's own origin vs the top page's: the frame's origin is what receives the secret, but a legitimate single sign-on frame may lack a stored match and need an explicit prompt.", "Silent fill vs confirmation for cross-origin frames: confirmation blocks hidden-frame theft, at the cost of an extra click on legitimate embedded logins."],
    p: ["A hostile page embeds the real login in an invisible frame and overlays its own button to trigger a fill.", "A sandboxed frame reports an opaque origin, and a lax matcher treats it as the parent."],
    v: "Load a page embedding a login frame from another origin, with the frame hidden, and confirm no credential is offered. Make it visible and same-origin and confirm fill works.",
    dep: ["origin-matching", "browser-extension"]
  },
  "os-autofill-service": {
    s: "The registration with the mobile operating system that lets the manager supply credentials to other apps and browsers through the platform's own fill interface.",
    d: "The operating system sends a structured description of the focused app or page with its fields. The manager answers with matching credentials, shown in a keyboard bar or a dropdown, and the person authenticates with biometrics before the reply is released. Apps are matched by a verified link between the app's identity and the site, published by the site as a declaration file. The challenge is that the interface is narrow, memory-limited and varies by version, and apps without verified links must fall back to weaker matching.",
    k: ["Verified app-to-site association vs matching by app name: verification prevents a lookalike app from receiving credentials, but only works where the site published the declaration.", "Inline suggestions vs a full-screen picker: inline is quicker, but it exposes the match list before authentication in some versions."],
    p: ["A lookalike app with an unverified identity is offered a bank password because matching used the display name.", "The fill service is disabled by an operating system update and the person loses autofill without any notice."],
    v: "Open a banking app with a published site association and confirm its login is offered after biometrics. Install a lookalike app lacking the association and confirm nothing is offered.",
    dep: ["mobile-app", "origin-matching", "biometric-unlock"]
  },
  "save-update-prompts": {
    s: "Notices when a person submits a new or changed password in a page and offers to store or update the matching vault item.",
    d: "The content script observes form submission and navigation, captures the submitted values and sends them to the background, which compares them with stored items for that origin. It proposes saving a new login, updating a changed password, or ignoring it if nothing changed. Prompts appear as a bar in the page or a notification. Detection is hard: single-page sites submit without navigating, failed logins look like successful ones, and a prompt after a typo would overwrite a good password with a bad one.",
    k: ["Prompt on every submission vs after a successful navigation: prompting early catches single-page sites, but saves wrong passwords from failed attempts.", "Silent auto-save vs asking: silent saving captures every account, but changes the vault without consent and can overwrite a known-good entry."],
    p: ["A mistyped password is saved over the working one and the person is locked out of an account.", "A site's change-password form posts values that the manager misreads as a login and stores in the wrong item."],
    v: "Submit a new account form and confirm the prompt offers a new item. Change the password on an existing one and confirm the offer is an update. Submit a wrong password and confirm no overwrite happens.",
    dep: ["form-detection", "origin-matching", "item-schema"]
  },
  "clipboard-handling": {
    s: "Copies a secret for pasting into places autofill cannot reach, then removes it from the clipboard after a short delay and marks it as sensitive where the platform allows.",
    d: "The client places the value on the system clipboard, marks it so clipboard history and cross-device sync skip it where the platform supports that, and schedules a clear after a set time, typically under a minute. It clears only if the clipboard still holds that value, to avoid erasing something the person copied since. It is hard because other programs can read the clipboard at any moment, and some platforms keep history that the manager cannot control.",
    k: ["Timed clear vs leaving the value until replaced: a clear shrinks exposure, but breaks workflows where the person pastes later or needs several pastes.", "Clear only if unchanged vs always clear: checking avoids destroying new content but requires reading the clipboard, which some platforms show as a privacy notice."],
    p: ["Clipboard history records the password and keeps it long after the timed clear.", "The clear timer is lost when the app is suspended, so the secret remains indefinitely."],
    v: "Copy a password, wait for the timeout and confirm the clipboard is empty and absent from clipboard history. Copy something else in the interval and confirm the manager leaves it alone.",
    dep: ["desktop-app", "memory-hygiene"]
  },
});
