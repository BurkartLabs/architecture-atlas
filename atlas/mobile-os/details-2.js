// Details for the mobile operating system plate, part 2: application lifecycle, inter-app communication, permissions.
ATLAS.details("mobile-os", {
  "app-manifest": {
    s: "A declarative file inside every app package that names its components, entry points, required permissions, hardware needs and the events it wants to receive.",
    d: "The installer parses the manifest and registers each declared component with the package database. The platform decides what to show in the launcher, which links the app may handle, and which services it may start, all from that declaration without running app code. Because the platform trusts the manifest for routing and permission checks, it must be validated strictly. It is hard because it is both an API and a security policy: a missing or over-broad entry changes behavior long after the app was written.",
    k: ["Static declaration vs runtime registration: static lets the system route events and show UI without starting the app; it cannot express choices made at runtime.", "Extensible manifest vs fixed schema: extension attributes keep new features compatible; unknown attributes must be ignored safely or older devices misread newer apps."],
    p: ["Exported components left without permission requirements become entry points for other apps to call.", "Declaring a hardware feature as required hides the app from devices that could have run it."],
    v: "Install an app whose manifest declares a handler for a link type and confirm the platform lists it as a handler without having started the app; remove the entry in an update and confirm it disappears.",
    dep: ["package-database", "permission-declarations"]
  },
  "process-spawner": {
    s: "A pre-initialized system process that forks new app processes already holding the shared runtime and common libraries, so apps start faster and share memory.",
    d: "At boot, a template process loads the common classes, libraries and resources. When an app must start, the activity manager asks the spawner to fork a child, which switches to the app's identity, applies its sandbox, and loads its code. Copy-on-write sharing means the preloaded pages exist once across all apps. Difficulty arises because forked children share layout, which weakens address randomization, and because anything the template loads is carried by every app.",
    k: ["Fork from a warm template vs launch a fresh process: forking gives fast starts and large memory savings; every app inherits the template's address layout and any state left in it.", "Several templates for different configurations vs one: more templates fit different architectures or isolation levels; each one consumes resident memory."],
    p: ["Sensitive data or random seeds in the template are duplicated identically into every app unless reset after fork.", "A crash of the spawner leaves no app able to start until the system restarts it."],
    v: "Start ten apps and compare their private versus shared memory: shared pages from the template should account for most of each app's baseline, and each child should show a different random layout for its own allocations.",
    dep: ["per-app-identity", "syscall-filtering", "memory-safety-mitigations"]
  },
  "activity-and-scene-model": {
    s: "The unit of user-facing app content: a screen-sized component with its own lifecycle, stacked into tasks that the system can bring forward, hide or recreate.",
    d: "An activity or scene is a component that owns a window and a set of state callbacks. Tasks group them in a back stack, and a launch mode decides whether a request creates a new instance or reuses one. The system, not the app, decides when to create, pause and destroy each. Hard parts are configuration changes such as rotation, multi-window and foldables, which can destroy and rebuild a screen at any moment, and instances living in more than one task.",
    k: ["Many screens per app on a stack vs one root with internal navigation: a stack gives the system fine-grained control and standard back behavior; it ties lifecycle complexity to the number of screens.", "Recreate on configuration change vs handle in place: recreation is simple and correct but costly; handling in place is smooth but easy to get wrong."],
    p: ["Holding references to a destroyed screen after rotation leaks memory and crashes on a later callback.", "Launch modes that create duplicate instances produce a back stack that does not match what the user expects."],
    v: "Rotate the device mid-task on a form with entered text and confirm the screen is rebuilt with state intact and exactly one instance exists in the task.",
    dep: ["lifecycle-callbacks", "window-manager", "app-manifest"]
  },
  "process-priority-states": {
    s: "The ranking of every app process by how visible or necessary it is, from foreground down to cached, which decides who is kept alive and who is killed first.",
    d: "The activity manager assigns each process a score derived from what its components are doing: visible activity, foreground service, bound service, background, empty and cached. Scores are recomputed on every state change and passed to the memory killer and the scheduler. A process hosting several components takes the highest of their priorities, so one bound service can keep a whole process important. Difficulty is that scoring must be cheap and respond within milliseconds to user action while resisting apps that try to look more important than they are.",
    k: ["Coarse priority classes vs a continuous score: classes are easy to explain and debug; a continuous score allows finer eviction choices at the cost of surprising behavior.", "Priority inherited through bindings vs fixed by process type: inheritance keeps a service alive while a client needs it; it lets a client unknowingly pin a heavy service."],
    p: ["An app that keeps a trivial service bound to itself stays in a high class and holds memory long after the user left.", "A binding cycle between processes can keep both important with no one using either."],
    v: "Put an app to the background and read its score over time: it should fall from foreground to cached within the documented interval, and rise immediately when a visible activity or foreground service starts.",
    dep: ["activity-and-scene-model", "low-memory-killer"]
  },
  "lifecycle-callbacks": {
    s: "The set of methods the platform calls on an app component as it is created, shown, hidden, stopped and destroyed, which the app must handle correctly.",
    d: "Each component type has an ordered state machine with callbacks at each transition. The system calls them on the app's main thread and expects them to return quickly. Between pause and stop the app should save light state; after stop it may be killed with no further callback. Apps get little notice, so correctness depends on writing state early and not relying on a final callback. The difficulty is that callbacks can arrive in orders the developer did not test, such as stop without destroy, or restart after process death.",
    k: ["Callbacks driven by the system vs apps managing their own run state: system-driven gives the platform control to save memory and power; apps must be ready for any transition at any time.", "Short callback deadlines enforced by a watchdog vs unlimited time: deadlines keep the interface responsive; slow work in a callback causes a not-responding dialog."],
    p: ["Saving state only in the destroy callback loses it when the process is killed without calling that callback.", "Blocking the main thread in a start callback delays the first frame and triggers the responsiveness watchdog."],
    v: "Log each callback while pressing home, opening another app, rotating and force-killing from recents; confirm the observed sequence matches the documented state machine and no work runs after the process is frozen.",
    dep: ["activity-and-scene-model", "state-restoration"]
  },
  "state-restoration": {
    s: "The system's mechanism for saving a small amount of UI state before an app is stopped and handing it back when the screen is recreated, making a killed app look as if it never left.",
    d: "When a screen goes to the background, the platform asks it to write a compact state bundle, which the system holds in its own process, outside the app. After the app is killed and the user returns, the system recreates the process and screen and passes the bundle back. Only small, serializable state belongs here; larger data lives in app storage. It is hard because it is invisible when it works and the failure only appears under memory pressure, which developers rarely reproduce.",
    k: ["System-held small bundle vs app-managed persistence: the bundle survives process death with little code; size limits and serialization cost mean it cannot hold large objects.", "Restore the exact screen vs start fresh at the root: restoring matches user expectation; stale restored state can show data that no longer exists."],
    p: ["Oversized bundles cause transaction errors and crashes when the system tries to hand them across processes.", "Restoring a screen that depends on an object created in the dead process leads to null access crashes."],
    v: "Fill a form, press home, kill the process with a debugging command, then return from recents: confirm the same screen reappears with the entered text and the same scroll position.",
    dep: ["lifecycle-callbacks", "transactional-ipc"]
  },
  "low-memory-killer": {
    s: "The mechanism that reclaims memory by terminating the least important app processes when free memory falls below thresholds, since phones have no swap to disk.",
    d: "A monitoring daemon watches memory pressure signals from the kernel and, when thresholds are crossed, kills cached and then lower-priority processes in order of score. Kills are abrupt: no callback runs. Compressed in-memory swap and process freezing reduce how often it is needed. The challenge is picking the right moment, since reacting late causes visible stalls and reacting early kills apps that the user expected to resume instantly.",
    k: ["Pressure-based userspace killing vs kernel out-of-memory handling: userspace knows app importance and acts before the system stalls; the kernel path is last-resort and picks victims by size alone.", "Compressed memory before killing vs killing first: compression keeps more apps alive at a CPU and power cost; kills free memory at once but force a cold start later."],
    p: ["Thresholds tuned for one memory size cause constant kills or stalls on other device configurations.", "Killing an app that holds a large unsaved edit with no restore path loses user work."],
    v: "Open apps until memory is exhausted on a test device and confirm kills occur in the order of the priority scores, the foreground app is never killed, and the system never freezes for more than a short interval.",
    dep: ["process-priority-states", "performance-hints"]
  },
  "app-launch-pipeline": {
    s: "The sequence from tap to first frame: resolve the target, create or wake the process, load code, draw the first window and hand focus to the app.",
    d: "The activity manager resolves the request, checks permissions, shows a placeholder starting window immediately, and asks the spawner for a process if none exists. The app creates its runtime, loads precompiled code, runs application and screen initialization, and renders. The compositor then swaps the placeholder for the real window. Cold, warm and hot starts differ by how much of that is already done. It is hard because every stage runs on the critical path of one finger tap, and slowness is blamed on the platform even when an app causes it.",
    k: ["Placeholder starting window vs waiting for the first real frame: a placeholder makes the system feel instant; a mismatched one looks like a flash of wrong content.", "Aggressive process pre-launch vs launching on demand: pre-launch cuts latency for likely apps; it spends memory and battery on apps that were never opened."],
    p: ["Heavy work in the application initializer slows every cold start including those triggered by notifications.", "A first frame that waits on network makes the app look frozen behind the placeholder."],
    v: "Measure time from touch-down to first drawn frame for cold, warm and hot starts of one app across twenty runs, and confirm the distribution stays within the platform's published target for each type.",
    dep: ["process-spawner", "intent-resolution", "window-manager", "install-time-optimization"]
  },
  "intent-resolution": {
    s: "The system matching of a request, such as view this link or share this image, to the components of installed apps that declared they can handle it.",
    d: "An intent carries an action, data type and extras. The resolver compares it with the filters registered from every manifest, applies defaults and user choices, checks visibility rules and the target's permission requirements, and either launches the match or shows a chooser. Explicit intents name a target directly; implicit ones depend on resolution. It is hard because it is a major trust boundary: a request may be sent by one app and handled by another, so exposed components, extras and returned results all need validation.",
    k: ["Implicit intents with a chooser vs explicit targets only: implicit requests let users pick any capable app; they also let a malicious app register to intercept the request.", "Package visibility limits vs open discovery: limiting which apps can see each other protects privacy; it breaks apps that need to know which handlers exist."],
    p: ["Sending sensitive data with an implicit intent lets any matching app receive it.", "Mutable pending intents handed to other apps let the receiver redirect the action to a different target."],
    v: "Register two apps for the same link type and confirm the chooser lists both; send an explicit request to a non-exported component from a different app and confirm it is rejected.",
    dep: ["app-manifest", "package-database", "permission-state-store"]
  },
  "deep-link-verification": {
    s: "A check that an app really owns the web addresses it claims, by comparing its declaration to a file hosted on the domain, so links open directly in the right app.",
    d: "An app declares the web hosts it handles. At install or on schedule, the system fetches a signed statement from each host listing the app's identifiers and compares it. Verified apps open links without a chooser; unverified apps are offered only with user approval. Custom schemes cannot be verified at all, so any app can claim them. The difficulty is that verification depends on network access, caching and timing, and failures are silent, so links just open in the browser.",
    k: ["Domain-verified web links vs custom URL schemes: verified links cannot be hijacked and fall back to the web; custom schemes are simple and work offline but any app can claim the same name.", "Verify at install vs lazily at first use: install-time checks make behavior predictable; they fail offline and cost network traffic during installation."],
    p: ["A misconfigured hosted file leaves links opening in the browser with no error for the developer.", "Apps claiming a custom scheme used for sign-in callbacks allow another app to receive authentication codes."],
    v: "Install a build with a correct hosted statement and confirm a tapped link opens it directly; break the hosted file, reinstall and confirm the link falls back to the chooser or browser.",
    dep: ["intent-resolution", "signing-verification", "package-installer"]
  },
  "transactional-ipc": {
    s: "The kernel-assisted call mechanism that lets one process invoke an object in another, carrying the caller's identity, with arguments copied once and death notifications.",
    d: "A driver in the kernel moves small messages between processes, delivers each to a thread pool in the target, and stamps it with the sender's user identity and process. Objects are passed as handles that the kernel translates per process and counts. A service can ask to be told when the process behind a handle dies. It is hard because every system service is exposed to every app through it, so each call must authenticate its caller, and because synchronous calls can block a thread that another call needs.",
    k: ["Single-copy kernel message passing vs shared memory with a separate signal: kernel messaging is simple and carries identity; large payloads need shared buffers to avoid copies.", "Synchronous calls by default vs asynchronous one-way: synchronous is easy to reason about; it can deadlock across services and block the main thread."],
    p: ["Service methods that trust a caller-supplied identity instead of the kernel-supplied one can be spoofed by any app.", "Large transfers exceed the per-process buffer and fail, often only on the first big input."],
    v: "Call a system service from an app and confirm the service logs the app's true user identity; kill the service process and confirm clients receive a death notification within a short interval.",
    dep: ["per-app-identity", "hal-contracts"]
  },
  "service-registry": {
    s: "The directory where system services publish named interfaces and where apps and other services look them up, subject to policy about who may register and who may find what.",
    d: "At startup each platform service registers a handle under a name with the registry, which is itself the first object reachable through the call mechanism. Clients ask for a name and receive a handle if policy allows. Access control lists restrict which security domains can register or obtain each name, so an app cannot replace the telephony service. Vendor interfaces register in a separate registry with versioned names. The hard part is startup order and restart: clients must survive a service dying and reappearing under the same name.",
    k: ["Central registry with policy checks vs direct connections: a registry gives one control point and one place to audit; its failure or slow start blocks everything that needs lookups.", "Lazy start of rarely used services vs start everything at boot: lazy saves memory and boot time; the first caller pays startup latency and may time out."],
    p: ["A service that restarts and receives a new handle leaves clients holding a dead reference unless they re-lookup.", "A permissive policy entry allows an app-domain process to register a name that shadows a real system service."],
    v: "Kill a system service and confirm clients that cached its handle receive a death callback, look it up again and resume; confirm an app process attempting to register an existing service name is denied.",
    dep: ["transactional-ipc", "mandatory-access-control"]
  },
  "content-sharing": {
    s: "System-mediated ways for apps to give each other data: provider interfaces, temporary access grants to a single item, the clipboard and the share sheet.",
    d: "A provider exposes data through a standard query interface and checks the caller's permission or a one-time grant. When app A shares a file with app B, A hands over a reference plus a temporary grant, so B can read exactly that item and nothing else, until B's task ends. The clipboard and drag-and-drop are brokered by the system with visibility rules. It is hard because the receiver is untrusted and the data may be sensitive, so the grant must be narrow and the path must not allow traversal outside it.",
    k: ["Temporary per-item grants vs broad storage permissions: grants give the receiver minimal access and no standing rights; they require the sender's cooperation and expire with the task.", "Clipboard readable by foreground app only vs by anyone: foreground-only protects copied secrets; background tools such as clipboard managers stop working."],
    p: ["A provider that builds file paths from caller input allows reading other files in the app's directory.", "Sharing a raw file path instead of a granted reference fails in the receiver, which has no access to it."],
    v: "Share an image to another app and confirm it reads that image only; attempt to read a sibling file through the same reference and confirm the request is denied.",
    dep: ["intent-resolution", "permission-state-store", "storage-isolation"]
  },
  "extension-points": {
    s: "Defined places where an app can plug into the system or another app's interface, such as share targets, widgets, keyboards, document pickers and shortcuts.",
    d: "An extension is a component declared with a particular type that the system loads in its own constrained process when a host asks. Examples include a share target that appears in the sheet, a widget that renders on the home screen, and a document provider that surfaces files in a picker. The host talks to it through a narrow interface and the system limits its memory and lifetime. Difficulty comes from small resource limits, no access to the main app's process, and keeping extension and app data consistent.",
    k: ["Out-of-process extensions with tight limits vs in-process plugins: out-of-process contains crashes and data access; extensions must be small and share state through storage rather than memory.", "Many typed extension points vs one generic plug-in API: typed points have clear security rules and UI; a new capability needs platform work for each."],
    p: ["Extensions that load large libraries are killed for exceeding memory before they finish the task.", "State kept in the app but not in shared storage is missing when the extension runs alone."],
    v: "Invoke a share extension with the main app not running and confirm it completes within its memory limit and the saved item appears in the app on next launch.",
    dep: ["intent-resolution", "app-manifest", "per-app-identity"]
  },
  "permission-declarations": {
    s: "The list of protected capabilities an app says it needs, which the platform uses to classify, display and gate each use of a sensitive interface.",
    d: "Permissions are named in the manifest and defined by the platform or by other apps. Each has a protection level: normal ones are granted at install, dangerous ones need user approval at runtime, and signature-level ones are granted only to apps signed by the same key as the definer. The package database stores the declaration; the permission store records the grant. The difficulty is that a name is a promise about behavior: too coarse a permission gives apps far more than they need, and too fine a set cannot be explained to users.",
    k: ["Few coarse permissions vs many narrow ones: coarse sets are understandable at a prompt; narrow ones reduce exposure but multiply prompts and developer mistakes.", "Install-time grants vs runtime grants: install-time is simple and keeps apps working; runtime asks when the purpose is clear and lets users decline, but apps must handle denial."],
    p: ["Requesting a broad permission when a narrow one suffices increases harm if the app is compromised.", "Defining a custom permission without a signature requirement lets any app claim it first."],
    v: "Install an app declaring one dangerous and one normal permission and confirm only the normal one is granted automatically; inspect the package database and verify both declarations are recorded.",
    dep: ["app-manifest", "package-database"]
  },
  "runtime-permission-prompts": {
    s: "The system dialogs that ask the user to allow or deny a sensitive permission at the moment an app first needs it, with options to limit what is granted.",
    d: "When an app requests a permission the framework checks the state; if undecided, it shows a system-owned dialog, which the app cannot draw or fake, naming the app and the capability. The answer is written to the permission store. After repeated denials the system may stop asking and the app must send users to settings. The difficulty is design: prompts out of context are denied, prompts in context are better but the app must explain why first, and denial must leave the app working.",
    k: ["System-drawn dialog vs app-drawn explanation: a system dialog cannot be spoofed and has consistent wording; the app gets little room to explain, so the pre-prompt context matters.", "Ask at first use vs ask at launch: first-use prompts are tied to a visible action and get more approval; launch prompts are early, confusing and often denied."],
    p: ["An app that crashes or disables features after denial teaches users to grant everything.", "Dialog fatigue from several requests in sequence leads to blind approval."],
    v: "Trigger a protected action in a new install, deny the prompt and confirm the app handles denial gracefully; deny twice and confirm the system stops showing the dialog and the app routes the user to settings.",
    dep: ["permission-state-store", "window-manager", "permission-declarations"]
  },
  "permission-state-store": {
    s: "The system's persistent table of which app has which permissions and in which state, consulted on every protected call.",
    d: "The store keeps per-user, per-app grant records with flags such as granted, denied, user-fixed, policy-fixed and one-time. Services ask it through a check function with the caller's identity from the call mechanism. Checks happen at the service, not in the app. Changes notify listeners, and a revoked permission kills the process so that cached access disappears. The store is hard because it is consulted at very high frequency and must be consistent across reboots, user switches, upgrades and backup restore.",
    k: ["Check at every call vs check once and cache a handle: per-call checks make revocation immediate; handle caching is faster and lets revoked access linger.", "Kill the app on revoke vs let it continue until next check: killing guarantees the app cannot use already opened resources; it costs the user's app state."],
    p: ["Restoring permission grants from a backup onto a new device can grant access the new user never approved.", "A service that checks permission once at connection and never again keeps serving an app after the user revokes it."],
    v: "Grant, then revoke location in settings while an app is using it, and confirm the app process is stopped or its location stream ends and the next request is denied.",
    dep: ["per-app-identity", "package-database"]
  },
  "one-time-grants": {
    s: "Permission choices that last only for the current session or give less precision: allow once, allow only while in use, and approximate instead of precise location or selected photos only.",
    d: "These are extra states in the permission store that the platform enforces by itself. A one-time grant expires when the app leaves the foreground for a period or its process ends. A while-in-use grant is denied to background code. An approximate grant makes the location service round coordinates to a coarse cell. A selected-media grant lets the app see only items the user picked. The challenge is that apps written for all-or-nothing access must survive being given less without noticing.",
    k: ["Platform-enforced reduced grants vs app-chosen minimum: platform enforcement guarantees the app cannot exceed the choice; apps built for full access can misbehave when handed degraded data.", "Short expiry of one-time grants vs long: short expiry is safer and re-prompts often; long expiry reduces friction while risking forgotten access."],
    p: ["An app that assumes precise location computes distances from coarse points and shows wrong results.", "A one-time grant that expires during a long task stops it halfway with no retry."],
    v: "Choose approximate location for a navigation app and confirm returned coordinates are rounded to the documented granularity; leave and return after the expiry for a one-time grant and confirm access is gone.",
    dep: ["permission-state-store", "location-fusion", "process-priority-states"]
  },
  "auto-reset-unused": {
    s: "A background process that revokes the permissions of apps the user has not opened for months, returning the app to its ungranted state.",
    d: "A scheduled job reads app usage statistics and, for each app unused beyond a threshold, resets its runtime permissions, optionally hibernates the app by stopping background work and clearing caches, and may show a notification. Opening the app again restores normal behavior apart from the cleared grants. Some apps are exempt, such as device administrators and apps with specific roles. It is hard because usage must be measured without invading privacy and because an app that is used rarely but legitimately, such as a seasonal one, must recover gracefully.",
    k: ["Automatic reset vs asking the user to review: automatic reset limits harm from forgotten apps with no effort; it surprises users who expected an app to keep working in the background.", "Per-app opt-out by exemption vs no exemptions: exemptions keep apps like monitors working; each exemption is a path abusers try to obtain."],
    p: ["A health or alarm app left unused for months silently loses the permissions it needs and appears broken when relied upon.", "Reset applied without notice leaves the user unable to tell why a feature stopped working."],
    v: "Advance the device clock past the threshold with an app unused, run the job and confirm its runtime permissions are reset while the app and its data remain installed.",
    dep: ["permission-state-store", "job-scheduler", "standby-buckets"]
  },
  "privacy-indicators": {
    s: "Persistent on-screen cues, such as a colored dot or a status-bar icon, that show when an app is using the camera, microphone or location, and a record of past use.",
    d: "The services that own the camera, microphone and location report each start and stop of access, tagged with the app's identity, to a central privacy service. The system UI renders the indicator and keeps a rolling log users can read. The indicator is drawn by the system above everything, and cannot be hidden by an app. The hard part is attribution through intermediaries: when one app uses a sensor on behalf of another, the shown name must be the real beneficiary.",
    k: ["Always-visible indicator vs on-demand log only: an always-visible cue gives immediate awareness and deters abuse; it occupies space and desensitizes users.", "Hardware-tied indicator vs software-only: a hardware light cannot be spoofed by compromised software; software indicators are cheaper and flexible but rely on the platform being intact."],
    p: ["Access made by a service on behalf of an app is attributed to the service, so the user sees the wrong name.", "Indicators missing while the display is off hide that something is recording."],
    v: "Start a recording in a test app and confirm the indicator appears within a fraction of a second, names the right app, and disappears after stop; verify the access log lists the same interval.",
    dep: ["sensor-access-gating", "system-bars-and-shade", "permission-state-store"]
  },
  "sensor-access-gating": {
    s: "The enforcement points in sensor, camera, microphone and location services that check permission and app state on each stream, and stop delivery when access is revoked or the app is no longer eligible.",
    d: "Each service identifies the caller through the call mechanism, queries the permission store and the app's foreground state, and opens or denies the stream. While streaming it keeps watching: if the app moves to the background, the camera is cut and the microphone returns silence or is stopped, depending on policy. A global privacy switch can disable a sensor for all apps. The challenge is covering every path: raw device nodes, secondary services and vendor interfaces must all sit behind the same checks.",
    k: ["Stop the stream when the app backgrounds vs let it continue with a visible service: stopping prevents covert capture; legitimate recorders and call apps need a foreground service to continue.", "Silent zeros when a sensor is blocked vs an error: zeros keep apps from crashing; they hide the cause and can corrupt recordings."],
    p: ["A vendor interface that skips the check lets an app read a sensor through a side path.", "Returning silence for denied microphone access makes users believe a call app is broken."],
    v: "Open the camera in a test app, send it to the background and confirm the stream ends; flip the global camera switch and confirm every app receives blocked frames.",
    dep: ["permission-state-store", "process-priority-states", "camera-service", "sensor-hub"]
  },
});
