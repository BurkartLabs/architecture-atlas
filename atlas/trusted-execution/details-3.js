// Details part 3: calls between worlds, measurement and launch, attestation mechanisms.
ATLAS.details("trusted-execution", {
  "world-switch": {
    s: "The hardware-assisted transition between untrusted and protected execution, which saves state, changes the security context and clears what must not cross.",
    d: "Entering protected code is done through a dedicated instruction that jumps only to a declared entry point and changes the memory-access rules. Leaving, whether by a normal return, an exception or an interrupt, saves protected registers into protected memory and replaces visible state with safe values. Each switch costs thousands of cycles because of state handling and often cache and translation buffer flushes. Hard parts are asynchronous exits, where the host interrupts at any instruction, and making sure no register or flag survives the transition.",
    k: ["Flush caches and predictors on switch vs leave them warm: flushing blocks cross-domain timing leaks and slows every call; leaving them is fast and keeps channels open.", "Synchronous call only vs allow asynchronous exits: synchronous is easier to reason about, but a protected thread then cannot be preempted without cooperation."],
    p: ["A frequently crossing design spends most of its time on switches instead of useful work.", "A flag or segment register not reset on exit lets host code influence protected control flow on the next entry."],
    v: "Set every general register and flag to a marker before an enter and again before an exit. Inspect the other side's first instruction and confirm no marker values are visible.",
    dep: ["isolation-instructions", "register-state-protection", "secure-cpu-modes"]
  },
  "enclave-calls": {
    s: "The two call directions across the boundary: calls into the protected code (ecalls) and calls from it back out to the host (ocalls), both through generated, checked stubs.",
    d: "An ecall switches in at a declared entry, dispatches by function index through a table, validates and copies arguments, runs, and returns a result. An ocall saves the protected context, exits, runs a host function and re-enters at a continuation point, so the protected code must treat what comes back as untrusted. Nested combinations, with an ocall that triggers a new ecall, need a clear rule. Return values and error codes from the host are the main way an adversary steers protected logic.",
    k: ["Small fixed set of entry points vs many: few entries are easier to audit and fuzz; many fit natural APIs and enlarge the attack surface.", "Allow nested ecalls from ocalls vs forbid: allowing supports callbacks and reentrancy bugs; forbidding is simple and breaks some designs."],
    p: ["An ocall's return value is used as an array index without a range check.", "Re-entrant calls run against half-updated state because the protected code assumed ocalls do not call back."],
    v: "Fuzz every ecall with malformed arguments and every ocall return with out-of-range values, running under a memory checker inside the enclave, and confirm no faults or leaks.",
    dep: ["interface-definition", "world-switch", "parameter-marshalling"]
  },
  "shared-memory-channel": {
    s: "A region both sides can read and write, used to pass bulk data or run asynchronous queues without a world switch per message.",
    d: "Protected code and the host agree on a buffer outside the protected region, often organized as a ring of request and response slots. Because the host can alter contents at any moment, the protected side reads each field once into private memory before checking it, and never trusts a pointer or length stored in the channel. Throughput can be much higher than synchronous calls since switches are avoided, and a worker thread inside can poll the queue. Data placed there must be encrypted if it is secret.",
    k: ["Shared ring buffers vs copying through synchronous calls: rings avoid switch cost and need strict single-fetch discipline; calls are simple and slow.", "Polling threads vs notifications: polling lowers latency and burns a core; notifications save power and add exits."],
    p: ["A length field is checked and then re-read from shared memory, and the host changes it between the two reads.", "Secrets are left in the buffer after use and are visible to the host later."],
    v: "Run a stress test where the host mutates shared fields continuously and confirm the protected side never reads out of bounds and logs every rejected message.",
    dep: ["parameter-marshalling", "private-shared-pages", "enclave-threads"]
  },
  "parameter-marshalling": {
    s: "The copying and checking of arguments as they cross the boundary, so protected code works on private copies of validated data.",
    d: "On entry, buffers named by outside pointers are copied into protected memory after verifying the pointer range lies wholly outside. On exit, results are copied out after verifying the destination is outside. Structures with embedded pointers are deep-copied by rules in the interface definition. Copying prevents time-of-check-to-time-of-use changes and keeps pointers to internal data from leaking. It costs time proportional to size and requires memory for the copy, which matters in fixed-size enclaves.",
    k: ["Copy then validate vs validate in place: copying closes races and doubles memory traffic; in-place is fast and only safe for read-once data.", "Marshalling generated per call vs generic serializer: generated is faster and type-specific; generic is flexible and may mishandle odd structures."],
    p: ["A pointer that lies partly inside and partly outside the protected range passes a naive check.", "A copy size computed from untrusted counts overflows an integer and allocates a tiny buffer."],
    v: "Pass a buffer straddling the region boundary, one of maximum integer length and one that shrinks mid-call. Confirm each is rejected or handled before any use.",
    dep: ["interface-definition", "enclave-memory-region"]
  },
  "guest-host-interface": {
    s: "The defined set of requests between a confidential guest and its hypervisor for memory conversion, device emulation, time and inter-processor signaling, all handled as untrusted.",
    d: "The guest calls the host through dedicated instructions or exits and receives results in registers or shared pages. Because the host answers, every response is a claim, not a fact. Some requests, such as memory conversion, are also checked by hardware; others, such as device configuration, are only as good as the guest's validation. A guest-host specification lists every request and the checks required, and guest kernels are audited against it. The surface is wide because ordinary kernels expect device emulation to be benign.",
    k: ["Minimal interface with few requests vs full paravirtual support: minimal leaves little to attack and limits features; full gives performance and a larger audit burden.", "Guest hardening in the kernel vs in a shim below it: kernel hardening is complete and requires patches; a shim leaves the kernel unmodified and may miss paths."],
    p: ["A paravirtual device driver trusts a ring index from the host and reads outside its buffer.", "Time or interrupt-controller emulation by the host is accepted without cross-checks."],
    v: "Run a guest with a host that returns hostile values for every request in the specification, including out-of-range and delayed ones, and confirm the guest logs and survives without disclosure.",
    dep: ["private-shared-pages", "confidential-vm"]
  },
  "host-driver": {
    s: "The untrusted operating-system component that creates protected regions, adds pages, schedules entry and handles faults on behalf of protected code.",
    d: "The driver exposes calls to user-space loaders, issues the hardware instructions for creation and page management, tracks which pages are resident, and services page faults and eviction. Because it is untrusted, protected code never assumes it behaves; the hardware enforces what it may and may not do. Yet it controls availability: it decides whether an enclave runs, how much memory it gets and when it is paged. It also must stay compatible with the kernel's memory management, which it was not designed around.",
    k: ["Driver in the kernel vs in a user-space helper: kernel placement has full memory access and a bigger crash risk; user-space is safer and needs more privileges delegated.", "Driver merged upstream vs maintained out of tree: upstream gets review and stability; out of tree moves faster and breaks on kernel updates."],
    p: ["A kernel update changes memory internals and the driver crashes or leaks protected pages on teardown.", "Resource limits are absent, so one tenant exhausts the protected pool."],
    v: "Create and destroy protected regions repeatedly under load and confirm the protected pool returns to its initial free count and the kernel log shows no leaked pages.",
    dep: ["protected-page-cache", "enclave-lifecycle", "protected-paging"]
  },
  "syscall-proxy": {
    s: "A layer that turns a protected program's system calls into checked outward calls, so unmodified code can read files and use sockets while the boundary is preserved.",
    d: "System calls attempted inside are trapped by a runtime. For each one, the proxy decides to handle it internally (memory, threads), refuse it, or forward it through an ocall with arguments marshalled and results checked. Return values and buffers from the host are validated for size and plausibility. This allows code to interact with the world, with the host seeing every request and result. Mediation attacks, where the host returns false data from a system call, are the central difficulty: no result from the proxy is trustworthy by default.",
    k: ["Forward and trust results vs verify results cryptographically: forwarding is compatible and exposes the program to a lying kernel; verification costs overhead and works only where data is authenticated.", "Allow broad syscall surface vs a short allow-list: broad runs more software; short limits what the host can influence."],
    p: ["A file read returns different bytes than the host's disk, and the program treats it as authentic.", "Forwarded calls leak file names, sizes and access timing even if contents are encrypted."],
    v: "Run a program under a host that returns altered results for each forwarded call and confirm authenticated data is rejected, while the trace lists each forwarded call by name.",
    dep: ["enclave-calls", "library-os", "parameter-marshalling"]
  },
  "bounce-buffer-io": {
    s: "A guest technique of staging device data through shared memory, encrypting or decrypting inside the guest, so the host's emulated or physical devices never touch private pages.",
    d: "Since devices and the hypervisor cannot read private memory, I/O data is copied between a private buffer and a shared bounce area. The guest encrypts outgoing data first and decrypts and verifies incoming data afterward. Disk, network and console go through this path. The extra copies reduce throughput and raise CPU use. Some hardware allows devices themselves to join the trust boundary by authenticating and encrypting traffic to the guest, removing the bounce at the cost of trusting that device.",
    k: ["Bounce buffers with guest-side encryption vs trusted devices that read private memory: bouncing needs no device trust and costs copies; trusted devices are fast and extend the trusted base to hardware and its firmware.", "Small shared pool vs per-device pools: a pool is simpler and can be exhausted; per-device pools isolate failure and use more memory."],
    p: ["Plaintext is copied to the bounce buffer before encryption, exposing it for a moment.", "Pool exhaustion stalls I/O and looks to the application like a network or disk hang."],
    v: "Write a known string through the network and disk paths and capture traffic and host-visible pages. Confirm only ciphertext appears, and measure throughput against an unprotected guest.",
    dep: ["private-shared-pages", "dma-protection", "encrypted-guest-storage"]
  },
  "exception-routing": {
    s: "The rules for what happens to interrupts, faults and timer events that arrive while protected code runs, so that they reach the host without exposing protected state.",
    d: "When an event occurs inside, the hardware saves and scrubs protected state and exits to the host, which handles the event and then resumes. Some faults are redirected back into the protected code so it can handle its own exceptions after validating them. Interrupts targeted at the protected domain are delivered through a controlled path. The host sees when and how often exits happen, which leaks timing. Injection of fake events by the host is a risk, since protected code may assume an exception means what it normally means.",
    k: ["Host handles all interrupts vs protected code handles some: host handling is simple and leaks timing; internal handling hides it and needs trusted handler code.", "Mask interrupts inside critical sections vs allow always: masking prevents injected events at sensitive points and lets a stuck section block the system."],
    p: ["The host injects a spurious fault into a protected handler and drives it to an unexpected state.", "Timer interrupts at attacker-chosen cadence create a single-stepping capability."],
    v: "Inject a spurious exception from the host at every instruction boundary of a sample routine and confirm the protected code either rejects it or finishes with correct, unchanged results.",
    dep: ["secure-cpu-modes", "register-state-protection", "single-step-detection"]
  },
  "root-of-measurement": {
    s: "The first component that measures others and is itself trusted without measurement, usually hardware or immutable code, from which the whole chain of measurements descends.",
    d: "Something must be trusted before anything can be measured. This root, a security processor, microcode or boot ROM, hashes the next stage and writes the result to a register or log it controls. From there each stage hashes the next before running it. The root must be small and unchangeable, because a flaw in it invalidates every later claim. In confidential VM designs the root is the security processor; in enclave designs it is the instruction sequence that builds the region.",
    k: ["Static root of measurement vs dynamic launch: static starts at power-on and includes all firmware in the claim; dynamic restarts trust late and excludes earlier code but trusts the launch instructions.", "Hardware-only root vs firmware-based: hardware cannot be patched; firmware can be fixed and is a larger target."],
    p: ["The root measures a pointer to a configuration instead of the configuration, so contents change after measurement.", "An early stage skips measuring a component, leaving an unmeasured path to code execution."],
    v: "Boot a system, list the measurement log and recompute each hash from the stored components. Remove a component from the log and confirm the final register no longer matches.",
    dep: ["boot-rom", "hardware-root-of-trust", "measurement-registers"]
  },
  "launch-measurement": {
    s: "A cryptographic hash accumulated over everything loaded into a protected environment before it starts, fixing its initial code, data and configuration.",
    d: "As pages are added, each page's content, address and permissions are hashed into a running digest. For virtual machines the firmware, initial memory and some configuration are included. At finalize the digest is frozen. Attestation reports then state this value, and verifiers compare it to a known-good one. The measurement says what was loaded, not what the code does or that it is free of flaws. Anything omitted, such as the order of pages or a command line, becomes an unprotected input.",
    k: ["Include configuration and addresses in the hash vs only content: including them detects relocation and tampering and makes the hash sensitive to harmless layout changes.", "One digest vs separate digests per component: one is simple to verify; separate digests allow partial updates and increase verification logic."],
    p: ["Input data outside the measured region, such as a configuration file, alters behavior while the hash stays valid.", "Two different layouts hash identically because address or permissions were not included."],
    v: "Launch twice with identical content and confirm equal measurements, then change one page permission or one byte and confirm the value differs and a verifier rejects it.",
    dep: ["root-of-measurement", "measurement-registers", "enclave-lifecycle"]
  },
  "measurement-registers": {
    s: "Hardware-held registers that can only be extended, never overwritten, by combining their current value with the hash of new data.",
    d: "Extending computes new value = hash(old value || data digest), so the final value depends on every input and its order. Software cannot set a value directly; only the root or hardware can reset them, at boot or at creation of a protected domain. Several registers can be assigned to different purposes, such as firmware, kernel and application. Their values are included in signed reports. Because the register is a digest, reconstructing it requires the event log, and a verifier must replay the log to know what each extend represented.",
    k: ["Extend-only registers vs a signed log alone: registers give hardware-enforced append-only behavior; logs are flexible and rely on a signature chain and checking of all entries.", "Few registers vs many: few are simple and mix unrelated components; many separate policies and complicate reports."],
    p: ["An extend is skipped on an error path and the log claims a component that was never measured.", "The event log is trusted without replaying it against the register value."],
    v: "Replay the event log hash by hash and compare with the register in a signed report. Alter one log entry and confirm the replay no longer equals the signed value.",
    dep: ["root-of-measurement", "hardware-root-of-trust"]
  },
  "measured-boot-chain": {
    s: "A sequence in which each boot stage measures the next, from firmware through boot loader to kernel and configuration, before handing over control.",
    d: "The root measures firmware, firmware measures the boot loader and its configuration, the loader measures the kernel, initial disk and command line, and the kernel may measure applications. Each measurement extends a register and appends to an event log. A verifier later reads the log and compares values. Unlike secure boot, measured boot does not stop unknown code, it only records it. Differences between machines in firmware settings and boot order produce many valid measurement sets, which complicates reference values.",
    k: ["Measure and record vs verify and block: recording allows any software and leaves the decision to the verifier; blocking enforces a policy locally and fails unexpectedly during updates.", "Measure the command line and configuration vs only binaries: including them closes a major gap and makes values unstable."],
    p: ["Boot variables that change behavior, such as a kernel parameter, are not measured.", "A legitimate firmware update changes the measurement and breaks every sealed secret tied to it."],
    v: "Boot with a changed kernel command line and confirm the corresponding register differs from the baseline and the verifier flags it, while an unchanged boot reproduces every register.",
    dep: ["measurement-registers", "root-of-measurement", "platform-firmware"]
  },
  "signer-identity": {
    s: "A value derived from the public key that signed a protected image, letting different versions by the same author share an identity for sealing and policy.",
    d: "The signing structure carries the author's public key, and the hardware hashes it to produce a signer value reported in attestation and used in key derivation. Policy can say accept anything from this signer above this version. This makes upgrades practical without rebuilding every policy. It transfers trust from specific code to the signer's discipline: every image they sign is accepted, including any compromised or older one unless version rules block it.",
    k: ["Trust the signer vs trust the exact hash: signer trust eases updates and widens exposure to their entire release history; hash trust is exact and requires updating every policy for every release.", "Single signing key vs separate keys per product and environment: separate keys limit damage; a single key is simpler and a bigger prize."],
    p: ["A test build signed with the production key is accepted by production policies.", "The signer's key is rotated, and all sealed data tied to the old signer becomes inaccessible."],
    v: "Sign two different images with the same key and confirm identical signer values and different measurements. Sign with another key and confirm the signer value changes.",
    dep: ["enclave-signing", "hardware-root-of-trust"]
  },
  "launch-policy": {
    s: "A set of flags and limits set at creation, such as debug permission, migration permission and minimum firmware version, which the hardware enforces and reports.",
    d: "At creation, the owner supplies a policy word. The hardware refuses operations that the policy forbids, for instance debug access or migration, and includes the policy in the attestation report so verifiers can check it. A policy cannot be loosened after launch. Policies protect against the platform operator and against later mistakes, but only if they are strict and are actually checked by the verifier. A policy set but never inspected is documentation.",
    k: ["Immutable policy fixed at launch vs mutable policy: immutable is easy to trust and requires re-launch to change; mutable is flexible and needs authenticated updates.", "Few coarse flags vs fine-grained rules: coarse flags are easy to appraise; fine rules express more and are harder to get right."],
    p: ["Debug is left permitted by default in the launch tooling, and production workloads run with it enabled.", "Verifiers ignore the policy field, so strict launch settings protect nothing."],
    v: "Launch with migration forbidden and attempt a migration, confirming a hardware refusal. Then read the report and confirm the policy bits match what was requested.",
    dep: ["launch-measurement", "debug-lockout"]
  },
  "initial-state-injection": {
    s: "Placing data, such as a secret, a configuration or initial register values, into a protected environment during launch so it is covered by the measurement or encrypted to it.",
    d: "At creation the launcher may supply boot code, initial register contents and an optional blob encrypted to a key belonging to the security processor, which decrypts it into guest memory. This gives the guest a first secret without network access. Measured inputs are fixed, and secret inputs are not part of the measurement, so verification and secrecy are distinct. Size is limited. The launcher must be careful that the data it injects is exactly what the owner approved, since the host mediates the launch.",
    k: ["Inject secrets at launch vs deliver after attestation: launch injection needs no server and has size and rotation limits; later delivery is flexible and needs a trusted broker.", "Include injected configuration in the measurement vs leave out: including it makes configuration verifiable and means every change needs new reference values."],
    p: ["Injected secret is bound to the launch session but the owner's verification of the session is skipped.", "Configuration that selects behavior is injected unmeasured, and a malicious host changes it."],
    v: "Launch with an injected secret and confirm the guest can use it, while a host-side search of memory, launch logs and command line finds no plaintext.",
    dep: ["launch-measurement", "security-processor", "secret-provisioning"]
  },
  "runtime-measurement": {
    s: "Extending the recorded measurement after launch, for code or data loaded later, so that attestation also describes what has been added to a running protected environment.",
    d: "A running workload computes the hash of a new component, such as a plugin, model file or configuration, and extends a register or appends to a log through a hardware or firmware call. The next attestation report includes it. This covers the gap between launch and what actually runs. Unlike boot measurement it can occur at any time and in any order, so verifiers must interpret the log. The risk is that components are loaded without being measured, or measured after they have already executed.",
    k: ["Measure before use vs after: before use provides a meaningful claim; after is easier and records code that already ran.", "Fixed set of measured items vs arbitrary: fixed is simple to verify; arbitrary supports dynamic systems and requires a flexible verifier."],
    p: ["A loader maps and executes a plugin and only then extends the register, leaving a window of unmeasured execution.", "The log grows without bound or is truncated, and verifiers cannot replay it."],
    v: "Load a plugin, then fetch a new report and confirm the register changed and replaying the log with the plugin's hash reproduces it. Load an unmeasured plugin and confirm the verifier rejects the mismatch.",
    dep: ["measurement-registers", "remote-attestation"]
  },
  "local-attestation": {
    s: "Proof, between two protected environments on the same machine, of each other's identity, using a key only the hardware and the intended target can derive.",
    d: "One environment asks the hardware for a report targeted at another, authenticated with a key derivable only by that target. The target retrieves the key, verifies the report's MAC and learns the first one's measurement and signer. This lets cooperating components, such as an application and a quoting component, trust each other and set up a secure channel with no remote service. It proves co-residence on the same hardware, and says nothing to a remote party unless converted into a remote report.",
    k: ["Symmetric keys derived by hardware vs public-key signatures: symmetric is fast and works only on the same platform; signatures are verifiable anywhere and cost more.", "Local attestation between application and helper vs direct remote attestation: local lets a single service hold the attestation key; direct keeps the key out of other components."],
    p: ["The target is not checked against an expected measurement, and any enclave can obtain a session.", "A report intended for one target is accepted by another because the target field is not verified."],
    v: "Have enclave A produce a report for B and confirm B verifies it. Present the same report to enclave C and confirm verification fails because the key differs.",
    dep: ["hardware-key-derivation", "attestation-report", "isolation-instructions"]
  },
  "remote-attestation": {
    s: "Proof to a remote party that specific code is running in genuine protected hardware, by presenting a signed report that chains to the hardware vendor's certificates.",
    d: "A remote challenger sends a nonce. The protected code obtains a report from hardware, binds the nonce and a public key, and has it signed by an attestation key, either directly or via a quoting component. The challenger verifies the signature chain, the measurement, version numbers and policy. If acceptable, it trusts the key and sends secrets. Remote attestation proves the hardware and initial state, not ongoing behavior, and it says nothing about code flaws or data inputs.",
    k: ["Direct signing by hardware vs signing through a quoting component: direct has fewer parts; a quoting component can use group signatures and adds software to the trusted base.", "Attest at start vs periodically: start-only is cheap and cannot see later changes; periodic re-attestation detects revocation and costs load."],
    p: ["The relying party treats a successful attestation as proof the software is secure, rather than only that it is unmodified.", "Reports are accepted without checking nonce or key binding, enabling relay attacks."],
    v: "Run a challenger that verifies a report from a genuine platform and from a simulator or software emulation, and confirm only the genuine one chains to the vendor root.",
    dep: ["attestation-report", "attestation-key-hierarchy", "nonce-freshness", "report-data-binding"]
  },
  "attestation-report": {
    s: "A signed data structure listing the measurement, signer, version numbers, policy flags and caller-supplied data of a protected environment.",
    d: "Its fields typically include the launch measurement, signer or owner identity, the security versions of firmware and microcode, policy bits, a field of 32 to 64 bytes chosen by the requester, and a signature or MAC. Formats vary by design and can be wrapped in standard token encodings. Verifiers parse them, which makes the parser an attack surface. Consistency matters: if a field's meaning changes with a hardware revision, verifiers may misinterpret old and new reports.",
    k: ["Fixed binary format vs self-describing encoding: binary is compact and hard to extend; self-describing is flexible and enlarges parsers.", "Include full platform detail vs a minimal set: detail enables precise policy and risks privacy leaks through unique identifiers."],
    p: ["Parsers trust length fields in the report and read beyond the buffer.", "A new version adds a field that old verifiers ignore, so a weakened state passes unnoticed."],
    v: "Fetch a report, flip each byte in turn, and confirm the verifier rejects every modified copy. Parse a report from the previous hardware revision and confirm fields map correctly.",
    dep: ["attestation-key-hierarchy", "measurement-registers", "tcb-version", "launch-policy"]
  },
  "attestation-key-hierarchy": {
    s: "The chain of keys from a fused device secret, through a platform key and an attestation key, to the signature on a report, with certificates tying each level to the vendor.",
    d: "A device secret fused at manufacture is used to derive or protect a platform key. An attestation key, which can be derived with the security version as an input, signs reports. Certificates for it are issued by the vendor, indicating the chip and its version. Separate levels let keys be rotated or revoked without changing the root. Versions in the derivation mean that a firmware fix yields a new key, so keys from a vulnerable version stay separate. Exposing a long-lived unique key enables tracking, so some designs use group or rotating keys.",
    k: ["Per-device unique key vs shared group key: unique keys allow precise revocation and make devices trackable; group keys give anonymity and make one extracted key cover many devices.", "Key derived from version vs stored key: derived keys bind version cryptographically; stored keys are simpler to certify and update."],
    p: ["An attestation key extracted from one device is used to forge reports for devices that do not exist.", "Certificate retrieval from the vendor reveals which devices a customer operates."],
    v: "Verify a report's signature using only the public vendor root and the certificate chain provided. Update firmware and confirm the attestation certificate now shows the new security version.",
    dep: ["fused-device-keys", "tcb-version", "platform-endorsement", "security-processor"]
  },
  "quoting-component": {
    s: "A privileged helper that converts a local report into a remotely verifiable signed quote, holding the attestation key that ordinary protected code never sees.",
    d: "An application produces a local report targeted at the quoting component, which verifies it, checks it, and signs a quote with the attestation key (often a group key). The quote is sent to a verifier. This separates the high-value signing key from every application and avoids giving each one a unique key. It runs as a protected component itself, measured and signed by the vendor, and is updated with platform firmware. It is a single point whose compromise or unavailability affects all remote attestation on the machine.",
    k: ["Shared quoting component vs per-application keys: shared concentrates risk and avoids per-application provisioning; per-application is isolated and makes key distribution hard.", "Quoting in the platform's security processor vs in a protected user-space service: processor has a smaller base; service is easier to update and bigger."],
    p: ["The quoting service is down or out of date, and every attestation on the host fails.", "Its provisioning requires contacting a vendor service, blocking air-gapped deployments."],
    v: "Stop the quoting component and confirm applications get a clear failure from quote requests. Start it and confirm quotes verify against the vendor chain.",
    dep: ["local-attestation", "attestation-key-hierarchy", "anonymous-attestation"]
  },
  "anonymous-attestation": {
    s: "Group-based signatures that prove a device belongs to a set of genuine devices without revealing which one, protecting users from being tracked across services.",
    d: "Each device receives a private key from a group manager, usually the vendor, through a join protocol. Reports are signed so a verifier can check group membership and not identity. Optional linkability lets a verifier recognize repeated use by the same device within a context, for rate limiting. A revoked key can be listed so verifiers reject it. The cost is complexity and slower verification, and the difficulty of revoking a member when the signature hides which member signed.",
    k: ["Anonymous group signatures vs unique per-device certificates: group signatures protect privacy and complicate revocation; unique certificates are simple to revoke and enable tracking.", "Linkable vs unlinkable signatures: linkable allows abuse limits; unlinkable maximizes privacy."],
    p: ["A leaked group member key can sign reports indistinguishable from real ones until the verifier gets a revocation entry.", "Implementation errors in the signature scheme leak the member identity."],
    v: "Produce two quotes from one device, confirm both verify against the group public key, and confirm a verifier cannot tell they came from the same device unless linkability is enabled.",
    dep: ["quoting-component", "revocation-lists", "attestation-key-hierarchy"]
  },
  "platform-endorsement": {
    s: "Certificates issued by the hardware vendor stating that a particular key belongs to a genuine chip of a given model and security version.",
    d: "At manufacture or first boot, the vendor issues a certificate for the device's endorsement or attestation key, signed by an intermediate that identifies the product family and version. Verifiers fetch certificates from a vendor service or receive them with the evidence. The certificate carries the version numbers that appraisal checks. It is the link between a signature and the real world: anyone can create keys, so a signature without an endorsement proves nothing. The vendor becomes a mandatory participant and a source of availability risk.",
    k: ["Certificates delivered with evidence vs fetched by the verifier: bundled is self-contained and may be stale; fetched is current and makes the verifier depend on a service.", "Version in the certificate vs version in the report: certificate-bound versions are vendor-attested; report-bound versions are fresher and must be trusted from the hardware."],
    p: ["A verifier accepts any certificate chaining to the vendor, including those for non-attestation purposes.", "Certificates cannot be fetched in a restricted network and attestation fails."],
    v: "Fetch the endorsement certificate for a platform, verify it to the vendor root and confirm its version extension matches the version shown in a fresh report.",
    dep: ["fused-device-keys", "device-identity", "firmware-signing"]
  },
  "report-data-binding": {
    s: "Placing a hash of a public key or session value into the signed report, so the attestation is tied to a specific key or channel and cannot be reused elsewhere.",
    d: "The report format includes a field the requester fills. The protected code generates a key pair inside, hashes the public key into this field, and the verifier confirms the hash. Now the attested identity and the key are one fact: whoever holds the private key is the attested environment. The same field can bind a nonce, a certificate, or a transcript of a handshake. Without binding, attestation and communication are separate facts that an attacker can pair differently.",
    k: ["Bind the key hash vs bind the full handshake transcript: key hash is simple and proves identity; transcript binding also prevents relay and costs protocol design.", "Single field shared for nonce and key vs separate fields: sharing uses limited space and needs careful hashing; separate is clearer where space exists."],
    p: ["The field is filled with a value the host can choose, so the host supplies its own key hash.", "The verifier checks the signature but not the field's contents."],
    v: "Generate a report with one key's hash, then present a different public key with the same report and confirm the verifier rejects the mismatch.",
    dep: ["attestation-report", "nonce-freshness"]
  },
});
