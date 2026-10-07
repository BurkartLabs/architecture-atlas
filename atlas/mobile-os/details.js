// Details for the mobile operating system plate, part 1: system shell, accessibility, enterprise management.
ATLAS.details("mobile-os", {
  "launcher": {
    s: "The home screen application: arranges installed apps into pages and folders, hosts widgets, and is the default target when the user presses home.",
    d: "The launcher is an ordinary privileged app. It queries the package database for apps with a launchable entry, draws icons from each package's resources, and starts an app by sending the same launch request any app could send. It hosts widgets by embedding views that another process renders. It is hard because it is always resident, must start instantly after every home press, and must survive being killed and replaced, since the user can install a different one.",
    k: ["Launcher as a replaceable app vs a fixed system component: replaceability gives vendors and users choice; the platform must keep every system gesture working when the launcher is a third-party one.", "Remote-rendered widgets vs launcher-drawn tiles: remote rendering lets any app supply live content; the launcher cannot control the cost or crashes of code it does not own."],
    p: ["A launcher that crashes in a loop leaves the user with no way to start anything except by recents or notifications.", "Icon caches keyed only by package name show a stale icon after an update changes the artwork."],
    v: "Install a new app and confirm its icon appears without restart; kill the launcher process and confirm the home screen returns within a second with the same page layout.",
    dep: ["package-database", "intent-resolution", "app-launch-pipeline"]
  },
  "system-bars-and-shade": {
    s: "The status bar, navigation bar and pull-down shade that show time, signal, battery, notifications and quick controls above and below every app.",
    d: "These are privileged windows that the window manager keeps on top of app content, and they take the system's own input gestures before apps see them. The status bar subscribes to state from the telephony, battery, connectivity and notification services. The shade expands into a list of notification entries and quick controls. Difficulty comes from layering: apps request immersive or edge-to-edge modes, cutouts and rounded corners change usable area, and system gestures must not be stolen by an app drawing at the edge.",
    k: ["Gesture navigation vs on-screen buttons: gestures free screen area; they conflict with apps that use edge swipes and are harder to discover and to make accessible.", "System-drawn bars vs app-drawn full screen: system bars keep state visible and security cues trustworthy; apps lose control of their full canvas and must handle insets."],
    p: ["An app that hides the bars without restoring them on exit leaves the next app laid out under the status bar.", "Overlay windows drawn above the bars can imitate system UI and trick users into granting access."],
    v: "Rotate the device with a cutout and confirm every app receives updated insets and no content sits under the bars; swipe from each edge in an app that uses edge gestures and confirm the system gesture still wins.",
    dep: ["window-manager", "notification-manager", "input-dispatcher"]
  },
  "recents-screen": {
    s: "The overview of running and recently used apps, shown as live or snapshot cards the user can switch to, dismiss or split.",
    d: "The window manager keeps a task entry per app stack with a saved screenshot taken when the app left the foreground. The recents screen lists those tasks and asks the activity manager to bring one forward or remove it. Removing a card is a request to end the task, not a promise that the process dies. The hard part is that a snapshot can show sensitive content, and that a card can outlive the process behind it, so reopening it must restore state rather than show a frozen image.",
    k: ["Snapshot cards vs live previews: snapshots cost almost nothing and work for dead processes; they go stale and can expose private screens unless the app marks them secure.", "Swipe-to-dismiss kills the task vs just hides the card: killing frees memory and meets expectations; it breaks background work the user believed was running."],
    p: ["A banking app without a secure-window flag leaves a readable balance in the recents snapshot.", "Dismissing a card while a download runs in a background service stops the transfer, and the user sees no explanation."],
    v: "Open an app with a secure-window flag and confirm its recents card is blank; swipe a card away and confirm the process is gone from the process list while its foreground-service notification, if any, is handled as documented.",
    dep: ["window-manager", "activity-and-scene-model", "process-priority-states"]
  },
  "lock-screen": {
    s: "The screen shown while the device is locked: displays time and notifications, restricts what is visible, and accepts the credential or biometric to unlock.",
    d: "The lock screen is a system window above all apps. It asks the lock credential service whether an entered secret or a biometric match is valid, and on success tells the window manager to dismiss itself and the encryption layer to release user keys. Notification content is shown, redacted or hidden according to user and administrator settings. It is hard because it is a security boundary drawn by software that must stay responsive: it has to work with a display off, a dead sensor and a slow storage unlock.",
    k: ["Show notification content on the lock screen vs hide it: showing is convenient and informative; hiding prevents shoulder-surfing and leaks to anyone holding the phone.", "Keep the lock screen in the system UI process vs in a minimal separate component: a shared process is cheaper and simpler; a crash there must fail closed rather than reveal the home screen."],
    p: ["A crash or restart of the shell process that dismisses the lock screen instead of restoring it exposes the unlocked device.", "Camera or shortcut launches from the lock screen run in an unauthenticated context and may reach data they should not."],
    v: "Kill the system UI process while locked and confirm the lock screen reappears and the home screen is never visible; try a notification with sensitive text and confirm the redaction setting applies.",
    dep: ["lock-credential-service", "biometric-service", "window-manager", "file-based-encryption"]
  },
  "quick-settings": {
    s: "A panel of toggles and tiles for common controls such as connectivity, brightness, flashlight and do-not-disturb, reachable from any screen.",
    d: "Each tile is a small component with a state and a click action. Built-in tiles call system services directly; an app can offer its own tile, which the shell binds as a service and queries for a label, icon and state. Because third-party tiles run in other processes, the panel treats them as untrusted: it times out slow ones and shows a stale or inactive tile rather than waiting. Some actions, such as turning on a radio, are allowed from the lock screen while others require authentication first.",
    k: ["Bound third-party tile services vs a fixed system set: third-party tiles extend the panel to every app; each bound service costs memory and can hang the panel if not guarded.", "Toggle takes effect immediately vs requests user confirmation: immediate is faster; sensitive toggles like location or mic access need a visible confirmation or a lock-screen guard."],
    p: ["A tile whose app was force-stopped shows the last state forever and silently does nothing when tapped.", "A toggle allowed on the lock screen lets a finder of the phone disable the tracking features the owner relied on."],
    v: "Toggle each built-in tile and confirm the underlying service changes state within a second; force-stop an app that provides a tile and confirm the tile becomes inactive instead of freezing the panel.",
    dep: ["system-bars-and-shade", "service-registry", "connectivity-stack"]
  },
  "setup-wizard": {
    s: "The first-run flow that picks language and network, restores data from a previous device, creates credentials, and applies enrollment or carrier configuration.",
    d: "The wizard runs before the normal shell is allowed to start, as a privileged app with temporary permissions that are revoked when it finishes. It sets locale and time, connects to a network, signs in to an account, offers backup restore, sets a screen lock and biometrics, and may enroll the device in management. Partner extensions add carrier and vendor steps. The difficulty is that each step depends on services that may not be ready, and a failure partway leaves a half-configured device that the user cannot easily repeat.",
    k: ["Linear mandatory flow vs skippable steps: mandatory steps guarantee a secure baseline such as a lock screen; every unskippable step is a place a user with a bad network or old account gets stuck.", "Run restore during setup vs after first boot: restoring early gives a familiar device sooner; it delays first use and can fail on slow or interrupted downloads."],
    p: ["Dead-ending when no account server is reachable leaves a factory-reset phone that cannot be used offline.", "Skipping the enterprise-enrollment screen on a device that was supposed to be managed yields an unmanaged phone holding corporate data."],
    v: "Factory reset and run the full flow on a metered network, interrupting restore halfway; confirm setup resumes or the device reaches a usable home screen with a working lock credential.",
    dep: ["lock-credential-service", "device-enrollment", "connectivity-stack"]
  },
  "screen-reader-service": {
    s: "A system service that speaks or shows in braille the on-screen content and lets a user explore and activate it by touch gestures, replacing visual scanning.",
    d: "The service registers with the accessibility framework and receives events whenever focus, content or windows change. It reads the accessibility tree of the active window, chooses what to announce and in what order, and performs actions on nodes such as click or scroll. It intercepts touch input so single taps explore rather than activate. It is hard because latency must stay low, speech must interrupt correctly, and apps with custom-drawn views expose nothing unless they supply semantics.",
    k: ["Explore-by-touch that intercepts all input vs a separate focus mode: touch exploration is fast for users who know it; it replaces ordinary gestures and needs a distinct vocabulary.", "Reading from the semantic tree vs from the pixels: the tree is accurate and cheap; apps that skip semantics, such as games or custom canvases, are invisible without recognition heuristics."],
    p: ["Unlabeled buttons are announced as \"button\" with no meaning, making a feature unreachable.", "Event floods during animation make speech lag behind the screen and read stale content."],
    v: "Turn on the reader and navigate a standard settings screen with swipe gestures only, confirming each control is announced with a name and role and can be activated by double tap.",
    dep: ["accessibility-tree", "accessibility-service-trust", "input-dispatcher"]
  },
  "accessibility-tree": {
    s: "A parallel semantic description of what is on screen: nodes with roles, names, states and actions that assistive services can read and act on.",
    d: "Each app builds the tree from its view hierarchy, with developer-supplied labels and roles filling in what pixels do not say. The framework sends tree fragments and change events across a process boundary to the services that asked, and routes action requests back. It is a deliberate second interface to every app. Hard parts are cost and consistency: building the tree can slow rendering, and nodes may change between the event and the service reading them.",
    k: ["Build the tree on demand vs keep it continuously: on-demand costs nothing when no service is active; the first query after enabling a service can stall a busy app.", "Rich custom semantics vs inferred defaults: custom semantics give accurate speech; inferred defaults cover most apps but fail on custom controls."],
    p: ["Stale node references cause actions to fail or hit the wrong control after a list scrolls.", "Exposing the full tree to every enabled service lets any such service read all on-screen text, including passwords shown in clear."],
    v: "Dump the tree for a screen and confirm every visible control has a role and a non-empty name; perform a click action on a node from a test service and confirm the app responds as to a tap.",
    dep: ["window-manager", "transactional-ipc"]
  },
  "display-adjustments": {
    s: "System-wide changes to how the screen looks and sounds for users with low vision or hearing loss: large text, color correction, magnification, high contrast and reduced motion.",
    d: "Settings change global configuration that every app receives as a configuration change: font scale, display size, color transform and animation scale. Magnification is done by the compositor, which scales a region of the final frame. Color correction is applied as a matrix over the whole output. The difficulty is layout: text at 200 percent breaks fixed-size designs, and compositor-level changes must also apply to secure and protected content correctly.",
    k: ["Platform-level scaling vs per-app opt-in: platform scaling helps every app without work; apps with fixed layouts clip or overlap text and may need a developer fix.", "Compositor-level magnification vs app-level zoom: compositor zoom works on any content; it adds a full-frame cost and cannot re-layout text to stay readable."],
    p: ["Large font settings truncate or overlap text in fixed-height controls, hiding a critical button.", "A color transform applied after protected-content overlays can leak or distort that content."],
    v: "Set font scale to the maximum and open ten common screens; confirm no control is clipped off-screen. Enable magnification and confirm the magnified region follows touch and focus.",
    dep: ["surface-compositor", "app-launch-pipeline"]
  },
  "alternative-input-control": {
    s: "Ways to operate the device without precise touch: switches, voice commands, external keyboards, head or eye tracking and dwell selection.",
    d: "These are accessibility services that translate an alternative signal into the same actions a finger would produce. A switch service highlights nodes in sequence and activates on a press. A voice service matches spoken names to labels in the tree. All depend on the semantic tree and on the ability to inject gestures and focus changes. Hard cases are scanning speed, targets with no semantics, and avoiding a mode in which the user cannot leave the app they are in.",
    k: ["Services injecting synthetic gestures vs offering a dedicated input device path: gesture injection works with every app; a hardware path is faster and more reliable but needs a driver and a device.", "Scan automatically in steps vs follow explicit navigation commands: automatic scanning needs only one switch; it is slow on dense screens."],
    p: ["Custom views without focusability are skipped entirely by switch scanning.", "Voice commands that rely on visible text break when the label is localized or changes dynamically."],
    v: "With only a single switch connected, complete a task such as sending a message, confirming every control on the path can be reached, activated and exited.",
    dep: ["accessibility-tree", "input-dispatcher", "accessibility-service-trust"]
  },
  "accessibility-service-trust": {
    s: "The consent and restriction layer around accessibility services, which can read the screen and perform actions for the user and are therefore a frequent route for malware.",
    d: "An accessibility service must be declared, then explicitly enabled by the user in system settings with a warning that explains what it can see and do. Platform policy can restrict it further: apps installed from outside the store may be blocked from enabling it, services may be limited to declared capabilities, and some windows and password fields can be hidden from them. The balance is hard: the same powers that serve disabled users let a rogue app click through permission prompts.",
    k: ["Broad capability with a strong warning vs narrow per-capability grants: broad access keeps legitimate tools working; narrow grants limit abuse but break assistive tools that need to read arbitrary apps.", "Blocking sideloaded apps from enabling the service vs allowing all with a warning: blocking stops a major fraud pattern; it also blocks legitimate assistive apps from alternative sources."],
    p: ["Users follow a phone-call script to enable a malicious service, which then approves its own permission prompts.", "Overly strict gating locks out a disabled user's trusted tool and leaves no recovery path."],
    v: "Try to enable an accessibility service from a package installed outside the store and confirm the documented restriction applies; confirm a service enabled normally cannot read content from windows marked as secure.",
    dep: ["permission-state-store", "signing-verification"]
  },
  "device-enrollment": {
    s: "The process by which a device becomes managed: scanning a code, signing in with a work identity or being pre-assigned at purchase, which sets the administrator's level of control.",
    d: "Enrollment installs a management agent as a device owner or profile owner and binds the device to an organization's server. Fully managed, work-profile and zero-touch paths differ in whether the administrator controls the whole device or only a container. A fresh device may contact a registration service during setup and receive its configuration before the user reaches the home screen. It is hard because ownership is set once at the start, and the wrong mode cannot be changed without a reset.",
    k: ["Enroll during first-run setup vs after use: setup-time enrollment can claim the whole device and enforce policy from the first boot; after-the-fact enrollment can only manage a container and cannot undo existing personal data.", "Pre-registered by reseller vs user-initiated: reseller registration protects against theft and skips steps; it depends on accurate purchase records."],
    p: ["A device enrolled in the wrong ownership mode must be factory reset, losing user data.", "Expired or revoked enrollment tokens produce a stalled setup with no message the user can act on."],
    v: "Reset a test device, scan an enrollment code and confirm the management agent is installed with the expected ownership level before the home screen first appears.",
    dep: ["setup-wizard", "management-agent", "key-attestation"]
  },
  "management-agent": {
    s: "The on-device component that talks to the administrator's server, applies policy through platform interfaces and reports compliance.",
    d: "The agent runs as a privileged app granted device-administration rights. It checks in over a secure channel, often woken by a push message, receives a policy document and installs apps and certificates. It then calls platform management interfaces to set restrictions, passwords and network settings, and reports results. It is hard because it holds powerful rights in an app that is updated like any other, and because it must keep working when offline, rate limited or partly broken.",
    k: ["Platform-defined management interfaces vs vendor-specific extensions: standard interfaces work across devices; vendor extensions reach hardware features the standard omits, at the cost of fragmentation.", "Push-triggered check-in vs periodic polling: push gives fast reaction and low battery cost; it fails silently when the push channel is blocked, so a slow poll remains as a backstop."],
    p: ["An agent killed by background limits stops enforcing and reporting, and the console shows the device as healthy.", "A policy conflict between two management apps produces unpredictable settings with no single owner."],
    v: "Push a changed policy from the console and confirm the device reports applied state within the target time, including after the agent is force-stopped and the device is restarted.",
    dep: ["policy-engine", "push-transport", "background-limits-policy"]
  },
  "policy-engine": {
    s: "The platform logic that stores administrator policies and enforces them across the framework: password rules, disabled features, network restrictions and app allow lists.",
    d: "Policies are held in a protected store keyed by the admin that set them. Framework services consult the engine at decision points: password complexity at credential creation, camera disable in the camera service, install blocks in the installer. When several admins apply, the most restrictive value usually wins. Hard problems are completeness, since every service must check, and ordering: a policy set while a conflicting user setting exists must resolve predictably and survive reboot.",
    k: ["Central policy store consulted by each service vs each service holding its own flag: central keeps one auditable source; every service must call it correctly or a feature slips through.", "Strictest-wins merge across admins vs layered priority: strictest-wins is easy to reason about; it cannot express a deliberate exception from a higher authority."],
    p: ["A new feature added without a policy hook is usable on managed devices that were meant to block it.", "Policy kept only in memory is lost on reboot until the agent reconnects."],
    v: "Disable the camera by policy and confirm the camera service rejects every app, including after reboot and with no network connection to the management server.",
    dep: ["permission-state-store", "keystore-service"]
  },
  "work-profile": {
    s: "A separate user space on the same device that holds work apps and data under the organization's control, while personal apps and data remain private.",
    d: "The profile is a secondary user with its own app instances, storage and encryption keys, linked to the primary user. The administrator controls only that profile: apps installed there, policy, and wipe. Cross-profile sharing is blocked by default and allowed only through explicit intent filters. Badged icons show which side an app is on. It is hard because many framework services, such as contacts, calendar and sharing, must be profile-aware without leaking between sides.",
    k: ["Separate profile with duplicate apps vs a per-app managed container: a profile gives strong separation of data and keys; two instances of an app confuse users and double memory use.", "Allow cross-profile sharing with explicit rules vs block entirely: rules let workflows continue; every allowed path is a way for data to leave the protected side."],
    p: ["A shared contacts or clipboard path leaks corporate data into personal apps.", "Turning the profile off for a long time stops work apps from receiving mail or notifications, which users blame on the device."],
    v: "Copy text in a work app and confirm a personal app cannot paste it by default; wipe only the work profile and confirm personal data and apps are untouched.",
    dep: ["policy-engine", "file-based-encryption", "intent-resolution", "per-app-identity"]
  },
  "remote-wipe-and-lock": {
    s: "Administrator and owner commands that lock a device, reset its credential, or erase user data when it is lost, stolen or retired.",
    d: "The command arrives through the management agent or the owner's account service, using a push message to reach a device that is idle. A lock requires the credential service to engage; a wipe erases the user data partition by discarding the encryption keys and then formatting. A device that is off or offline cannot obey, so some systems also support a deadline after which the device locks itself. The hard parts are authenticating the command, and making a wipe complete and irreversible.",
    k: ["Wipe by key destruction vs by overwriting data: destroying keys is instant and reliable on encrypted storage; it depends on the keys never having been copied elsewhere.", "Wipe on repeated wrong credentials vs only on remote command: local wipe defends an offline device; it risks an accidental wipe by a child or a pocket."],
    p: ["A wipe command queued while the device is off is lost if the thief never connects to a network.", "An unauthenticated or replayable command channel lets an attacker erase a victim's phone."],
    v: "Send a remote wipe to a test device and confirm the user partition is unreadable after boot and the device returns to setup; send a lock and confirm the previous credential no longer opens it.",
    dep: ["management-agent", "file-based-encryption", "lock-credential-service", "push-transport"]
  },
  "managed-app-distribution": {
    s: "A private channel by which an organization chooses and silently installs, updates or removes apps on enrolled devices, and sets their configuration.",
    d: "An administrator assigns apps in a console; the management agent asks the installer to fetch them from the store channel or a private catalog and applies managed configuration, a key-value bundle the app reads at startup. Apps can be pinned to a version, allowed only from the private list, or removed on unenrollment. Difficulty comes from update timing, because the installer must not replace an app the user is using, and from ensuring that private apps are signed and trusted.",
    k: ["Silent install and update vs user-approved: silent keeps a fleet uniform and patched; it can restart apps mid-task and surprise users.", "Private catalog vs public store listing: a private catalog hides internal apps and permits custom signing; it needs its own review, versioning and delivery infrastructure."],
    p: ["An update pushed to an entire fleet at once breaks a workflow for everyone simultaneously.", "Managed configuration set after the app first launches is ignored until the app restarts."],
    v: "Assign an app and a configuration to an enrolled device and confirm it installs without user action and reads the configuration at first launch; remove the assignment and confirm it is uninstalled.",
    dep: ["management-agent", "package-installer", "store-client"]
  },
});
