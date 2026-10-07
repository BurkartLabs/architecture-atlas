// Details for the application sandbox plate, part 1: policy and consent.
ATLAS.details("app-sandbox", {
  "policy-language": {
    s: "The notation in which sandbox rules are written: what an application may open, connect to, execute or ask the broker for, expressed as data rather than code.",
    d: "Languages range from flat allow lists to rule languages with variables, conditions, inheritance and path patterns. The language defines the vocabulary of operations (file read, socket connect, process spawn, message to a named service) and how rules combine, usually deny-wins or first-match. It is hard because every operation the kernel can perform needs a name, and because rule authors are application developers, not security engineers, so the language has to make the safe thing the short thing.",
    k: ["Declarative rule data vs a general-purpose script: data can be analyzed, diffed and bounded in cost; scripts express exceptions easily but can no longer be proven to terminate or be safely reviewed.", "Path patterns vs object labels as the subject of rules: paths are readable to authors, labels survive renames and hard links but need a labeling step."],
    p: ["A rule matching a path prefix also matches a sibling directory with a longer name, granting far more than intended.", "Ambiguous precedence between allow and deny rules makes the same policy behave differently after a harmless reordering."],
    v: "Write a profile that allows reading one directory, load it, and confirm a read inside succeeds while reads of a sibling directory, a parent and a symlink pointing outside all fail with a permission error.",
    dep: ["default-deny-baseline"]
  },
  "default-deny-baseline": {
    s: "The starting point where a confined process may do nothing, so every permission it has was added deliberately and can be listed.",
    d: "The baseline is the smallest profile under which a process can start and exit: map its own binary, allocate memory, write to its own output descriptor. Everything else is added by profiles and grants. Starting from deny makes review a matter of reading additions; starting from allow makes it a hunt for omissions. The difficulty is that real runtimes need hundreds of small operations at start-up, so baselines grow by accretion and each addition widens what every application inherits.",
    k: ["Minimal baseline plus per-app additions vs a generous shared baseline: minimal is safer but breaks more applications; generous is compatible but every app inherits every convenience.", "One baseline for all vs one per process kind: per-kind baselines are tighter for helpers such as decoders but multiply what must be maintained."],
    p: ["Each compatibility fix adds a permission to the shared baseline, and nobody removes it, so the baseline slowly becomes the policy.", "A new operation type added to the kernel is allowed by default if the baseline lists only denials."],
    v: "Launch a trivial program under only the baseline and list its permitted operations from the policy dump. Confirm the list is short, every entry has a recorded reason, and a file open outside the program image fails.",
    dep: ["policy-language"]
  },
  "profile-templates": {
    s: "Reusable policy skeletons for common application kinds, such as a document viewer, a media player or a network client, that an app starts from instead of writing rules from nothing.",
    d: "A template captures what an application kind legitimately needs, with parameters filled in per app: the data directory name, the document types it opens, the services it talks to. Authors choose a template and add only differences. Templates concentrate security review into a few well-examined files and make applications of a kind look alike. They are hard because kinds blur: an editor that also plays video and syncs over the network fits no single template, and authors then copy and widen one.",
    k: ["Strict templates with explicit opt-in extras vs permissive templates authors trim: opt-in extras keep the default tight, while trimming is rarely done.", "Templates owned by the platform vs by app teams: platform ownership makes review consistent but slows requests for new capabilities."],
    p: ["Copy-pasting a template into each app forks it, so a later tightening never reaches the copies.", "Parameters substituted into rules without escaping let an app name or path inject extra rules."],
    v: "Generate profiles for two apps from one template and diff them: only the declared parameters should differ. Tighten the template, regenerate both, and confirm both lose the permission.",
    dep: ["policy-language", "default-deny-baseline"]
  },
  "profile-composition": {
    s: "The rules for combining several profile fragments, such as baseline, template, app additions and user grants, into one effective policy with a predictable result.",
    d: "The effective policy for a process is assembled from layers: platform baseline, kind template, application rules, and any grants stored for this user. Composition defines precedence, whether later layers can only narrow or can also widen, and how conflicts resolve. A well-defined rule is that a lower-trust layer can only subtract from what a higher-trust layer allows. It is hard because union semantics are easy to implement and wrong: adding a fragment should never silently grant what another fragment forbade.",
    k: ["Intersection of layers vs union with deny override: intersection is easy to reason about but forces every layer to repeat common allowances; union with deny override is compact but order-sensitive.", "Composing at author time vs at load time: author time yields one reviewable file; load time reflects the user's live grants but is harder to inspect."],
    p: ["A fragment included twice with different parameters yields rules whose combined effect nobody wrote or reviewed.", "Load-time composition differs from what the test environment composed, so a profile passes tests and behaves differently in the field."],
    v: "Dump the effective policy of a running confined process and verify it equals the composition of the named layers. Add a deny in the baseline and confirm no app-level rule can reopen it.",
    dep: ["profile-templates", "policy-language"]
  },
  "app-manifest-declarations": {
    s: "The application's own signed statement of what it needs: required services, data locations, device classes and network use, which the platform turns into policy.",
    d: "The manifest ships inside the package and is read at install and launch. It lists requested permissions and the reason for each, file types handled, background behavior and bundled helper processes. The platform derives the profile from it and shows the person a summary. It is hard because developers over-declare to avoid breakage, because declarations drift from the code as features change, and because a manifest is only a request: the broker must still enforce it at the moment of use.",
    k: ["Declared up front vs requested at runtime: up-front manifests allow store review and install-time summaries, while runtime requests match user context but are invisible to review.", "Coarse permission categories vs fine-grained operations: coarse categories are understandable to people, fine operations are enforceable but unreadable."],
    p: ["Apps request every permission they might ever use, so the install summary becomes a wall of consent nobody reads.", "Manifest and signed bundle contents are checked at different times, allowing a swapped file after the check."],
    v: "Install an app whose manifest omits network use and confirm any connection attempt is refused. Add the declaration, update the package, and confirm the same attempt now succeeds and the change appears in the install summary.",
    dep: ["app-identity-and-signing", "policy-compiler"]
  },
  "policy-compiler": {
    s: "The translator that turns readable rules into the compact, ordered form the kernel evaluates on every operation, checking them for mistakes on the way.",
    d: "It parses profiles, expands variables and includes, resolves conflicts, and emits a binary representation: a decision tree, a state machine over path strings, or a filter program. Static checks catch rules that shadow each other, patterns that can never match, and references to unknown operations. Output size and evaluation cost matter because the result is run on hot paths. It is hard because the compiled form must mean exactly what the source meant, and a compiler bug is a silent permission change.",
    k: ["Compile once offline vs compile at load: offline compilation allows testing and signing of the exact bytes, while load-time compilation can adapt to the machine but widens trusted code.", "Optimizing the rule set vs preserving rule order for debugging: optimized output is faster but denial messages can no longer name the rule that fired."],
    p: ["A normalization difference between the compiler and the kernel's path handling lets a crafted path escape a pattern.", "Compiled policy grows past kernel limits for large profiles and fails to load, leaving a process unconfined or unable to start."],
    v: "Compile a profile, then run a differential test: for several thousand sampled operations, compare the compiled policy's decision with a slow reference interpreter of the source. Every decision must match.",
    dep: ["policy-language"]
  },
  "policy-loading": {
    s: "Installing compiled policy into the kernel and attaching it to a process before that process runs untrusted code, with failure meaning no launch.",
    d: "The broker or launcher submits the compiled policy and binds it to the new process or its identity, so it applies to the process and all its children and cannot be removed from inside. Loading can be atomic replacement for updates. Failure paths are the substance: a rejected policy, a kernel without a required feature, or a partial load must stop the launch rather than start the app unconfined. It is hard because features differ across kernel versions, and a policy that loads on one machine may silently drop rules on another.",
    k: ["Refuse to start on any load failure vs degrade to a weaker policy: refusing is safe and visible but breaks apps on older kernels; degrading keeps users working while hiding the weakness.", "Policy attached to the process vs to the executable file: process attachment is explicit and revocable by the broker; file attachment follows the binary but can be bypassed by copying it."],
    p: ["Treating a missing kernel feature as a warning leaves a fleet running with half the intended confinement.", "Replacing policy on a live process leaves a window where neither old nor new rules apply."],
    v: "Launch an app on a kernel lacking one required mechanism and confirm the launch is refused with a clear reason. On a supported kernel, read back the attached policy from the process and compare to the compiled file.",
    dep: ["policy-compiler", "sandbox-bootstrap"]
  },
  "learning-mode": {
    s: "A development mode that allows everything but records each operation an app performs, so authors can generate a first profile from observed behavior.",
    d: "The sandbox runs permissive and logs every would-be denial with the operation, object and calling context. A tool aggregates the log into suggested rules, merging paths into patterns. It speeds profile writing enormously, but it records what the app did on one run, not what it needs: it captures incidental accesses, misses rarely taken code paths and, run on a compromised build, would bake the attacker's behavior into the policy. Output is a draft for human review, never a policy to ship.",
    k: ["Generate rules from logs vs write from requirements: generation is fast and catches forgotten dependencies, but encourages accepting whatever was observed without asking if it is justified.", "Per-run suggestions vs merged over many runs: merging covers more paths but hides which test produced which rule."],
    p: ["Authors accept all suggested rules, including accesses to the home directory caused by a debugging setting.", "Learning mode left enabled in a shipped build disables enforcement entirely."],
    v: "Run the test suite in learning mode, generate a profile, then enforce it and rerun the suite. All tests pass, and a reviewer can attach a reason to every generated rule or delete it.",
    dep: ["denial-logging", "policy-language"]
  },
  "policy-versioning": {
    s: "Tracking which version of each rule set applies to which app and platform release, so updates can be rolled out, compared and reverted.",
    d: "Policies change with the platform, with each app release and with security fixes. Versioning gives each rule set an identifier and a compatibility range, lets old apps keep an older behavior while new ones get the stricter rule, and records what changed. Signed policy bundles prevent tampering. It is hard because tightening a rule breaks some app somewhere, so every change needs a rollout path, telemetry about breakage, and a way back that does not reopen the hole.",
    k: ["Version policy with the app vs with the platform: app-bound versions keep old apps working but let old behavior linger; platform-bound versions tighten everyone at once and break more.", "Staged rollout with reversion vs immediate enforcement: staging limits breakage but extends exposure to the issue being fixed."],
    p: ["Rolling back a policy to fix breakage silently restores a vulnerability the tighter rule closed.", "Different versions on different devices make bug reports impossible to reproduce without knowing the policy version."],
    v: "Publish a tighter policy to a test cohort and confirm the target operation is denied there and still allowed in the control group. Roll it back and confirm both match again and the version is visible in a denial record.",
    dep: ["policy-compiler"]
  },
  "app-identity-and-signing": {
    s: "The cryptographic identity of an application and its publisher, which anchors every grant, profile and consent decision to something that cannot be forged by renaming a file.",
    d: "Packages are signed; the platform verifies the signature chain at install and records the identity as publisher, application id and sometimes a hash of the contents. Policy, entitlements and stored consent attach to that identity, not to a path or a display name. Updates are accepted only from the same publisher. It is hard because identity must survive updates and legitimate key rotation, while a stolen signing key or a repackaged app from a different publisher must not inherit the previous app's grants.",
    k: ["Identity by publisher key vs by content hash: publisher keys survive updates but make key theft catastrophic; content hashes are exact but invalidate grants on every release.", "Verify at install only vs at every launch: launch-time checks catch tampering after install at some start-up cost."],
    p: ["Grants keyed to the app's display name let a lookalike app inherit another app's permissions.", "Modified files on disk after install are never rechecked, so a signature verified once protects nothing later."],
    v: "Modify one byte of an installed app's binary and confirm the platform refuses to launch it, or launches it with no stored grants, and reports a signature failure.",
    dep: []
  },
  "entitlements": {
    s: "Signed, named capabilities attached to an application's identity, such as use of the camera or reading a shared folder, that unlock specific broker services.",
    d: "An entitlement is a key and a value inside the signed package. The kernel or broker checks it when the app asks for a restricted operation. Platform-defined entitlements are granted only to publishers that meet review rules; others need the person's consent as well. Entitlements make capabilities auditable and revocable per app. They are hard because there are many, they interact (one may imply another), and an entitlement that is too powerful or checked in one place only becomes a hidden master key.",
    k: ["Many narrow entitlements vs few broad ones: narrow ones follow least privilege but become unmanageable; broad ones are simple and grant far more than any one feature needs.", "Checked in the kernel vs in the broker: kernel checks are hard to bypass, broker checks are flexible and carry context but depend on broker correctness."],
    p: ["A debugging entitlement shipped in a release build lets other processes attach to or inject code into the app.", "Entitlement checks inconsistent between two services let an app use one to reach what the other forbids."],
    v: "Install two builds of the same app, one with and one without a sensitive entitlement, and confirm the first can call the guarded service and the second receives a denial naming the missing entitlement.",
    dep: ["app-identity-and-signing"]
  },
  "install-time-grants": {
    s: "Permissions the platform decides when an app is installed, from its manifest and review status, without asking the person again each time the app runs.",
    d: "Low-risk capabilities, such as using a private data container or showing notifications, are granted automatically and recorded. Others are held back for runtime prompts. The install step also creates the app's storage, derives its profile and registers its helper processes. It is hard to draw the line: grants made silently at install are invisible to people, and a long list of install-time grants gradually becomes the effective permission model.",
    k: ["Grant quietly at install vs ask at first use: install grants avoid interruptions but give the person no context; first-use prompts tie the grant to a visible action.", "Group permissions into bundles vs individual items: bundles are readable but over-grant; individual items are precise and numerous."],
    p: ["An update adds new install-time grants without telling anyone, and the app quietly gains capability.", "Uninstall leaves grants and data containers behind, which a reinstalled app by another publisher may inherit."],
    v: "Install an app and list its grants from the consent store. Every grant must trace to a manifest line, and updating the app to add a capability must show a new entry with a timestamp.",
    dep: ["app-manifest-declarations", "consent-store"]
  },
  "permission-prompts": {
    s: "The dialog shown to the person when an app first uses a sensitive capability, naming the app, the resource and the reason, and recording the answer.",
    d: "The broker pauses the request, shows a prompt drawn by trusted system UI so the app cannot spoof or cover it, and resumes with the decision. The prompt can offer scopes such as once, while in use, or always, plus the app's stated reason. It must be unforgeable and resistant to click-jacking and rapid repeated requests. It is hard because people accept prompts to continue what they were doing, so frequency, wording and timing decide whether consent means anything.",
    k: ["Prompt at the moment of use vs ask in advance: moment-of-use is understood in context but interrupts and can be gamed by timing; advance questions lack context.", "Scoped one-time grants vs persistent grants: one-time grants limit later abuse but cause prompt fatigue, which pushes people to choose always."],
    p: ["An app triggers a prompt over its own fake dialog or immediately after an action that makes tapping allow reflexive.", "A denied prompt is shown again and again until the person gives in."],
    v: "Trigger a capability request from a test app and confirm the prompt is drawn outside the app's window, cannot be dismissed by synthetic input from the app, and that the decision appears in the consent store with scope and time.",
    dep: ["consent-store", "app-identity-and-signing"]
  },
  "consent-store": {
    s: "The persistent record of what each person has allowed each app, kept outside the app's reach and consulted by the broker on every sensitive request.",
    d: "Entries are keyed by user, application identity and resource class, with scope, time and source of the decision. The store is writable only by the broker and the settings interface. It backs prompts, settings screens and revocation, and must survive updates, backups and restores correctly. It is hard because it is a trust anchor: corruption or tampering grants or hides permissions, and its records must stay consistent across devices, profiles and managed overrides.",
    k: ["Single store for all resources vs one per subsystem: a single store gives one place to review and revoke; per-subsystem stores let services evolve independently but split the picture.", "Restore consent with a backup vs reset it: restoring spares people re-answering but can grant a new device what the person never saw there."],
    p: ["The store sits in a location the app's own container can reach, so the app edits its own consent.", "A migration drops entries or defaults them to allowed, widening grants for the whole installed base."],
    v: "From inside a confined test app, try to open the consent store and write to it. Both must fail. Then change a grant in settings and see the next broker request honor it without restarting the app.",
    dep: ["app-identity-and-signing"]
  },
  "grant-revocation": {
    s: "Withdrawing a permission after it was given, with immediate effect on running processes and held handles, not just on the next launch.",
    d: "The person changes a setting or policy expires a grant. The broker updates the consent store and then must make the change real: close or invalidate handles it passed earlier, stop camera or file streams, and end sessions. Some handles live in the app and cannot be recalled, so brokers prefer short-lived handles. It is hard because revocation must be prompt without crashing the app, and an app holding an already-open file or device may keep working long after the grant was removed.",
    k: ["Terminate the app on revoke vs notify and let it adapt: termination guarantees the effect but loses user work; notification is graceful and relies on the app complying.", "Long-lived handles vs short leases that must be renewed: leases make revocation timely at the cost of extra broker calls."],
    p: ["Revoked access remains available through a file descriptor the app already holds.", "The settings screen shows revoked while a background helper of the same app still has the capability."],
    v: "Start a recording through the camera service, revoke the permission, and confirm the frames stop within a stated bound and the next open request is denied, with the revocation logged.",
    dep: ["consent-store", "handle-passing"]
  },
  "usage-indicators": {
    s: "Visible, system-drawn signs that a sensitive capability is in use, such as a camera or microphone light or a status icon, which an app cannot hide.",
    d: "When the broker opens a camera, microphone, screen capture or location stream for an app, the platform shows an indicator and records which app. Indicators are produced by the trusted layer, or by hardware, not by the app. They let the person notice use they did not expect, and they feed an access log. They are hard because they must cover every path to the sensor, including helpers and background services, and must remain truthful if a service crashes or a stream is shared.",
    k: ["Hardware-tied indicator vs software indicator: hardware cannot be turned off by compromised software, but exists only on some devices; software indicators work everywhere and depend on the platform staying intact.", "Always show vs show only for background use: always showing is honest and noisy, so people learn to ignore it."],
    p: ["A helper process opens the sensor through a path that never triggers the indicator.", "The indicator stays on after a crash, or goes off while the stream still runs."],
    v: "Open the microphone from a foreground app and from a background helper in turn and confirm the indicator appears for both, names the right app, and clears within a second after each stream is closed.",
    dep: ["camera-microphone-portal", "consent-store"]
  },
  "managed-policy-override": {
    s: "Rules set by an administrator or organization that override or constrain individual consent, such as blocking a capability or forcing an app into a stricter profile.",
    d: "On managed devices, a policy source outside the user can disable device classes, require specific apps, restrict network destinations or lock prompts to deny. The effective decision combines managed policy, platform policy and personal consent, with managed rules usually winning. Delivery needs authentication and a way to display why something is blocked. It is hard because conflicts must be explained to the user, and an administrator's policy must not become a route for the administrator to quietly gain access to personal data.",
    k: ["Managed deny always wins vs per-capability negotiation: absolute deny is simple and predictable; negotiation handles legitimate exceptions with more complexity and more mistakes.", "Push policy to the device vs query a service at decision time: pushed policy works offline; queried policy is current but fails when the service does."],
    p: ["Managed policy is cached and keeps blocking a capability after the administrator removed the rule.", "Users see only a generic permission denied and cannot tell it came from the organization."],
    v: "Apply a managed rule blocking the camera, then confirm the prompt never appears, requests fail with a reason naming the managed policy, and removing the rule restores the normal prompt path.",
    dep: ["consent-store", "policy-loading"]
  }
});
