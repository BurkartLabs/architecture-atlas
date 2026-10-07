// Details part 2: keys and sealing, enclaves and confidential VMs, secure world.
ATLAS.details("trusted-execution", {
  "key-broker": {
    s: "A service that holds data keys and releases them only to workloads whose attestation satisfies a stated policy, acting as the gate between verification and secrets.",
    d: "The broker receives an attestation token or raw evidence, checks it against the policy attached to a key, and returns the key wrapped to a public key that was bound into the evidence. Only the attested environment can unwrap it. Applications fetch disk keys, image keys and credentials this way instead of embedding them. It must be highly available, since a down broker prevents startup, and highly protected, since it holds many keys. Often it runs inside its own protected environment.",
    k: ["Broker holds keys vs broker only wraps keys held in a hardware vault: holding is simple and makes the broker a prize; vault-backed adds latency and cost but limits theft.", "Single broker vs one per tenant: per tenant isolates damage and multiplies operations."],
    p: ["Keys are returned over a channel that is authenticated but not bound to the attested key, so a relay forwards them to another party.", "The broker's audit log is mutable, hiding who received which key."],
    v: "Request a key from an attested workload and from a copy with one changed byte. Only the first receives it, and the broker log records the measurement for each decision.",
    dep: ["key-release-policy", "attestation-token", "secret-provisioning"]
  },
  "key-release-policy": {
    s: "The rule attached to a secret stating exactly which measurements, versions, signers and conditions an attested workload must have before the secret is released.",
    d: "A policy can require a specific measurement, a signer in a list, a minimum security version, debug disabled, a specific region or time window, and a nonce-bound request. It is stored with the key and evaluated at release time. Good policies are narrow: a key for one service should not be released to another service signed by the same team. Policies must evolve with deployments, so they need a safe update process that does not let an operator replace a restrictive policy with a permissive one unobserved.",
    k: ["Bind to exact measurement vs to signer plus version: exact is most precise and breaks on every patch; signer binding is practical and trusts the signer's every future release.", "Release once at boot vs release on each use: once is efficient; per use allows quick revocation but adds a dependency on every operation."],
    p: ["A policy that names only the signer releases production keys to any image signed by that key, including test images.", "Policy updates are not audited, and a loosened rule goes unnoticed."],
    v: "Attempt release with a correct measurement but debug enabled, and with a lower security version. Confirm each is refused with the failing condition named.",
    dep: ["evidence-appraisal", "tcb-version", "signer-identity"]
  },
  "sealed-storage": {
    s: "Data encrypted with a key that the hardware derives from the protected code's identity, so only the same code, or the same author, on the same platform can decrypt it.",
    d: "The protected code asks the hardware for a sealing key based on its measurement or signer identity and the platform's secret. It encrypts data with that key and stores it anywhere, including untrusted disk. Later runs derive the same key and read it back. Sealed data survives restarts without an external service. The limits are binding and portability: it cannot move to another machine, and after a platform firmware change or a code upgrade the derived key may differ, making the data unreadable unless a migration path exists.",
    k: ["Seal to measurement vs to signer: measurement is strict but breaks on upgrade; signer allows new versions to read old data, so a vulnerable old version can be run to extract it.", "Seal to hardware vs use a broker key: sealing needs no network but loses data if the machine dies; broker keys survive hardware loss."],
    p: ["Sealed blobs are accepted without a version check, so an old blob is replayed.", "An upgrade changes the sealing identity and users lose their data because no migration step was designed."],
    v: "Seal a value, restart, and unseal it. Then modify the code by one byte, rebuild and confirm unsealing fails when sealed to measurement.",
    dep: ["hardware-key-derivation", "signer-identity", "rollback-protection"]
  },
  "hardware-key-derivation": {
    s: "A hardware instruction or firmware service that derives a key from a fused device secret together with the caller's identity and the platform's security version.",
    d: "The device secret never leaves the chip. A key derivation function mixes it with the measurement or signer of the requesting code, the security version and optional caller-supplied context, and returns a key only to that code. Because the security version is an input, a platform updated to fix a flaw produces different keys than a vulnerable one, so attackers cannot obtain keys by downgrading. The hard part is choosing which inputs to mix: too few leak keys across identities, too many break access after benign updates.",
    k: ["Include the security version in derivation vs not: including it prevents downgrade extraction but needs a way for newer firmware to derive older keys; excluding it is simpler and weaker.", "Per-request derivation vs cached keys: derivation each time keeps keys out of memory; caching is faster and extends exposure."],
    p: ["Derived keys are used directly for several purposes, so a flaw in one cipher usage affects all.", "A new platform version cannot derive the previous version's keys, and data becomes unrecoverable after an update."],
    v: "Derive a key on one machine, repeat on another with the same code and confirm the keys differ. Repeat on the first machine after restart and confirm they match.",
    dep: ["fused-device-keys", "tcb-version", "launch-measurement"]
  },
  "secret-provisioning": {
    s: "The process of delivering secrets such as API keys, certificates and passphrases into a protected environment after it has proven its identity, without the host seeing them.",
    d: "After attestation the workload opens a channel to a provisioning service, using a key pair whose public half is in its report. The service encrypts secrets to that key. Alternatives inject a small secret into the guest at launch through a measured firmware step. The channel must terminate inside the boundary, and secrets must land in protected memory and never touch host-visible files. Bootstrapping is the difficulty: the first secret needs a trust path that does not itself depend on a secret.",
    k: ["Inject at launch vs fetch after boot: injection is simple and limited in size and number; fetching supports rotation and many secrets but needs a network and a broker.", "Push by the owner vs pull by the workload: push lets owners control timing; pull fits autoscaling."],
    p: ["Secrets are exposed through environment variables or process listings that the host can read for a guest shared with it.", "The provisioning channel is authenticated to the service but not to the attested key, and any relay can intercept."],
    v: "Capture all host-visible traffic and storage during provisioning, search for the secret value and its encodings, and confirm none appear while the workload can use the secret.",
    dep: ["key-broker", "attested-tls", "initial-state-injection"]
  },
  "migration-and-backup-keys": {
    s: "Mechanisms for moving protected state between machines or recovering it after hardware loss, without letting the host or the old platform's weaknesses expose it.",
    d: "Because hardware-derived keys are tied to one device, migration needs an explicit protocol: the destination proves its attestation to the source or a broker, the source verifies a policy, and state is re-encrypted for the destination. Backup uses keys held by an escrow service or split between parties. Live migration of a running confidential VM must also move encrypted memory and measurement state. It is hard because every migration path is an extra way for the secret to be exported, and so a target for attack.",
    k: ["Migration through an attested peer vs through an escrow key: peer migration keeps secrets between verified platforms; escrow survives total loss but concentrates risk.", "Allow live migration vs forbid it: allowing it enables maintenance; forbidding it removes a major attack surface and complicates operations."],
    p: ["The destination's security version is not checked, so state moves from a patched machine to a vulnerable one.", "Backup keys are stored beside the data they protect."],
    v: "Migrate a workload to a platform with an older security version and confirm the source refuses. Migrate to a current platform and confirm the workload resumes with intact state.",
    dep: ["key-broker", "tcb-version", "hardware-key-derivation"]
  },
  "rollback-protection": {
    s: "Counters or version records that cannot be reset by the host, used to detect that stored state has been replaced with an older valid copy.",
    d: "Encryption and authentication prove data was written by the protected code, not that it is the latest. A monotonic counter held in hardware, a trusted server or a replicated service is stored in each state update and checked on load. A mismatch means rollback. Hardware counters are scarce and slow, wear out and may live on the same untrusted platform. Distributed protocols use several protected nodes holding counters. The trade is between availability and safety: a crash between writing data and incrementing a counter must not lock out the user.",
    k: ["Hardware counter vs network service: hardware needs no server but is slow, limited and tied to the machine; a service scales and adds a dependency and its own trust.", "Increment before write vs after: before stops rollback but a crash loses the latest data; after keeps data and allows a brief replay window."],
    p: ["Counter exhaustion or reset by a firmware update lets old state be accepted again.", "A crash between steps leaves a counter ahead of the data and the application cannot start."],
    v: "Save state, snapshot the disk, update the state, restore the snapshot, and confirm the next start detects that the stored counter is ahead and refuses the old state.",
    dep: ["hardware-key-derivation", "sealed-storage"]
  },
  "enclave-memory-region": {
    s: "A contiguous range of memory owned by one protected domain, whose contents are encrypted in RAM and inaccessible to the operating system, hypervisor and other processes.",
    d: "The hardware records which physical pages belong to the region, ties them to an enclave identity and checks every access against it. Code outside gets either an abort or encrypted garbage when it reads. Inside, the code sees its own plaintext. Region size is fixed at creation in many designs, so heap and stack limits are decided at build time. The operating system still manages the pages, which is why the hardware must stop it from reading, remapping or substituting them without the enclave noticing.",
    k: ["Fixed-size region vs growable: fixed makes measurement and address checks simple; growth adds flexibility but requires measured additions at run time.", "Region inside a normal process vs a separate address space: inside allows cheap sharing with the host app; separate is easier to reason about and costs copying."],
    p: ["The region is sized for typical load and a large input exhausts the heap, crashing the enclave.", "Sharing a pointer between inside and outside makes the host's value used as trusted state."],
    v: "From the host process, read the region's virtual addresses and confirm all-ones or ciphertext, while the enclave reads its own data correctly. A physical-memory dump should show no recognizable plaintext.",
    dep: ["memory-encryption-engine", "page-ownership-table", "reserved-memory-carveout"]
  },
  "confidential-vm": {
    s: "A virtual machine whose memory and register state are encrypted and integrity-protected from the hypervisor, so a guest operating system runs without trusting the host that schedules it.",
    d: "The hypervisor still allocates memory, schedules virtual CPUs and emulates devices, but the hardware encrypts guest pages with a key the hypervisor cannot obtain, and saves guest registers into protected memory on exits. A security processor or firmware module handles creation, measurement and attestation. The guest needs modifications to treat the host as hostile. Compared with enclaves, the trusted base is larger, as it includes the guest OS, but no application rewrite is needed.",
    k: ["Whole-VM protection vs process-level enclaves: a VM runs unmodified applications and trusts a full guest kernel; an enclave trusts only a small library and requires partitioning.", "Hypervisor-assisted vs hardware-managed state: hypervisor assistance keeps hardware simple but needs careful validation of what the host reports."],
    p: ["The hypervisor injects interrupts or exceptions at chosen moments and the guest kernel mishandles them.", "The guest trusts host-provided time, causing certificate checks and token expiry to be wrong."],
    v: "Dump the memory of the VM from the hypervisor and confirm it is ciphertext. Request an attestation report from inside the guest and confirm it states the encryption mode and launch measurement.",
    dep: ["memory-encryption-engine", "domain-key-slots", "launch-measurement", "register-state-protection"]
  },
  "protected-page-cache": {
    s: "A dedicated pool of memory reserved for protected pages, along with the hardware metadata tracking which enclave owns each page and what it may do.",
    d: "At boot, firmware reserves a physical range, encrypted and excluded from normal use. Hardware maintains a metadata map recording page owner, type, permissions and whether it is valid. Instructions add, extend and remove pages and update this map atomically, so the operating system can request changes but not forge ownership. The pool is limited, so many enclaves compete for it. When it is exhausted, the system must evict pages to untrusted storage, which requires encryption, integrity and version protection.",
    k: ["Small fixed pool with eviction vs large reserved pool: small saves RAM and invites paging overhead; large avoids paging and wastes memory when idle.", "Metadata kept on chip vs in protected memory: on chip is fast and costly in silicon; in memory scales and adds an extra access per miss."],
    p: ["Memory pressure from many enclaves causes eviction storms that slow every protected process.", "Firmware reserves less than the workload needs and applications fail to start without a clear error."],
    v: "Start enclaves until the pool is full, measure start time and run a memory-touching workload, and confirm eviction counters rise and results stay correct.",
    dep: ["reserved-memory-carveout", "page-ownership-table", "protected-paging"]
  },
  "enclave-threads": {
    s: "The mechanism that lets several host threads enter protected code concurrently, each with its own saved state and stack inside the boundary.",
    d: "Each thread control structure has a fixed entry address, a state-save area and a stack. The host picks which one to enter; the hardware switches to the protected context and runs from the declared entry point. Only these pre-declared entries are allowed, which prevents jumping into the middle of code. On interrupt, state is saved and registers cleared before control returns to the host. Concurrency is hard: the host decides how many threads run and when, and can interleave entries in ways the code never anticipated.",
    k: ["Fixed number of thread slots vs dynamic creation: fixed is measured and predictable; dynamic uses memory better and complicates measurement.", "Host-scheduled threads vs enclave-internal scheduler: host scheduling is simple and lets the host starve work; internal scheduling hides patterns and costs complexity."],
    p: ["Locks implemented as spin loops depend on the host ever scheduling the holder, and the host can stall it indefinitely.", "Re-entry while a thread is mid-update corrupts shared state."],
    v: "Enter the enclave from more threads than slots and confirm the extra entries are refused cleanly. Interrupt a running thread and confirm host-visible registers are cleared.",
    dep: ["world-switch", "register-state-protection", "enclave-calls"]
  },
  "protected-paging": {
    s: "Moving protected pages out to untrusted storage under encryption and integrity protection, and bringing them back with a check that they are the right, latest version.",
    d: "When memory is scarce, the operating system asks the hardware to evict a page: the hardware encrypts it, produces a version token and authentication tag, and stores the token in a protected structure. The OS keeps the ciphertext. On reload, the hardware verifies the tag and token, so replaced or old pages are rejected. Since the OS controls the paging, it sees which pages are touched and when, which is exactly the signal used in controlled-channel attacks. Paging also costs thousands of cycles per page.",
    k: ["Allow host-driven paging vs pin everything: paging supports more enclaves than memory and exposes the access pattern; pinning is leak-free and limits scale.", "Version tokens per page vs a tree over all pages: tokens are simple and consume protected memory; a tree scales and adds verification steps."],
    p: ["Enclave runs a working set larger than the pool and spends its time in page faults.", "The host evicts the single page the code needs on every step, using faults as a precise tracing tool."],
    v: "Force eviction of one page, flip a bit in the stored ciphertext and reload. The load must fail. Reload an older ciphertext copy and confirm it is also rejected.",
    dep: ["protected-page-cache", "integrity-tree", "controlled-channel-defense"]
  },
  "private-shared-pages": {
    s: "The distinction in a confidential VM between pages encrypted and visible only to the guest, and pages deliberately left readable by the host for communication.",
    d: "By default, guest memory is private. To talk to the host, the guest converts specific pages to shared, after which the hypervisor can read and write them and the encryption key no longer applies. The guest tracks which pages are shared and must never place secrets there. Conversions are requests to the hypervisor and are validated by hardware. Mistakes are subtle: a stale mapping that still points to a page after it becomes shared leaks, and a shared page can change between a check and its use.",
    k: ["Explicit per-page conversion vs a fixed shared window: explicit is flexible and error-prone; a fixed window is simple to audit and limits throughput.", "Guest validates its own page state vs trusts hypervisor reports: self-tracking is safer and needs extra bookkeeping at boot and on every conversion."],
    p: ["A buffer is converted to shared for I/O and later reused for private data without conversion back.", "The hypervisor remaps a private page to a different guest address and the guest uses the wrong contents."],
    v: "Write a recognizable pattern to a private page and a shared page, dump from the host, and confirm only the shared pattern is visible. Convert and re-check each.",
    dep: ["page-ownership-table", "guest-host-interface", "bounce-buffer-io"]
  },
  "enclave-lifecycle": {
    s: "The ordered steps from creating a protected region, adding and measuring pages, initializing it, running it, to tearing it down and scrubbing its memory.",
    d: "Creation reserves the region and starts a measurement. Each added page, with its contents and permissions, updates the measurement. A finalize step locks the measurement and permits execution; after that no more measured pages may be added. Destruction requires all threads to exit, then the hardware invalidates and clears pages before they can be reused. Strict ordering matters because a mistake in the sequence could let the host insert unmeasured code, or reuse pages still holding secrets.",
    k: ["Measure everything at build and load vs allow later dynamic additions: complete measurement is easy to verify; later additions support dynamic loading and weaken the single-hash claim.", "Scrub on destroy vs lazily on reuse: eager scrubbing is safe and costs time at teardown; lazy is quick and risks a missed case."],
    p: ["Teardown is aborted midway and pages return to the pool with remnants of secrets.", "A page is added after finalize through a permitted dynamic path and is never measured."],
    v: "Create an enclave, deliberately skip one page, and confirm the resulting measurement differs from the signed value so the loader rejects it. Destroy it and confirm freed pages read zero.",
    dep: ["launch-measurement", "protected-page-cache", "measurement-registers"]
  },
  "secure-os": {
    s: "A small operating system running in the isolated secure world, providing scheduling, memory management and services to trusted applications that the normal world cannot inspect.",
    d: "It runs at a privilege level of its own, with memory marked secure by the interconnect so normal-world code and most devices cannot access it. It offers trusted applications an API for crypto, storage and communication, and handles requests arriving from the normal world through the secure monitor. Its size should be tiny since it is the trusted base. It must be hardened against requests from a hostile normal world and against flaws in the applications it hosts.",
    k: ["Full secure OS with application isolation vs a single monolithic secure image: isolation limits one flawed application's damage and costs size; monolithic is tiny and any bug exposes everything.", "Same secure OS across products vs custom per device: shared receives wider review and a larger common attack surface."],
    p: ["A flaw in one trusted application's parsing gives control of the secure OS and every secret it stores.", "The secure OS trusts shared-memory pointers from the normal world without translating and checking them."],
    v: "From the normal world, attempt to read secure memory addresses and secure-only peripherals and confirm bus errors. Invoke a trusted application with a malformed buffer and confirm a clean error.",
    dep: ["secure-monitor", "secure-cpu-modes", "reserved-memory-carveout"]
  },
  "trusted-applications": {
    s: "Small programs, such as key stores, payment code and media decryption, that run in the secure world and expose narrow command interfaces to normal-world clients.",
    d: "Each application has an identity, a set of commands and its own memory and storage. A normal-world client opens a session, sends a command with buffers, and receives a result. Inside, the application holds keys, performs operations and never reveals the key itself. Applications are signed by their author and loaded on demand or at boot. They should expose operations, such as sign this, rather than raw secrets. Hard problems are input validation of every command and avoiding information leaks via error codes and timing.",
    k: ["Operation-oriented API (sign, decrypt) vs key export: operations never reveal keys but must authenticate the caller; export is flexible and defeats isolation.", "Many small applications vs one large one: small ones isolate failures and multiply sessions and loading; one is fast and shares a bigger blast radius."],
    p: ["A command accepts a length from the client and copies that many bytes, overflowing secure memory.", "Any normal-world process can open a session, so a compromised app uses the key store as a signing oracle."],
    v: "Call every command with zero-length, oversized and overlapping buffers and confirm each returns a defined error and the application keeps serving later calls.",
    dep: ["secure-os", "trusted-app-loader", "secure-storage-service"]
  },
  "trusted-app-loader": {
    s: "The component that authenticates, decrypts, relocates and starts a trusted application image in the secure world.",
    d: "Images are signed, and optionally encrypted, by their author or device owner. The loader verifies the signature against a key chain rooted in the device, checks a version against a minimum to block old images, maps code into secure memory and starts it. Some systems load at boot, others on demand from the normal world's file system, which means the image arrives through an untrusted path. The loader is a high-value target because it parses complex input before any isolation applies to the image.",
    k: ["Load from the untrusted file system vs bundle in secure storage: file system loading eases updates and requires full verification; bundling reduces input but needs a firmware update for each change.", "Per-application keys vs one platform key: per-application limits what a leaked key allows; platform key is simple to manage."],
    p: ["Version checks use a counter that the host can reset, so old vulnerable applications run again.", "The image header is parsed before the signature is checked, giving attackers a parser to exploit."],
    v: "Load an image with one flipped byte, a valid one with an old version number, and a valid current one. Confirm only the third starts and the first two are logged with distinct causes.",
    dep: ["firmware-signing", "downgrade-protection", "secure-os"]
  },
  "secure-monitor": {
    s: "The most privileged software on the processor, which switches between normal and secure worlds, saving and clearing state so that neither can observe the other.",
    d: "A special call instruction or interrupt traps into the monitor, which saves the caller's registers, restores the target world's registers, flips the security state, and resumes. It also handles power management, firmware calls and secure interrupt routing. Because it runs beneath both worlds, any bug is total compromise. It is kept to a few thousand lines and formally reviewed. Subtle problems include registers and caches that retain data across the switch and call arguments that name memory the caller cannot actually access.",
    k: ["Monitor does only switching vs also hosts services: switching-only is small and verifiable; added services reduce calls and enlarge the most trusted code.", "Clear all registers on switch vs only those not in use: clearing everything is safe and slower; selective is quick and depends on getting the list right."],
    p: ["A register is not cleared on a path and leaks a pointer or secret across worlds.", "Call arguments naming memory are not checked against the caller's world, enabling a confused-deputy write into secure memory."],
    v: "Fill all registers with a marker in the secure world, return to the normal world and confirm none contain the marker. Pass a secure address as a buffer from the normal world and confirm rejection.",
    dep: ["secure-cpu-modes", "register-state-protection", "boot-rom"]
  },
  "secure-storage-service": {
    s: "A secure-world service that stores keys and data for trusted applications, encrypting them with device-bound keys before placing them in untrusted storage.",
    d: "Applications ask for named objects. The service encrypts each with a key derived from the device secret and the application identity, authenticates metadata and writes the blob through the normal world file system or to a protected flash region. A counter, in dedicated hardware if available, guards against rollback. Applications cannot read each other's objects. The storage path crosses the untrusted side, so the service must handle missing, truncated and replayed data safely and survive power loss during writes.",
    k: ["Store in normal-world files vs in dedicated secure flash: files are cheap and need rollback protection; secure flash resists replay and costs hardware and capacity.", "Per-object keys vs per-application key: per-object limits exposure; per-application is simpler and makes a single leaked key cover everything."],
    p: ["Power loss during a write leaves a corrupted object with no earlier copy, losing the device's keys.", "Object names are visible to the host, leaking which services the device uses."],
    v: "Write an object, copy its blob to another device and try to read it there (fails), then restore an older blob on the same device and confirm the counter check rejects it.",
    dep: ["hardware-key-derivation", "rollback-protection", "secure-os"]
  },
  "trusted-peripherals": {
    s: "Devices and buses that only the secure world can access, such as a fingerprint sensor, display overlay, secure input or crypto accelerator, so the normal world cannot capture their data.",
    d: "The interconnect tags each master and each device with a security attribute and blocks mismatches. A secure display path lets a payment prompt be drawn over normal-world output, and secure input prevents keyloggers from seeing PIN digits. Devices may be dynamically switched between worlds, which requires clearing buffers and state during the change. The difficulty is physical and electrical: every path, including DMA and interrupts, must be assigned correctly, and one misconfigured controller becomes a bypass.",
    k: ["Permanent assignment to the secure world vs dynamic switching: permanent is simple and denies normal-world use; dynamic shares hardware and risks leaking state at each switch.", "Secure display via overlay vs full-screen takeover: overlay is seamless and risks spoofing by the normal world; takeover is clear to the user and disruptive."],
    p: ["A DMA-capable device is left non-secure and can read secure buffers through the bus.", "Interrupts from a secure device are delivered to the normal world, revealing timing of PIN entry."],
    v: "Attempt to read a secure sensor's registers from the normal world and confirm a bus fault. Capture input traffic while entering a PIN on the secure path and confirm digits are absent.",
    dep: ["dma-protection", "secure-cpu-modes", "exception-routing"]
  },
  "secure-scheduling": {
    s: "How CPU time is shared between the secure and normal worlds, including whether secure work runs only when the normal world calls it or can preempt.",
    d: "In the common design the secure world is passive: it runs only while a normal-world thread has called in, using that thread's time. Alternatives give it its own cores or timers so it can run on secure interrupts. Passive scheduling means the normal world can starve secure work, and secure work can delay the normal world's interrupts. Preemption points inside long secure operations let the normal world regain control. The balance between latency for real-time secure tasks and fairness is the main design problem.",
    k: ["Passive (called by the normal world) vs active (own interrupts): passive is simple and lets the host stall; active guarantees progress and complicates interrupt routing.", "Long non-preemptible operations vs yielding points: non-preemptible is simpler to make safe and hurts normal-world latency."],
    p: ["A long secure operation blocks interrupts on its core and causes missed deadlines in the normal OS.", "The normal world never schedules the secure thread, and a time-limited protocol times out."],
    v: "Run a long cryptographic operation in the secure world while measuring normal-world interrupt latency, and confirm latency stays below the documented bound through yielding points.",
    dep: ["secure-os", "exception-routing", "secure-timer-source"]
  },
});
