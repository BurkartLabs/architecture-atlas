// Details for the mobile operating system plate, part 4: install and store, system updates, isolation, secure storage.
ATLAS.details("mobile-os", {
  "package-installer": {
    s: "The privileged component that unpacks an app package, verifies it, assigns it an identity and storage, prepares its code and registers it with the system.",
    d: "An install session receives the package, often in split pieces, checks the signature and compatibility with the device, assigns a unique user identity, creates the private data directory, extracts or optimizes native code, and commits the result atomically. Updates replace code but keep data and must keep the same signing key. It is hard because it must be transactional: a power loss mid-install cannot leave a half-installed app, and the installer is the gate that every code path to the device passes.",
    k: ["Atomic staged installs vs in-place file replacement: staging lets a failed or interrupted install roll back cleanly; it needs temporary space equal to the package size.", "Installer as a system service with install-from-unknown-source permission vs open installation: gating by permission protects against drive-by installs; legitimate stores need the grant and users must understand the prompt."],
    p: ["An update with a different signing key is refused, so developers who lose a key can never update existing installs.", "Low storage during install produces a failure that is often reported as a vague error."],
    v: "Install a split package, cut power mid-commit and reboot: confirm either the old version runs intact or the new one is complete, never a partial app; confirm an update signed with another key is rejected.",
    dep: ["signing-verification", "package-database", "per-app-identity", "install-time-optimization"]
  },
  "package-database": {
    s: "The system's persistent record of every installed app: its components, permissions, signing identity, version and install source.",
    d: "The package manager reads manifests at install and writes an entry per package, with indexes for intent filters, permission definitions and shared identities. At boot it rebuilds in-memory structures from this record and rescans system apps if the system image changed. Queries about installed apps run against it and are filtered by visibility rules. It is hard because it is consulted by nearly every service, must stay consistent through updates, multi-user setups and crashes, and its rebuild after a system update is a large share of the first boot after update.",
    k: ["Persistent database plus in-memory cache vs rescan everything at boot: persistence makes normal boots quick; it can drift from the real files and needs repair logic.", "Package visibility filtering vs complete answers: filtering stops apps from profiling the user by installed software; it breaks apps that legitimately want to interact with others."],
    p: ["A stale entry after a failed uninstall makes an app appear present but unlaunchable.", "The first boot after a system update takes minutes while every package is reparsed."],
    v: "Install, update and uninstall an app and confirm entries change atomically; reboot and compare the in-memory state with the stored records, expecting no differences.",
    dep: ["app-manifest", "signing-verification"]
  },
  "signing-verification": {
    s: "Cryptographic signatures that bind each package to its developer's key, checked on install and update so apps cannot be tampered with or silently taken over by another publisher.",
    d: "Developers sign packages with a private key; the installer verifies the signature over the whole package and compares the signing certificate to the installed version's. Newer schemes sign the entire file and support key rotation with a lineage proof, so a compromised key can be replaced. Apps with the same key can share identity and signature-level permissions. It is hard because the key is the root of an app's identity, so loss or theft is catastrophic and rotation must be supported without breaking updates.",
    k: ["Developer-held key vs store-held signing key: developer-held means full control and portability; a lost key means no future updates, so many stores manage keys on the developer's behalf.", "Whole-file signature vs per-entry signature: whole-file signing prevents unsigned modifications anywhere; older entry-based signing leaves gaps and is slower to verify."],
    p: ["A key stored in a repository or shared build server is stolen and used to publish malicious updates.", "Verification only at install misses a package modified on disk afterward unless integrity is checked again at load."],
    v: "Modify one byte in a signed package and confirm install fails; update an installed app with a package signed by a different key and confirm it is refused, while a package with a valid rotation proof is accepted.",
    dep: ["keystore-service"]
  },
  "store-client": {
    s: "The on-device app that searches, downloads, installs and updates apps from the store channel, using the system installer under special privileges.",
    d: "The client shows listings, handles purchase and licensing, downloads packages and calls the installer, which trusts it as an update owner. It checks for updates in the background, scheduled by the job scheduler, and can update apps silently when conditions fit. It reports the install source to the system so policy can treat store apps differently. It is hard because it combines a commerce flow, a download pipeline and a privileged installer, so integrity of both content and account is critical.",
    k: ["Store as the default trusted installer vs open source installation: a trusted channel gives review, malware scanning and updates; users who install elsewhere lose these and the system warns them.", "Silent background updates vs asking: silent updates keep devices patched; they surprise users and interrupt apps in use."],
    p: ["Download over a metered network without a warning consumes a user's data allowance.", "A compromised store client can install any package, so its own signing and update path must be strongly protected."],
    v: "Install an app from the store on a fresh device and confirm its recorded install source is the store; trigger an automatic update on an idle device and confirm the app is updated without interrupting a foreground app.",
    dep: ["package-installer", "job-scheduler", "signing-verification", "store-review-pipeline"]
  },
  "store-review-pipeline": {
    s: "The server-side process that screens submitted apps with automated analysis and human review for malware, policy violations and permission misuse before publication.",
    d: "A developer uploads a signed package and a listing. Automated systems scan code and behavior in emulated devices, check declared permissions against usage, and compare against known malware. Policy reviewers inspect sensitive categories. Accepted builds are published to a track, and later versions repeat the process. It is hard because adversaries adapt: malicious behavior can be delayed or triggered only on real devices, and a review process that is too slow or too opaque harms honest developers.",
    k: ["Automated pre-publication scanning with sampled human review vs full human review: automated scanning scales and is fast; adversarial apps can evade it with delayed or conditional behavior.", "Post-publication monitoring and removal vs strict gates: monitoring catches what review missed using real-world signals; harm may occur before removal."],
    p: ["Apps that behave well during review and change behavior after a remote switch pass the check.", "Opaque rejection reasons leave developers unable to fix a violation."],
    v: "Submit a test app that requests an unused sensitive permission and confirm review flags it; submit a known benign app and confirm approval within the stated time. Track rejection and appeal turnaround.",
    dep: ["signing-verification", "permission-declarations"]
  },
  "staged-rollout": {
    s: "Releasing an app or system update to a small percentage of devices first, watching crash and usage signals, and widening or halting it based on what is seen.",
    d: "The store assigns each eligible device to a cohort and delivers a new version only to that fraction. Crash reporting and vitals measured on those devices feed a dashboard, and the developer raises the percentage, or halts and rolls back by publishing a fixed build. Closed testing tracks give early access to selected users. It is hard because a bad release affects real users before it is detected, and because rollback of an app cannot remove already-migrated data.",
    k: ["Percentage-based cohorts vs release to everyone: cohorts limit harm from a bad build; fixes take longer to reach everybody and versions fragment.", "Halt on automatic crash thresholds vs manual review: automatic halts react quickly; thresholds can be tripped by unrelated outages or miss quiet data corruption."],
    p: ["A data migration in the new version cannot be undone by shipping the old one, so a rollback leaves users broken.", "A small cohort has too little traffic to detect a rare crash."],
    v: "Release a build to five percent, force a crash in the new build and confirm the dashboard shows it for that cohort only; halt the rollout and confirm no further devices receive the build.",
    dep: ["store-client", "store-review-pipeline"]
  },
  "install-time-optimization": {
    s: "Compiling an app's portable code into device-specific native code, using usage profiles, either at install or in the background while idle and charging.",
    d: "Apps ship portable bytecode. The runtime can interpret it, compile hot parts at runtime, or compile ahead of time. The installer applies cloud-supplied or on-device profiles to compile only the methods users actually run, balancing startup speed against storage and install time. A background job recompiles when profiles improve and after system updates. It is hard because tuning is empirical, compiled code for a different runtime version is invalid and must be rebuilt, and compilation competes with the user for CPU and battery.",
    k: ["Profile-guided partial compilation vs full ahead-of-time: partial uses less storage and installs faster with most of the startup gain; it needs profile data and a warm-up period.", "Compile at install vs in idle maintenance: compile at install gives fast first launches; idle maintenance keeps installs quick but first launches are slower."],
    p: ["After a system update every app is recompiled, producing a long slow period and heat.", "Stale profiles cause compilation of code that is never used and extra storage."],
    v: "Install an app, launch it cold and record startup time before and after the background compile completes: startup should improve to the profile-guided level, and a system update should trigger exactly one recompile pass.",
    dep: ["package-installer", "idle-state-manager", "job-scheduler"]
  },
  "update-client": {
    s: "The on-device component that checks for system updates, downloads them, applies them to the inactive slot and tells the user or schedules the reboot.",
    d: "The client polls or is pushed a notice from the vendor's update server, receives metadata with version, size, and constraints, then streams the payload and writes it directly to the inactive partitions while the phone remains usable. After verification it marks the slot to boot next and asks for a reboot. Progress, pause and resume are handled across network changes. It is hard because it must be safe against interruption at every byte and on any device state, including nearly full storage and low battery.",
    k: ["Stream directly to the inactive slot vs download first then install: streaming needs no extra storage for the package; it requires a payload format supporting random access and verification as it arrives.", "Automatic install with scheduled reboot vs user-initiated: automatic keeps devices patched; users are annoyed by surprise restarts."],
    p: ["Resuming a partial download against a changed server payload corrupts the written slot unless hashes are checked.", "An update interrupted by low battery and never resumed leaves the device unpatched for months."],
    v: "Start an update, toggle airplane mode and kill the client repeatedly, then let it finish: confirm the written slot verifies and boots, and the old slot remains untouched until the switch.",
    dep: ["update-payload", "slot-manager", "update-scheduling-policy", "connectivity-stack"]
  },
  "update-payload": {
    s: "The signed update file format: a set of operations that rewrite the target partitions from the source, usually as binary deltas, with hashes for each block.",
    d: "The payload holds a manifest of per-partition operations, such as copy, replace, and apply a delta to source blocks, and a signature over the manifest. A delta generator compares the old and new images and produces small patches that are applied against the installed version, so updates are a fraction of full size. Because the payload is applied to a specific source image, it only works on devices at the expected version, otherwise a full payload is used. Hard parts are generating efficient deltas and verifying every operation.",
    k: ["Delta payloads between exact versions vs full images: deltas are much smaller; they only apply to one source version and multiply the artifacts the server must host.", "Block-level operations vs file-level patches: block-level works for any file system and encrypted images; it cannot exploit file semantics for smaller patches."],
    p: ["A delta built from a slightly different source image than the device runs fails to apply, and the device falls back to a large full download.", "Compression with a large memory window exceeds memory on low-end devices during apply."],
    v: "Generate a delta between two builds, apply it to a device at the source version and compare resulting partition hashes with the target build: they must match exactly; apply to a wrong source version and confirm it is refused.",
    dep: ["update-verification"]
  },
  "slot-manager": {
    s: "Keeps two copies of the system, active and inactive, and records which one the bootloader should start next and whether it has been proven to work.",
    d: "Each updatable partition exists twice. The update writes the inactive copy, then the manager sets it as the next boot target with a tries counter and marks it unverified. The bootloader reads this metadata, boots the target and decrements the counter. If the system confirms success, the slot is marked good; otherwise the bootloader falls back to the other copy. Hard parts are the atomic metadata updates and the doubled storage cost, which some designs reduce by sharing a pool of space between slots.",
    k: ["Two full slots vs one slot with a recovery partition: two slots allow updates during use and instant rollback; they cost storage, partly reduced by sharing a dynamic pool.", "Bootloader-owned fallback vs OS-owned: bootloader fallback works even if the new OS cannot run at all; the bootloader needs to understand the slot metadata."],
    p: ["Marking a slot successful too early hides a late boot failure and removes the fallback.", "User data migrated by the new system may be unreadable by the old one after rollback."],
    v: "Install an update that deliberately fails to boot and confirm the device falls back to the previous slot after the configured number of attempts, and boots normally with data intact.",
    dep: ["boot-health-check", "verified-boot"]
  },
  "update-verification": {
    s: "Checks that an update is authentic and intact: a signature on the payload, hashes on every block, and a rollback-protection version that forbids older builds.",
    d: "The client verifies the manifest signature against a key the device already trusts, then verifies each operation's hash as it is applied. After writing, the new slot is hashed again and compared with the expected value. The verified boot chain re-checks the partitions at every boot. A monotonic rollback index, stored in tamper-resistant storage, refuses downgrades to builds with known vulnerabilities. The difficulty is allowing legitimate downgrades in testing without opening an attack path.",
    k: ["Rollback protection that blocks all downgrades vs allowing them: blocking prevents reintroducing fixed vulnerabilities; it makes recovery from a bad build harder and needs a service path.", "Verify during write vs only after: verifying during write catches corruption early; it adds CPU time and complexity."],
    p: ["A signing key that is compromised and not revocable lets attackers push a malicious update.", "Rollback index advanced for a build later withdrawn makes a recovery build unusable."],
    v: "Flip a bit in a block of the payload and confirm apply stops at that block; try to install an older signed build and confirm the rollback index rejects it.",
    dep: ["verified-boot", "secure-hardware-keys", "update-payload"]
  },
  "boot-health-check": {
    s: "A check run after the first boot of a new system, such as reaching a stable home screen, which decides whether to keep the new slot or revert.",
    d: "After switching slots the system runs normally for a trial period. Native daemons and the framework report readiness, and a watchdog restarts the device if they fail repeatedly. When health conditions pass, the update service marks the slot successful. If the bootloader's attempt counter runs out first, it reverts. Hard parts are choosing conditions that detect real breakage without being so strict that a minor fault forces rollback, and handling bugs that appear only after hours of use.",
    k: ["Early success mark after minimal checks vs delayed after longer validation: early marking frees the fallback sooner and finishes the update; delayed marking catches more faults but keeps two slots in play.", "Automatic revert vs stay on the new build: automatic revert protects against boot loops; it can hide a problem that fails only after user data migration."],
    p: ["A system that boots but cannot reach the network, or crashes on first use, looks healthy to a shallow check.", "Repeated rollback loops drain the battery as the device retries the same failing update."],
    v: "Ship a build whose framework crashes at startup and confirm the device reboots, falls back to the previous slot and reports the failure; ship a good build and confirm the slot is marked successful after the trial.",
    dep: ["slot-manager", "service-registry"]
  },
  "update-scheduling-policy": {
    s: "The rules for when an update may download, install and reboot: network and battery conditions, active hours, user deferral and administrator windows.",
    d: "A policy layer decides eligibility: unmetered network or user consent, sufficient battery or charging, and idle time. Reboots are scheduled in a quiet window, avoiding calls and alarms, with deferral allowed up to a limit. Administrators can freeze updates for critical periods or require a deadline. Security patches may bypass some deferrals. The challenge is aligning a global rollout, which the vendor wants gradual, with a user and fleet context that wants predictable timing.",
    k: ["Phased server-side rollout vs everyone at once: phased limits the damage of a bad update; vulnerable devices wait for a patch while it is gradually released.", "Allow user deferral vs enforce a deadline: deferral respects the user's schedule; a deadline guarantees patching of exposed devices."],
    p: ["A reboot scheduled during a user's alarm or travel causes a missed event.", "An administrator freeze extended too long leaves managed devices behind on security patches."],
    v: "Configure active hours and a deferral limit and confirm the reboot lands outside them; set an administrator freeze and confirm no install occurs during it, and that it expires on schedule.",
    dep: ["job-scheduler", "policy-engine", "data-connection-manager"]
  },
  "per-app-identity": {
    s: "Each installed app gets its own operating system user identity, so kernel file and process permissions separate apps from one another by default.",
    d: "At install the system assigns a unique user ID to the package, and every file the app creates is owned by it. The app's processes run under that ID, so the kernel denies access to other apps' files and processes without any app-specific code. Apps from the same developer can share an ID by request. The same ID is what the system uses to look up permissions. It is hard because the ID space is finite, because shared identity merges trust, and because per-app identity stops being reliable when files are made world-accessible.",
    k: ["One identity per app vs one per developer or per session: per-app identity gives the strongest default separation; sharing data between two apps then needs explicit channels.", "Identity per app and user vs only per app: including the user keeps separate profiles apart; it multiplies the identity range and storage structures."],
    p: ["Files created with permissive modes in shared storage can be read by unrelated apps.", "A shared-identity merge of two apps lets a weak app act with the privileges of a strong one."],
    v: "Install two apps, have one attempt to open the other's private file and signal its process: both operations must fail at the kernel with permission errors.",
    dep: ["package-installer"]
  },
  "mandatory-access-control": {
    s: "A kernel-enforced policy of labeled subjects and objects that restricts what each process type may do, even for processes running with full user privileges.",
    d: "Every process, file, socket and service carries a security label. A compiled policy lists which labels may perform which operations on which others. App processes get an untrusted app label with narrow rights; system services get tight, service-specific labels. Rules are default deny. Even root-owned processes are bound by them. It is hard because the policy is huge, and an over-permissive rule added to make a feature work silently erases a protection; vendors extending policy for their hardware risk adding exceptions.",
    k: ["Default-deny labeled policy vs identity-based discretionary checks only: labels contain compromised services and root processes; policy authoring is slow and error-prone.", "Enforcing mode in production vs permissive logging: enforcing blocks attacks; permissive helps development but must never ship."],
    p: ["A vendor adds a rule giving a service access to all app data to fix a bug, creating a universal read path.", "A policy denial that is not logged during testing appears only as a mysterious feature failure in production."],
    v: "Run the policy checker over the built policy to confirm no app label can write system files or access hardware nodes beyond the allowed set; trigger a denied access and confirm an audit log entry names both labels.",
    dep: ["hal-contracts"]
  },
  "syscall-filtering": {
    s: "A filter that restricts which kernel system calls an app or service process can make, shrinking the part of the kernel an attacker can reach from a compromised app.",
    d: "At process creation, a small program loaded into the kernel inspects each system call and its arguments, and kills the process or returns an error for calls not on the allowlist. App processes get a wide-but-bounded list, while isolated processes such as media parsers get a very short one. The filter is inherited by children and cannot be removed. It is hard because a missing call crashes a legitimate app, a library update can start using a new call, and attackers aim at the allowed calls.",
    k: ["Allowlist of permitted calls vs denylist of dangerous ones: allowlists are safer by default and need maintenance as libraries change; denylists keep apps working and miss new dangerous calls.", "Per-process-type filters vs one global filter: per-type filters give isolated components far tighter limits; each type must be tested separately."],
    p: ["A library update that uses a call outside the filter crashes only on devices running the new platform build.", "A permissive filter for compatibility is the one attackers use to reach vulnerable kernel interfaces."],
    v: "From a test app, invoke a call that is not on the allowlist and confirm the process is killed with a violation logged; run the standard app test suite and confirm no violations for allowed calls.",
    dep: ["process-spawner"]
  },
  "storage-isolation": {
    s: "Separation of app data: private internal directories per app, scoped access to shared files, and separate keyed storage per user and profile.",
    d: "Each app has a private directory only it can read. Shared storage, such as photos and downloads, is exposed through a mediated layer that lets apps see only their own files, or specific media types with permission, or a user-picked file through a picker. Cross-user directories are mounted separately and encrypted with separate keys. The platform presents a virtual view per app and enforces it through mount namespaces and file system rules. It is hard because older apps assume global file paths.",
    k: ["Scoped storage with mediated access vs raw shared file access: scoping limits what a compromised app can read and gives users control; many older apps and file managers need rewriting or a special all-files grant.", "Per-user mount isolation vs path checks in the framework: mount isolation is enforced by the kernel; path checks are cheaper to deploy and easier to bypass."],
    p: ["An app granted broad file access reads other apps' exported data stored in shared folders.", "Migrating existing app data into the scoped layout loses files when paths are hardcoded."],
    v: "Create a file in app A's shared folder and attempt to list and open it from app B without permission: it must be invisible; grant the media permission and confirm only media types are listed.",
    dep: ["per-app-identity", "file-based-encryption", "mandatory-access-control"]
  },
  "memory-safety-mitigations": {
    s: "Defenses against exploitation of memory bugs: randomized layout, non-executable data, stack protection, pointer authentication and hardened allocators with tagging.",
    d: "The platform builds system code with stack canaries, control-flow integrity and bounds checks, randomizes where code and data load, and uses allocators that detect use-after-free and overflow, possibly with hardware memory tags that check each access. These do not remove bugs but make an exploit fail or crash. Enabling features per app is optional or by default. Costs include memory, speed and compatibility. It is hard because defenses are probabilistic and attackers combine bugs to bypass them.",
    k: ["Hardware tag checking on by default vs opt-in: default protects all apps and catches real bugs; it adds overhead and exposes latent bugs as crashes.", "Rewrite critical components in a memory-safe language vs mitigate in place: rewriting removes entire bug classes; it is slow and the old code stays for years."],
    p: ["A mitigation applied to system code but not to codec libraries leaves the most attacked parsers unprotected.", "Disabling a mitigation for compatibility on one device silently weakens that device."],
    v: "Run a test that writes one byte past a heap allocation: confirm the process aborts with a tag or guard fault report rather than continuing; check that code and stack addresses differ across launches.",
    dep: ["process-spawner", "syscall-filtering"]
  },
  "verified-boot": {
    s: "A chain of signatures from an immutable hardware root through each boot stage to the system partitions, which detects tampering and sets the device's trust state.",
    d: "The first stage in ROM verifies the next stage with a key fused into the chip, and each stage verifies the following one, ending with the kernel and the system. Large partitions are checked block by block as they are read, using a hash tree whose root is signed. The result, locked or unlocked and verified or not, is reported to the OS and to key attestation. Unlocking the bootloader wipes data. The difficulty is allowing legitimate flexibility while keeping the guarantee that a locked device runs only signed code.",
    k: ["Block-level integrity checking on read vs verifying whole partitions at boot: per-block checking makes boot fast and catches corruption lazily; a read error appears later as an I/O failure.", "Locked bootloader with a wipe on unlock vs permanently locked: unlock with wipe supports developers and recovery while protecting user data; permanently locked is safer and blocks owner choice."],
    p: ["A device left with an unlocked bootloader is silently untrusted but still usable, and users do not notice.", "A leaked signing key for any stage breaks the chain for every device that trusts it."],
    v: "Modify one block of the system partition and confirm boot fails or the read returns an error; read the reported boot state on a locked device and confirm it matches the signed images.",
    dep: ["secure-hardware-keys"]
  },
  "file-based-encryption": {
    s: "Encrypts each file with a key tied to the user, using credential-protected keys for private data and device-level keys for data needed before unlock, such as alarms.",
    d: "The file system encrypts file contents and names with per-user keys held in the kernel keyring. After boot, only device-encrypted storage is available, which lets alarms, calls and accessibility work before the user unlocks. When the user enters a credential, the credential service derives the key, unwraps it in secure hardware, and the user's credential-encrypted storage becomes readable. On lock or user switch, keys can be evicted. The hard part is deciding which data is needed before unlock.",
    k: ["Per-file keys with two storage classes vs whole-disk encryption: per-file classes allow services before unlock and separate users; whole-disk is simpler and needs the credential before anything runs.", "Evict keys on lock vs keep them while the device is on: eviction protects a locked device from memory attacks; it breaks background apps that need credential-protected data."],
    p: ["Apps that touch credential-protected storage before first unlock crash after a reboot, but only on devices with a lock.", "Weak credentials make the strong key derivation irrelevant, since the secret limits the whole scheme."],
    v: "Reboot a locked device and confirm credential-protected files cannot be read while device-protected ones can; unlock and confirm access is restored for that user only.",
    dep: ["keystore-service", "lock-credential-service", "secure-hardware-keys"]
  },
  "keystore-service": {
    s: "The system service that creates and holds cryptographic keys for apps and the platform, so apps can sign and decrypt using keys that they cannot read.",
    d: "An app requests a key with usage rules such as algorithm, purpose, validity, whether user authentication is required and whether the key is bound to hardware. The service stores it wrapped by a hardware-backed master key and performs operations on request, never returning private material. Authentication-bound keys work only for a short period after the user unlocks or for each biometric use. It is hard because the same service must serve slow, secure hardware and fast software paths and keep rules identical.",
    k: ["Keys that never leave the service vs apps holding key material: non-extractable keys survive app compromise; apps must route every operation through the service and accept its limits.", "Require authentication per use vs time-window authentication: per-use is strongest for payments; a window is more convenient for repeated actions."],
    p: ["Keys created without authentication requirements are usable by malware running as the app.", "Backup and device migration cannot carry hardware-bound keys, so apps must be able to re-create them."],
    v: "Generate an authentication-bound key, attempt to use it with the device locked and confirm failure; unlock and confirm success only within the validity window, and confirm export attempts fail.",
    dep: ["secure-hardware-keys", "lock-credential-service", "biometric-service"]
  },
  "secure-hardware-keys": {
    s: "A dedicated tamper-resistant processor or isolated execution environment that stores root keys and performs sensitive operations, so even a compromised kernel cannot extract them.",
    d: "Hardware roots such as a secure element or an isolated environment keep keys in memory that the main processor cannot read. They run a small trusted application that implements key generation, signing and credential checks, with rate limits on wrong attempts and erase on excess failures. The main system communicates through a narrow message interface. It is hard because the trusted code is a small but critical attack surface, updates are infrequent, and a flaw cannot be patched by users.",
    k: ["Separate security chip vs isolated mode on the main processor: a separate chip resists physical and side-channel attacks; an isolated mode is cheaper and faster but shares silicon with untrusted code.", "Rate-limiting enforced inside hardware vs in the OS: hardware limits cannot be bypassed by a compromised OS; they need monotonic counters and tamper-proof storage."],
    p: ["A flaw in the trusted application can leak every key; there is no fast path to fix millions of devices.", "A secure-hardware reset or replacement during repair invalidates every wrapped key and the user's data."],
    v: "Attempt wrong credentials in a loop and confirm throttling is enforced even after rebooting and restarting the main OS; confirm key export through any interface fails.",
    dep: ["hal-contracts"]
  },
  "biometric-service": {
    s: "Coordinates fingerprint, face and other biometric sensors, enforces strength classes, and releases authentication tokens that keys and apps can trust.",
    d: "A sensor captures a sample and a matcher, often inside secure hardware, compares it with enrolled templates. The service reports success only with a signed token that the keystore checks, and not a plain yes. Sensors are classified by spoof resistance: strong ones may unlock keys and approve payments; weaker ones only unlock the screen. Failed attempts are limited, then a fallback credential is required. It is hard to balance false accepts, false rejects, spoofing and recovery.",
    k: ["Matching in secure hardware vs in the main OS: secure matching keeps templates safe; it limits how algorithms can be updated.", "Strong versus weak classes by spoof resistance: classes let convenient sensors unlock the screen without opening high-value keys; they confuse users who expect one rule."],
    p: ["Templates stored outside secure hardware can be stolen and replayed.", "Enrolling a new biometric without a recent credential lets an attacker add themselves after gaining brief access."],
    v: "Enroll a finger, authenticate with a different finger and a photo of the enrolled one, confirming both fail; confirm a strong biometric releases a key bound to it while a weak one does not.",
    dep: ["secure-hardware-keys", "keystore-service", "sensor-hub"]
  },
  "lock-credential-service": {
    s: "Manages the user's PIN, pattern or password: verifying it, throttling attempts, and deriving the keys that unlock encrypted storage.",
    d: "The credential is never stored in the clear. The service sends the attempt to secure hardware, which stretches it, compares it to the stored verifier, rate limits failures, and on success releases the key material needed for file encryption. After several wrong attempts delays increase. A weak secret falls to guessing despite stretching, so the service enforces minimum length and complexity from policy. It is hard because it must work when everything else is broken, and it is the human weakest link.",
    k: ["Short numeric PIN with hardware-enforced throttling vs long passphrase: a PIN is usable all day, and hardware throttling makes brute force slow; a passphrase resists offline attack but users avoid it.", "Escalating delays vs wipe after N failures: delays are safe against accidents; a wipe stops determined attacks but can destroy data on a child's tries."],
    p: ["Escalating delays that reset on reboot let an attacker retry cheaply unless the counter lives in secure hardware.", "A forgotten credential with no recovery loses all data by design."],
    v: "Enter ten wrong PINs and confirm the delay grows and persists after reboot; enter the correct one and confirm both screen unlock and credential-encrypted storage open.",
    dep: ["secure-hardware-keys", "policy-engine"]
  },
  "key-attestation": {
    s: "A signed statement from secure hardware, chained to a manufacturer root, that a key lives in hardware and describes the device's boot state and patch level.",
    d: "When an app generates a key, it can request a certificate chain. The leaf certificate contains an extension saying key properties, whether verified boot is intact and the operating system version. A remote server validates the chain to a published root and checks fields to decide whether to trust the device for a payment or an enterprise login. It is hard because trust depends on the whole chain, revocation of compromised device keys is difficult, and attestation can be abused to lock out custom systems.",
    k: ["Hardware attestation of device state vs software integrity checks: hardware attestation cannot be forged by a compromised OS; software checks are bypassable but flexible.", "Per-device unique keys vs batch keys: unique keys allow revocation of one device and risk tracking users; batch keys protect privacy and cannot revoke one device."],
    p: ["A server that validates only the leaf certificate accepts a forged chain.", "Old devices that cannot attest are excluded from services that require it."],
    v: "Generate an attested key, send the chain to a verifier and confirm it chains to the expected root with the right boot state and patch level; unlock the bootloader and confirm the boot-state field changes.",
    dep: ["verified-boot", "secure-hardware-keys", "keystore-service"]
  },
  "credential-manager": {
    s: "A unified system service for passwords, passkeys and federated sign-in, offering saved credentials to apps and sites through one trusted picker.",
    d: "An app requests a credential with parameters; the manager asks registered providers for matches, shows a system-drawn picker, and returns the chosen one to the app after biometric or lock-screen confirmation. Passkeys are public-key credentials scoped to a web origin, so a phishing site cannot use them. Providers sync credentials across devices through their own encrypted services. It is hard because it must work for web and apps, with many providers and recovery paths, without becoming a phishable choice.",
    k: ["Origin-bound passkeys vs shared-secret passwords: passkeys cannot be phished or reused; recovery and cross-ecosystem portability are harder.", "Pluggable providers vs one built-in store: plug-in providers give users choice; each provider must be trusted with every credential it handles."],
    p: ["Account recovery that falls back to SMS or email undoes the phishing resistance of passkeys.", "Credentials tied to hardware keys are lost when a device is lost without a synced backup."],
    v: "Register a passkey at a site, sign in with a biometric, then attempt the same sign-in from a look-alike domain and confirm no credential is offered.",
    dep: ["keystore-service", "biometric-service", "window-manager"]
  },
});
