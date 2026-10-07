// Details for the text editor plate, part 5: extension platform, remote work and collaboration.
ATLAS.details("text-editor", {
  "extension-manifest": {
    s: "A declarative file in each extension naming it, its version, entry point, required editor version, activation conditions and everything it adds to the editor.",
    d: "The manifest is data the editor reads without running any extension code. It lists identity and version, the entry file, the compatible editor version range, dependencies on other extensions, activation events, and contributions: commands, languages, settings, themes, menus and keybindings. Because it is static, the editor can show the extension's features, validate it and decide when to load it, all before executing anything. It is hard because the manifest becomes a compatibility contract, and mistakes in it are only found when an extension fails to appear.",
    k: ["Declarative manifest vs. code that registers everything: declarations let the editor know features without loading code, but limit what can be contributed statically.", "Strict schema validation vs. tolerating unknown fields: strictness catches typos, while tolerance lets newer extensions run on older editors."],
    p: ["An extension declaring contributions it never implements shows commands that do nothing.", "A missing version range makes an old extension load into an editor it cannot work with."],
    v: "Install an extension with a malformed manifest and one with a newer required editor version. The first reports a clear validation error, the second is disabled with an incompatibility message, and neither runs any code.",
    dep: []
  },
  "contribution-points": {
    s: "The named places where an extension can add to the editor declaratively: commands, menus, languages, grammars, themes, settings, views, keybindings and snippets.",
    d: "Each contribution point has a schema and a consumer inside the editor. Menus take command identifiers with context conditions and placement groups, languages add file associations and configuration, grammars and themes add data files, and views add panels backed by a provider the extension supplies when activated. Because contributions are data, the editor can render them before activation and disable them cleanly. It is hard because every new point is a permanent promise, and conflicts between extensions need defined rules.",
    k: ["Many specific contribution points vs. one generic registration API: specific points are discoverable and validated, but the list of them keeps growing.", "Contributions are visible before activation vs. only after: visibility lets features appear instantly, but means a menu item may wait for a slow activation when clicked."],
    p: ["Two extensions contributing a grammar for the same file type compete, and the winner depends on load order.", "A contribution that references a missing command identifier shows a dead menu item."],
    v: "Install an extension contributing a command, a menu item, a language and a theme. All appear without activating its code, and invoking the command activates it on first use.",
    dep: ["extension-manifest","command-registry"]
  },
  "activation-events": {
    s: "Conditions that tell the editor when to load an extension, such as opening a language, running a command, starting up or finding a file pattern, so unused ones cost nothing.",
    d: "An extension lists the events that should activate it. The editor watches for them: a file of a language opened, a declared command invoked, a view expanded, a matching file in the workspace, or a late startup signal. The first matching event loads the extension host side code and calls its entry function. Lazy activation keeps startup fast and memory low. It is hard because too narrow an event makes features missing until some trigger occurs, while broad events such as activate on startup erase the benefit.",
    k: ["Lazy activation by events vs. activate everything at startup: lazy keeps launch fast, but the first use of a feature has a delay and relies on correct declarations.", "Infer events from contributions vs. require explicit declaration: inference removes boilerplate, but hides the cost of broad contributions."],
    p: ["An extension that activates on every startup, added by one author, slows every launch for all its users.", "A language feature missing its activation event works only after the user runs an unrelated command."],
    v: "Install ten extensions and start the editor with no files. None of them load. Open a file of the language one declares, and exactly that one activates, which the extension log confirms.",
    dep: ["extension-manifest","extension-host"]
  },
  "extension-host": {
    s: "The process or worker that loads and runs extension code, separate from the interface, with a proxy for the editor's API and a protocol back to the main process.",
    d: "Extension code does not run in the interface process. A host process loads activated extensions, gives them an API object, and relays their calls to the main process over a message channel while forwarding editor events, such as document changes, back. The host tracks activation, errors and timing for each extension. It may be one process shared by all or several for isolation or per-location, as for a remote workspace. It is hard because the API is asynchronous across a boundary, so extensions can never read editor state synchronously.",
    k: ["One shared host vs. one per extension: sharing is light on memory, while separate hosts contain crashes and hangs at a higher resource cost.", "Mirror editor state in the host vs. request on demand: mirroring makes reads instant, but costs memory and keeps copies that must stay in sync."],
    p: ["A single extension in an endless loop stalls all others sharing the host.", "The host receiving document changes out of order leaves its mirror different from the editor."],
    v: "Install an extension that loops forever. The editor stays responsive, typing is unaffected, the slow extension is named in a notification, and restarting the host reloads the others in seconds.",
    dep: ["extension-isolation","extension-api","activation-events"]
  },
  "extension-api": {
    s: "The public set of objects and functions through which extensions read and change editor state: documents, editors, commands, views, workspace and language features.",
    d: "The API exposes a controlled view of the editor: text documents and edits, selections, workspace folders and file system, command registration, language feature providers, status bar items, trees and input boxes. Calls cross the process boundary as asynchronous messages. Providers are registered per language and queried when needed. Disposable handles let the editor clean up when an extension unloads. It is hard because it must be broad enough to build real features, narrow enough to keep stable, and safe against misuse.",
    k: ["Wide API with direct access vs. narrow provider-style API: wide APIs enable ambitious extensions, but freeze the editor's internals into a public contract.", "Asynchronous only vs. synchronous reads of a mirrored state: asynchronous is honest about the boundary, while mirrored reads are convenient but can be stale."],
    p: ["An extension holding a document reference after closing sees an object frozen in an old state.", "An API function with no cancellation lets a slow provider queue requests forever."],
    v: "Write a test extension that registers a command, a completion provider and a status item, edits a document and reads the workspace. Each works, and disposing the extension removes all of its registrations.",
    dep: ["extension-host","command-registry","text-buffer-interface"]
  },
  "extension-isolation": {
    s: "Keeping extension code in its own process or sandbox so crashes, hangs and memory leaks in one extension cannot take down the editor or other extensions.",
    d: "Extension code runs outside the process that handles input and painting. The operating system's process boundary stops its crashes and memory growth from reaching the editor. Resource accounting measures CPU time and memory per extension or host, and the editor can kill and restart a misbehaving host. Some designs add a sandbox that limits file and network access. It is hard because strong isolation is expensive in messages and memory, and process separation alone does not stop an extension from doing anything the user can.",
    k: ["Process isolation without a permission sandbox vs. a full sandbox: process isolation protects stability cheaply, while a full sandbox protects security but limits what extensions can do.", "Kill unresponsive hosts automatically vs. ask the user: automatic restart protects responsiveness, but can lose state inside the extension."],
    p: ["A memory leak in one extension grows until the operating system kills the whole host and all extensions with it.", "Treating process isolation as security leaves extensions able to read any file the user can read."],
    v: "Make a test extension allocate memory without limit and another throw on every event. The editor stays responsive, the leaking host is restarted when it passes the limit, and the other extension keeps working.",
    dep: ["extension-host","background-workers"]
  },
  "extension-permissions": {
    s: "Declared and enforced limits on what an extension may do, such as reading files, using the network or running programs, and how the user learns of them.",
    d: "Extensions can run programs, read files and send data over the network, so installing one is a trust decision. Platforms respond with a mix of publisher verification, install-time warnings, declared capabilities in the manifest that gate API access, and restricted modes for untrusted workspaces. Some enforce capabilities in a sandbox while others only declare. It is hard because users cannot judge code they cannot read, and declared capabilities that are not enforced give false confidence.",
    k: ["Enforced capability sandbox vs. trust-based model with review: enforcement truly limits damage, but constrains extensions and requires a lot of API design.", "Fine-grained permissions vs. few coarse ones: fine-grained is precise, but users stop reading prompts when there are many."],
    p: ["An extension updated to request new capabilities silently gets them if update does not re-prompt.", "Declared but unenforced permissions let a malicious extension do what it never listed."],
    v: "Install a test extension that declares no network access and tries to open a connection. The attempt is blocked and logged, and an update requesting network access prompts the user before taking effect.",
    dep: ["extension-manifest","extension-isolation"]
  },
  "extension-registry": {
    s: "A catalog service and client for finding, installing, updating and removing extensions, with publisher identity, signatures, ratings and version metadata.",
    d: "The client queries a registry for extensions, downloads packages, verifies signatures, unpacks them to a local directory and registers them with the host. Updates are checked in the background and applied on restart or live. Packages carry the manifest, code and assets. Registries add publisher verification, malware scanning, download counts and takedown. It is hard because the registry is a supply chain: the editor runs code from many authors with the user's rights, and updates arrive without review by the user.",
    k: ["Central registry vs. installing from arbitrary sources: central registries can scan and revoke, but concentrate control and cost.", "Automatic updates vs. manual: automatic updates deliver security fixes quickly, but also deliver a compromised release to everyone at once."],
    p: ["Typosquatted names with a similar look to popular extensions trick users into installing malware.", "An update that breaks an extension auto-installs everywhere before anyone notices."],
    v: "Install an extension from the catalog on a clean profile. The signature is verified before unpacking, a tampered package is rejected, and revoking a version causes clients to disable it.",
    dep: ["extension-manifest","extension-permissions"]
  },
  "api-versioning": {
    s: "Rules for evolving the extension API without breaking existing extensions: version ranges, deprecation periods, stable and proposed interfaces and compatibility testing.",
    d: "Each extension declares the editor version it needs, and the editor refuses or warns for incompatible ones. New interfaces first appear as proposed and gated, then become stable and are kept for a long period. Removals follow deprecation notices and telemetry about use. Automated tests run popular extensions against release candidates. It is hard because extensions are written by people the editor team never meets, so any change in behavior, including bug fixes, breaks someone.",
    k: ["Long-lived stable API vs. frequent breaking improvements: stability preserves the ecosystem, but accumulates old behavior the core must carry.", "Proposed gated APIs vs. ship directly: gating allows learning before committing, but slows extension authors who need the feature."],
    p: ["Fixing a bug that extensions had adapted to breaks every one that relied on the old behavior.", "A proposed API used by popular extensions becomes a de facto stable API without the promise."],
    v: "Run the top fifty extensions against the next release candidate in an automated job. Failures are listed by extension and API, and the release is blocked until each is explained.",
    dep: ["extension-api","extension-manifest"]
  },
  "webview-panels": {
    s: "Isolated panels where an extension renders its own interface, such as previews or custom editors, communicating with the extension by messages.",
    d: "A webview is a sandboxed document inside the editor with its own scripts and styles, which has no direct access to the editor or the file system. The extension sets its content and exchanges messages with it. Custom editors use webviews to edit non-text files, backed by the editor's document model for save, undo and backup. Theme colors are passed in so the panel matches. It is hard because a webview is a full document engine per panel, costing memory, and security depends on strict content rules.",
    k: ["Full web content in a sandbox vs. a limited declarative widget set: full content allows rich interfaces, but costs memory and widens the attack surface.", "Keep state when hidden vs. destroy: retaining avoids reload and lost state, but keeps memory used by invisible panels."],
    p: ["A webview loading remote scripts without content restrictions can run attacker code with message access to the extension.", "A hidden panel that is recreated on each show loses scroll position and state."],
    v: "Open a markdown preview and a custom editor for an image file. Both render with the theme's colors, messages flow both ways, hidden panels keep their state if configured, and an unsafe script in content is blocked.",
    dep: ["extension-host","extension-isolation","theme-system"]
  },
  "remote-workspace-agent": {
    s: "A small server process installed on a remote machine that runs the editor's backend there: file access, extension host, language servers and terminals, with the interface staying local.",
    d: "The local interface connects, usually over an encrypted tunnel, to an agent on a remote host, virtual machine or cloud workspace. The agent runs the file service, search, terminals, tasks, language servers and the workspace-side extensions next to the code, while interface-side extensions stay local. Messages carry only what the interface needs. It is hard because the editor now has two locations for every feature, and the agent must install itself, update, and keep matching versions with the client.",
    k: ["Run the backend near the files vs. mount the files locally: running near the files makes search and language servers fast, but needs an installable agent and compatible platforms.", "Split extensions by where they run vs. run all locally: splitting is efficient, but extensions must declare where they belong."],
    p: ["A version mismatch between client and agent breaks protocol messages and leaves the connection half working.", "Network drops leave terminals and tasks in an unknown state unless sessions survive reconnect."],
    v: "Connect to a remote machine, open a project, run a search, start a terminal and a language server. All run there, and after dropping the network for thirty seconds the session resumes with the terminal output intact.",
    dep: ["extension-host","remote-fs-provider","integrated-terminal"]
  },
  "remote-fs-provider": {
    s: "An abstraction that lets file operations target local disks, remote machines, archives or virtual sources through the same interface, selected by a path scheme.",
    d: "File paths carry a scheme that selects a provider, which implements read, write, stat, directory listing and watching. Providers can map to a remote agent, an in-memory file system, a package archive or a web storage service. The explorer, search and buffers use the same file service, so they work everywhere the provider supports. It is hard because providers differ in capability: some cannot watch, some have no atomic rename, and latency changes how the interface must behave.",
    k: ["Uniform file interface vs. provider-specific features: a uniform interface lets all features work everywhere, but hides differences in speed and guarantees.", "Cache file metadata locally vs. always ask the provider: caching makes browsing fast, but can show stale state."],
    p: ["Code that assumes fast stat calls makes the explorer crawl over a high-latency provider.", "Providers that cannot watch leave external changes undetected without polling."],
    v: "Open the same project through a local provider, a remote agent and an in-memory provider. Explorer, search and saving work in each, with unsupported features, such as watching, reported as such.",
    dep: ["workspace-model"]
  },
  "container-workspaces": {
    s: "Development environments defined by a container or virtual machine image and configuration, so the editor opens a project inside a reproducible toolchain.",
    d: "A configuration file in the project names an image or build recipe, extra tools, extensions to install, ports and mounts. The editor builds or pulls the environment, starts it, installs the remote agent inside, and connects. All tools, language servers and terminals run in the container with the exact versions the project expects. It is hard because builds take time, the file mount may be slow or have permission and line ending differences, and tools need to be reachable from the host.",
    k: ["Mount the host folder vs. copy files into the container: mounting keeps one copy and instant edits, but is slow on some systems and mismatches permissions.", "Build on every open vs. cache the environment: caching speeds opening, but may drift from the configuration."],
    p: ["Files created in the container get an owner the host user cannot change.", "A stale cached image lacks a tool the configuration now requires, and builds fail confusingly."],
    v: "Open a project with a container configuration on a clean machine. The environment builds, the toolchain versions match the file, the terminal runs inside it, and files created appear on the host with the right owner.",
    dep: ["remote-workspace-agent","port-forwarding"]
  },
  "port-forwarding": {
    s: "Makes network services started on the remote machine or container reachable from the local machine, detecting new listening ports and offering to forward them.",
    d: "The remote agent watches for newly listening ports, typically the dev server a task started, reports them to the client, and the client opens a local port that tunnels traffic to the remote one. Ports can be labeled, made public, or opened in a browser. Output in the terminal that mentions a local address is rewritten to the forwarded one. It is hard because ports collide with local ones, forwarding rules can expose private services, and detection by scanning is approximate.",
    k: ["Forward automatically on detection vs. ask: automatic is convenient, but may expose services the user did not intend.", "Same local port number vs. any free port: same number keeps links valid, but fails on conflicts."],
    p: ["Making a forwarded port public exposes a development server with no authentication to the internet.", "Local port conflicts silently map to a different number, breaking bookmarked addresses."],
    v: "Start a web server on the remote machine and see the port detected and forwarded. The local address opens the server, a conflicting local port gets a different number with a notice, and stopping the server closes the forward.",
    dep: ["remote-workspace-agent"]
  },
  "collab-session": {
    s: "A shared editing session where several people open the same files, with a host or a relay coordinating who is connected and what they may do.",
    d: "A session has a host who owns the files and guests who join with an invitation. The editor relays the shared documents, and optionally terminals, servers and debugging, through the host or a relay service. Permissions say whether guests can edit, and which files they can see. Participants follow each other's views. It is hard because trust is asymmetric: guests act within the host's environment, and a host who shares a terminal shares their account.",
    k: ["Host-owned files with guests as clients vs. everyone has a full copy: host-owned avoids sync of the whole project, but ends when the host disconnects.", "Share only editors vs. also terminals and servers: editor-only is safe, while sharing more makes pair work richer and riskier."],
    p: ["Sharing a terminal gives guests the host's full account access.", "A session link posted in a public place lets anyone join."],
    v: "Host a session, invite a guest read-only and another with edit rights. Edits from the editor guest appear for the host in under a second, the read-only guest cannot change text, and ending the session removes access.",
    dep: ["concurrent-edit-sync","presence-and-shared-cursors","workspace-trust"]
  },
  "concurrent-edit-sync": {
    s: "The algorithm that merges simultaneous edits from several people into one agreed document, using operational transformation or conflict-free replicated data types.",
    d: "Each participant edits a local copy. With operational transformation, a server orders operations and transforms each against concurrent ones so intentions are preserved. With conflict-free replicated types, each character has a unique identity and ordering, so any order of delivery converges to the same text, even offline. Both must integrate with undo, so that a user undoes only their own edits. It is hard because correctness is subtle, metadata can be larger than the text, and history grows without bound.",
    k: ["Server-ordered operational transformation vs. replicated data types: a server simplifies reasoning and storage, while replicated types work peer to peer and offline at the cost of metadata.", "Undo only own edits vs. global undo: per-user undo matches expectations, but needs transformed inverse operations."],
    p: ["A transformation bug causes participants' documents to diverge silently, and the error appears much later.", "Never compacting identity metadata makes the shared document many times larger than its text."],
    v: "Run a randomized test with five simulated participants making concurrent edits with delays and reordering. After all messages are delivered, every replica holds identical text, and a participant's undo removes only their edit.",
    dep: ["change-deltas","text-buffer-interface","undo-tree"]
  },
  "presence-and-shared-cursors": {
    s: "Shows other participants' cursors, selections and viewports in the editor, labeled by name, and lets one follow another's view.",
    d: "Each client broadcasts its selection and visible range at a limited rate. Others render those as colored cursors, selection highlights and name flags using the decoration layer, with positions tracked by anchors so they follow edits. A follow mode scrolls to keep another person's view in sight. Presence data is ephemeral and not saved with the document. It is hard because positions must be mapped through edits that arrived since they were sent, and many participants clutter the view.",
    k: ["Broadcast every movement vs. throttle: full broadcast looks lively but floods the network, while throttling is cheaper and slightly laggy.", "Show all participants vs. only those nearby: all gives awareness, nearby reduces clutter in busy sessions."],
    p: ["Remote cursors drawn at stale offsets land inside the wrong word after a concurrent edit.", "Dozens of labeled cursors in one file hide the code."],
    v: "Join with two guests moving cursors while a third types in the same line. Remote cursors stay attached to the same words, update within a second, and disappear when a participant leaves.",
    dep: ["collab-session","decorations-and-markers","anchors-and-markers"]
  },
  "settings-sync": {
    s: "Copies the user's settings, keybindings, snippets, themes and installed extension list between machines through a cloud store, resolving conflicts between devices.",
    d: "A sync service stores a versioned copy of selected user data. Each device uploads changes and downloads newer ones, merging by item. Conflicts, where two devices changed the same item, are resolved by a rule or by asking. Machine-specific settings, such as paths and window sizes, are excluded. Secrets must never be synced in plain form. It is hard because partial merges can create combinations that never existed on any device, and extension lists differ by platform.",
    k: ["Merge per item vs. last write wins for the whole profile: per-item merging keeps changes from both devices, but can produce odd combinations.", "Sync extensions vs. settings only: syncing extensions recreates the environment, but installs code automatically on a new machine."],
    p: ["Syncing a machine-specific path breaks tools on the other machines.", "A bad setting synced to every device makes all of them break at once."],
    v: "Change a keybinding on one device and a setting on another within the same minute. After sync both devices hold both changes, excluded machine settings stay local, and a conflict on one item prompts a choice.",
    dep: ["settings-layering","extension-registry"]
  }
});
