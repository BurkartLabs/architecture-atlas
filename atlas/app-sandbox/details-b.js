// Details for the application sandbox plate, part 2: portals and IPC brokering.
ATLAS.details("app-sandbox", {
  "file-chooser-portal": {
    s: "A broker-run file picker: the person chooses a file in trusted UI, and the app receives access to just that file rather than permission to browse the disk.",
    d: "The app asks the broker to open or save a file. The broker draws the dialog in its own process, lets the person navigate the real filesystem, and passes the confirmed choice back as a handle or a temporary mount. The app never sees paths it was not given. This turns a user gesture into the grant. It is hard because apps expect paths, because sibling files such as sidecars and project folders are needed, and because the picker itself parses filenames and previews, which is attack surface.",
    k: ["Return an open handle vs a path the app opens: handles cannot be redirected after the choice; paths are what existing code expects but invite races.", "Grant one file vs its containing folder: one file is tight but breaks apps needing neighbors; the folder is convenient and over-grants."],
    p: ["Returned path points outside the app's view, so the next open fails and developers request a broad permission instead.", "A picker that follows symlinks returns a file other than the one shown to the person."],
    v: "Pick one file through the portal from a confined app and confirm it can read exactly that file, cannot list the parent directory, and loses access after the grant lifetime ends.",
    dep: ["document-handles", "handle-passing", "request-authorization"]
  },
  "document-handles": {
    s: "Stable references to files the person has shared with an app, kept by the broker so access persists across launches without exposing real paths.",
    d: "When a grant should outlive a single session, the broker stores a document identifier mapped to the real file and exposes it in a private mount, under a path unique to the app. The same identifier can be reopened later, and it follows renames. Revocation deletes the mapping. It is hard because the identifier layer is a small virtual filesystem with its own consistency rules: moved, deleted and network files, access modes, and permissions must be right and cannot trust names supplied by the app.",
    k: ["Broker-side mapping vs passing real paths: mappings hide the layout and allow revocation; real paths are simpler, leak structure and cannot be taken back.", "Persist across launches vs per-session: persistence supports recent files and projects; per-session limits the lifetime of any mistaken grant."],
    p: ["Identifiers that are guessable or reused give one app access to another's documents.", "A file replaced by a link to a sensitive target stays accessible through its old identifier."],
    v: "Grant a document, restart the app, reopen it by identifier, then revoke and confirm the identifier no longer resolves. Rename the underlying file and confirm the identifier still points to it before revocation.",
    dep: ["mount-namespace", "consent-store"]
  },
  "camera-microphone-portal": {
    s: "A broker service that opens capture devices on behalf of an app after consent, streaming frames or samples through a controlled channel.",
    d: "The app never opens the device node. It asks the portal, which checks the grant, shows the usage indicator, opens the device, and passes a stream endpoint back. Format negotiation, device selection and echo handling live in the service. Because it owns the device, it can mute, revoke or stop streams at once. It is hard because capture stacks are large, the device drivers parse untrusted formats, and the stream must be fast enough for real-time use while still passing through the trusted side.",
    k: ["Stream through the broker vs pass a device handle: streaming gives full control and revocation at the cost of copies and latency; handle passing is fast and cannot be recalled.", "One shared capture service vs per-app sessions: sharing saves hardware but lets a bug cross apps."],
    p: ["Two apps request the device and one receives the other's frames because of session mix-up.", "A restricted-quality grant is bypassed when the app negotiates a higher resolution after the fact."],
    v: "Open the microphone from a confined app with and without a grant. With none, the open fails and no indicator shows; with one, samples arrive and the indicator names the app. Revoke and confirm samples stop.",
    dep: ["request-authorization", "usage-indicators", "handle-passing"]
  },
  "screen-capture-portal": {
    s: "A brokered way to share a window or screen content with an app, where the person picks what is shared and the app gets only that.",
    d: "An app that wants pixels from other windows asks the portal. The person selects a screen, window or region in a system picker, and the compositor streams just that surface, often as shared GPU buffers. The capability is dangerous because screens contain other apps' secrets, so it needs explicit per-session consent, an on-screen indicator and the ability to stop at any moment. It is hard because the compositor must filter secure content, handle window moves and resizes, and avoid giving the app a way to read everything.",
    k: ["Per-session user choice vs standing permission: per-session is safe and tiresome for recorders; standing permission is convenient and a major privacy loss.", "Pixel stream vs window handles for the app to render itself: pixels are simple and universal; handles keep content out of the app but fit fewer uses."],
    p: ["Shared region includes notifications or secure fields that appear over it after selection.", "A session left running after the app is closed keeps capturing."],
    v: "Share one window with a test recorder. Confirm frames contain only that window, a second window moved over it is excluded, the indicator shows, and ending the share from the system UI stops frames.",
    dep: ["gpu-access-mediation", "usage-indicators", "request-authorization"]
  },
  "gpu-access-mediation": {
    s: "Controlling how a confined process reaches the graphics processor, whose drivers are large, complex and run partly in the kernel.",
    d: "Rendering needs device access, but GPU drivers expose a large kernel interface. Designs include a dedicated GPU process that owns the device and serves command buffers from confined apps, validation of command streams, and per-app memory limits. Shared buffers go to the compositor as handles. It is hard because performance depends on a thin path, because drivers are a rich source of kernel bugs, and because blocking the driver interface completely breaks acceleration for apps that need it.",
    k: ["GPU process that proxies commands vs direct device access with a filter: a proxy isolates driver bugs but adds copies and latency; direct access is fast and exposes the driver to the app.", "Validate command streams vs trust the driver: validation blocks malformed input and costs CPU; trust relies on driver quality."],
    p: ["The device node is allowed in the profile for convenience, giving the app the full driver interface.", "GPU memory from one app is readable by the next because the driver did not clear it."],
    v: "Run a rendering workload in a confined app and confirm it draws, then check which device interfaces its profile allows. An attempt to call an unlisted driver operation must be denied, and a fresh allocation must read as zeros.",
    dep: ["syscall-filter", "handle-passing", "kernel-surface-reduction"]
  },
  "media-decode-service": {
    s: "A separate, tightly confined process that decodes untrusted images, audio and video so a flaw in a parser does not compromise the app or the broker.",
    d: "Media parsers are large and handle attacker-controlled bytes, so they are a common exploit entry point. The service gets compressed data in and returns decoded buffers out, with no file, network or device access beyond that. Each decode may run in a fresh process or a reused one. It is hard because buffers cross a trust boundary at high rates, because hardware decoders need device access that weakens the confinement, and because format coverage keeps growing.",
    k: ["Software decode in a locked-down process vs hardware decode with device access: software is isolated and slower; hardware is efficient and needs a wider hole.", "Fresh process per file vs a long-lived worker: fresh processes limit damage and cost start-up; reuse is fast and lets one bad file affect later ones."],
    p: ["The decoder inherits the app's file permissions through convenience and a flaw reads unrelated files.", "Output buffers are trusted by the caller, so a malformed size field causes memory errors there instead."],
    v: "Feed a corpus of malformed files to the service while watching its denials. It must crash or reject cleanly, any attempt to open a file or socket must be denied, and the caller must stay up.",
    dep: ["helper-process-types", "syscall-filter", "handle-passing"]
  },
  "clipboard-mediation": {
    s: "Brokering copy and paste so apps get clipboard contents only on a user action and cannot watch it continuously.",
    d: "The clipboard holds data from every app, including passwords. A sandboxed app reading it silently could harvest secrets. Mediation ties reads to a user gesture or the focused window, filters or labels sensitive entries, and can convert formats in the broker rather than the app. Writes are accepted from the focused app. It is hard because legitimate tools such as clipboard managers need broad access, because drag and drop and paste share semantics, and because data formats carry active content.",
    k: ["Read only on focus and gesture vs allow background read with a prompt: gesture rules block snooping but break clipboard managers; prompts handle exceptions and add friction.", "Pass raw bytes vs sanitize in the broker: sanitizing prevents format-based attacks and may alter content people expect to keep."],
    p: ["Focus checks can be satisfied by a brief invisible window, so a background app reads at will.", "Sensitive entries marked as such by the source remain readable by any app that asks for all formats."],
    v: "Copy a marked secret in one app, then from a background confined app request clipboard contents repeatedly. All must be denied. A user-gesture paste in a foreground app must succeed.",
    dep: ["request-authorization", "broker-channel"]
  },
  "print-share-portals": {
    s: "Brokered system actions such as printing, sharing to another app and opening a link, which a confined app triggers without having printer, contact or launch access.",
    d: "The app sends a document or URL to a broker service. The service shows a chooser, and sends the content to the printer, target app or default handler, using its own authority. The receiver treats the input as untrusted. This keeps the printer stack, address books and process launching out of every app's profile. It is hard because the target is another app with its own sandbox, handoff data can carry links or commands, and the chooser must not reveal which other apps exist.",
    k: ["Hand content to the target through the broker vs let the app launch it: brokered handoff keeps launch rights out of apps; direct launch is simpler and lets apps start anything.", "Show all matching targets vs a curated list: full lists enumerate installed software; curated lists leak less and limit choice."],
    p: ["Opening a URL with an unchecked scheme starts a local handler with attacker-chosen arguments.", "Shared content is staged in a world-readable temporary location other apps can read."],
    v: "From a confined app, ask to open links with several schemes, including a file path and a custom handler. Only schemes on the allow list should proceed, and the staged content must be unreadable by other apps.",
    dep: ["broker-channel", "request-authorization", "document-handles"]
  },
  "device-access-portal": {
    s: "Brokered access to hardware such as USB, serial, Bluetooth and location, granted per device after consent and passed as a scoped handle.",
    d: "The app asks to use a device class. The broker lists permitted devices, shows a chooser, opens the selected one and passes a handle limited to that device and the operations allowed. Raw device nodes are never visible in the app's filesystem view. Hot-plug and removal must be reported cleanly. It is hard because device protocols are complex, because vendors expose quirky and powerful control commands, and because a handle to one function of a composite device can reach others.",
    k: ["Per-device grants vs per-class grants: per-device is precise and prompts often; per-class is smoother and reaches every matching device.", "Filter commands in the broker vs pass the raw handle: filtering blocks dangerous requests and must understand each protocol; raw handles are simple and powerful."],
    p: ["A composite device exposes a storage function through the same handle as an input function that was granted.", "A device unplugged and replaced by a different one keeps the old grant."],
    v: "Grant one USB device to a test app, confirm it can talk only to that device, then plug in a second identical one and confirm it is not accessible until separately chosen.",
    dep: ["handle-passing", "consent-store", "request-authorization"]
  },
  "broker-channel": {
    s: "The single narrow communication channel between the confined process and the trusted broker, over which every request for outside resources must travel.",
    d: "Typically a local socket or message pipe created before the target starts and passed in as an already-open handle, since the target cannot create connections itself. It carries framed messages with a small set of types, and can carry file handles. The broker side reads untrusted input, so it is parsed with minimal code. It is hard because it is the sandbox's real attack surface, because the app depends on its latency, and because every new feature adds a message type that someone must defend.",
    k: ["Few generic messages vs many specific ones: generic messages keep the channel small and push meaning into policy; specific messages are easier to validate and grow the surface.", "One channel per service vs a shared channel: separate channels allow different privileges and cost handles; one channel is simple and concentrates risk."],
    p: ["The channel is opened by name in a location other apps can also reach, so another process connects as the target.", "Large messages are accepted without bound and the broker exhausts memory."],
    v: "Connect a test client to the broker's channel from outside the sandbox without the inherited handle. It must be refused. Send an oversize frame from the target and confirm the broker drops it without allocating the claimed size.",
    dep: ["message-schema-validation", "sandbox-bootstrap"]
  },
  "message-schema-validation": {
    s: "Strict checking of every field in every message the target sends, so malformed or hostile requests are rejected before the broker acts on them.",
    d: "Messages are described by a schema that fixes types, lengths, ranges and allowed enumerations. A generated decoder rejects anything outside it, including unknown fields, truncated frames and trailing bytes. Validation covers meaning too: paths are normalized, identifiers checked against the caller's own, and sizes bounded before allocation. It is hard because schema and handler can drift, because validators written by hand miss cases, and because the broker often runs with more privilege than the sender.",
    k: ["Generated validators from a schema vs hand-written checks: generation is uniform and testable; hand-written code handles odd cases and is the usual source of omissions.", "Reject unknown fields vs ignore them: rejecting keeps the contract strict and breaks forward compatibility; ignoring eases upgrades and lets smuggled data pass."],
    p: ["Length fields are validated after the allocation, so a crafted size consumes memory or overflows.", "A path is checked as a string and used after another layer normalizes it, so the check and the use differ."],
    v: "Run a structured fuzzer against each message type for a fixed budget. Every malformed input must yield a rejection response with no crash, no unbounded memory growth and no state change in the broker.",
    dep: ["broker-channel"]
  },
  "handle-passing": {
    s: "Sending an already-open file, socket or buffer reference across the channel, so the app gets exactly one object and nothing around it.",
    d: "The broker opens the resource under its own authority and sends the descriptor to the target through a message that carries kernel references. The target uses it like any local handle but cannot reopen it elsewhere. Handles can be restricted to read-only, a size, or an operation set, and are cheap compared with proxying every call. It is hard because a handle's power depends on the kernel object, because duplicates and inheritance spread it, and because revoking one already in the app's table is difficult.",
    k: ["Pass a handle vs proxy each operation: handles give native speed and cannot be revoked easily; proxying allows per-call checks and costs performance.", "Handles with restricted rights vs full ones: restricting rights minimizes harm and relies on the kernel supporting that restriction for the object type."],
    p: ["The passed descriptor is a directory handle that lets the app open anything beneath it, including parent traversal.", "A handle the app forwards to another process spreads access beyond the original grant."],
    v: "Pass a read-only file handle and confirm the target can read but not write, truncate or reopen the path. Try to pass it onward to a second process the policy forbids and confirm that is denied.",
    dep: ["file-handle-capabilities", "broker-channel"]
  },
  "request-authorization": {
    s: "The check the broker performs on each request: who is asking, what for, whether policy and consent allow it, and whether the arguments stay inside the grant.",
    d: "The broker identifies the caller from the channel itself, not from a field in the message, then evaluates entitlements, the consent store, managed policy and the specific arguments. Decisions are logged. Authorization is done at the moment of use, not at open, and an object reference is checked against the caller's own grants. It is hard because the confused-deputy problem lurks everywhere: a service that holds authority and obeys a request must be sure the requester had the right to ask.",
    k: ["Central authorization function vs checks in each service: central checks are consistent and auditable; per-service checks know the context and get forgotten.", "Authorize on every call vs on open only: every call catches revocation and costs time; open-only is fast and leaves stale rights."],
    p: ["The service trusts an application identifier in the request body, so one app acts as another.", "Authorization checks the path while the action uses a different object resolved later."],
    v: "Have app A send a request naming app B's document identifier and confirm denial. Then revoke A's grant mid-session and confirm the next request on a previously valid handle is refused.",
    dep: ["consent-store", "entitlements", "target-identity-binding"]
  },
  "ipc-rate-limits": {
    s: "Limits on how many requests, how much data and how many open handles a confined app may demand from the broker, so a bad app cannot starve everyone.",
    d: "The broker tracks per-app counters for requests per second, outstanding calls, memory held in queues and handles issued. Excess requests are delayed or rejected. Expensive operations such as prompts and device opens get stricter budgets. Without limits one app can exhaust the broker and turn a sandbox into a denial of service for every application. It is hard to choose values that stop abuse but leave legitimate bursts such as opening many files at start-up alone.",
    k: ["Hard limits that fail requests vs backpressure that slows them: failing is simple to reason about and breaks bursty apps; backpressure is gentler and lets a flooder consume time.", "Per-app limits vs a global limit: per-app isolates abuse and requires identity tracking; global is simple and lets one app starve others."],
    p: ["Prompts are not rate limited, so an app opens dialogs continuously until the person accepts.", "Counters reset on app restart, so a crash loop restores the full budget each time."],
    v: "Run a flooding client against the broker alongside a normal client. The flooder must be throttled or rejected, and the normal client's latency stays within its target.",
    dep: ["broker-channel", "target-identity-binding"]
  },
  "service-directory": {
    s: "The list of broker services a given app may find and call, so unrelated services are not even visible, never mind reachable.",
    d: "At launch the target receives channels only to services its profile names. A directory resolves logical names to endpoints and answers only for permitted names. Hiding the rest reduces probing and information leaks about the installed system. Services register at boot or on demand. It is hard because dependencies between services are indirect, new services must not become visible to old profiles by default, and a lookup that answers differently for existing and forbidden names leaks which exist.",
    k: ["Pre-connected channels vs lookup at runtime: pre-connected channels are simple and fixed at launch; runtime lookup is flexible and needs a trusted lookup path.", "Same error for missing and forbidden vs distinct errors: identical errors reveal nothing; distinct errors help developers and attackers equally."],
    p: ["A service registered under a predictable name lets a malicious app register first and impersonate it.", "Newly added services are visible to every profile until someone writes a rule."],
    v: "From a confined app, look up one permitted and one forbidden service name. The permitted one resolves and works; the forbidden and a nonexistent name must produce an identical response.",
    dep: ["broker-channel", "policy-loading"]
  },
  "bus-name-filtering": {
    s: "Filtering which named services, methods and signals an app can reach on a shared message bus, so access is limited to what its policy lists.",
    d: "Where services talk over a common message bus, the bus daemon enforces rules on who may send to which name, which method or interface, and which signals can be received. Rules match on the caller's identity and the destination. This lets system services stay on a shared bus while apps see only a slice. It is hard because default rules are often permissive, because method-level rules are numerous, and because broadcast signals leak data to every subscriber.",
    k: ["Method-level rules vs service-level rules: method rules are tight and numerous; service-level rules are short and expose everything a service offers.", "Enforce in the bus daemon vs in each service: daemon enforcement is uniform and a single point of failure; service enforcement is distributed and varies in quality."],
    p: ["Owning a well-known name lets an app intercept messages meant for a system service.", "Broadcast signals carrying private data reach every confined app that merely subscribes."],
    v: "From a confined app, call a permitted method and a forbidden method on the same service, then subscribe to a protected signal. Only the first should succeed, and each denial should be logged with the rule that fired.",
    dep: ["service-directory", "request-authorization"]
  },
  "call-deadlines-cancellation": {
    s: "Time limits and cancellation on every broker call, so a hung service or a slow app cannot block the other side forever.",
    d: "Each request carries or inherits a deadline. If the broker is waiting for a person to answer a prompt, a device or another service, it times out and returns an error; if the app goes away, outstanding work is cancelled and handles closed. Cancellation must unwind partial state: half-opened devices, temporary files, pending prompts. It is hard because blocking calls make deadlocks possible when a service calls back into the app, and because cancellation must be safe against races with completion.",
    k: ["Short deadlines vs patient waits: short deadlines keep the broker responsive and fail legitimate slow operations such as prompts; long ones tolerate people and tie up workers.", "Async calls vs synchronous calls: async avoids blocking but gives the app more states to handle; synchronous is simple and risks deadlock."],
    p: ["A call waiting on a user prompt blocks a single-threaded service for every other app.", "Cancelled requests leave temporary grants or files behind that never get cleaned up."],
    v: "Start a request that waits on a prompt, kill the app and confirm the prompt closes and the broker's worker is freed within the deadline. Check that no temporary files or grants remain.",
    dep: ["broker-channel", "process-supervision"]
  }
});
