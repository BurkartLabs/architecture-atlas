// Details part 5: root of trust, firmware and revocation, cross-cutting concerns.
ATLAS.details("trusted-execution", {
  "hardware-root-of-trust": {
    s: "The smallest set of silicon blocks and immutable code whose correct behavior is assumed rather than verified, and from which all later trust is derived.",
    d: "It typically comprises a boot ROM, fuse array, key derivation logic, a random number source and a way to lock configuration. It starts first, holds the device secrets, checks the signature of the first mutable code and records its measurement. Everything else, firmware, hypervisors and applications, is trusted only through a chain leading to it. Its flaws cannot be patched, so it is kept tiny and subjected to the most review, and masks are verified before manufacture.",
    k: ["Tiny immutable root vs updatable root: immutable cannot be attacked by a bad update and cannot be fixed; updatable is repairable and its update path becomes the most sensitive code.", "On-die root vs separate chip: on-die is hard to probe between components; separate is reusable across designs and exposes a bus."],
    p: ["A flaw in mask ROM code ships in every unit and can only be mitigated by later stages.", "Documentation of the root is thin, so integrators assume properties it does not provide."],
    v: "Boot a device and read the root's reported state and fuse lock bits. Attempt to boot an unsigned first-stage image and confirm the root refuses and records the failure.",
    dep: ["boot-rom", "fused-device-keys", "entropy-source"]
  },
  "fused-device-keys": {
    s: "Secrets burned into one-time-programmable fuses at manufacture, giving each chip a unique identity and a root secret that cannot be read out by software.",
    d: "The fuse array holds a device secret, public-key hashes of the vendor or owner, security version bits and lock settings. Only key derivation hardware can read the secret; software sees outputs of derivation, never the value. Fuses are one-way: bits can be blown and not restored, which makes them useful for anti-rollback counters. Programming happens in a controlled factory flow where the secret is generated on chip or injected, and any copy retained by the factory becomes a risk.",
    k: ["Secret generated on chip vs injected by the factory: on chip means nobody knows it and certificates need a proof of origin; injection simplifies provisioning and makes the factory a trust anchor.", "Many fuse bits for counters vs few: many allows more updates of version and wear out; few limits revocation granularity."],
    p: ["A factory logs or retains injected keys, and a breach gives an attacker device secrets.", "Fuse counters are exhausted by repeated version bumps on early products."],
    v: "Read fuse state through the status interface and confirm secrets are unreadable, only lock bits and version counters are reported, and that derivation outputs differ between two devices.",
    dep: ["hardware-root-of-trust", "device-identity"]
  },
  "security-processor": {
    s: "A small dedicated processor, with its own memory and firmware, that manages keys, launches protected domains and signs attestation reports on behalf of the main cores.",
    d: "It runs apart from the host processor, communicating through a mailbox. It generates domain keys, loads them into the memory controller, measures launches, enforces policy and holds the attestation key. Because it is isolated from host software, a flaw in the operating system does not reach it. Its firmware is signed, versioned and updatable, and is part of the reported security version. It is a single complex component with large authority, so its firmware bugs are among the most valuable to attackers.",
    k: ["Separate security processor vs microcode in the main core: separate gives isolation and a larger firmware to maintain; microcode reuses the core and shares its fate.", "Single firmware image vs modular: single is simple and bigger to patch; modular limits scope and adds loading logic."],
    p: ["A mailbox command parser has a memory flaw reachable by the host.", "Its firmware version is not reflected in attestation, and verifiers cannot tell a patched device from an old one."],
    v: "Send the mailbox malformed commands from the host and confirm error returns, then query its firmware version and confirm the same value appears in a signed attestation report.",
    dep: ["hardware-root-of-trust", "fused-device-keys", "entropy-source", "firmware-signing"]
  },
  "entropy-source": {
    s: "A hardware generator of unpredictable bits, conditioned and health-tested, that supplies keys, nonces and masks to every cryptographic operation above it.",
    d: "Physical noise such as thermal or jitter effects is sampled, tested continuously for stuck or degraded output, conditioned through a hash or cipher, and used to seed a deterministic generator. Protected code cannot rely on the host for randomness, because a host that supplies predictable values can break key generation. Entropy at first boot is a known weak point on devices that have no history. Health tests that fail must stop output and report, which can be abused for denial of service.",
    k: ["True hardware source plus deterministic generator vs hardware only: the combination is fast and tolerates a weak sample; hardware only is simple and slow.", "Fail closed on test failure vs continue: closed prevents weak keys and creates outages; continuing keeps service and silently produces bad keys."],
    p: ["Protected code seeds its generator from host-provided values and an attacker predicts its keys.", "Virtualized or restored snapshots reuse generator state, producing duplicate nonces."],
    v: "Collect many megabytes from the source, run a standard statistical test suite and the health tests, and confirm pass. Force a stuck source and confirm output stops with an error.",
    dep: ["hardware-root-of-trust"]
  },
  "device-identity": {
    s: "A unique, verifiable identity for each chip, rooted in fused secrets and certified by the manufacturer, which lets a remote party tell genuine hardware from a simulation.",
    d: "The identity is derived or stored at manufacture and linked to a certificate. Layered designs derive a new identity at each boot stage from the previous one plus the next stage's measurement, so the identity changes when firmware changes. Remote parties use it to prove the device exists and to bind secrets to it. The identity creates a tracking risk if it is exposed widely, so most designs hand out derived or group identities, and some servers refuse to reveal the raw one.",
    k: ["Stable identity vs identity that changes with firmware: stable is simple for fleet management; layered identities prove what runs and break when anything changes.", "Expose per-device identity vs only a model-level claim: per-device allows blocklisting and enables tracking."],
    p: ["Clones with copied software and a stolen certificate pass as the original device.", "The identity is logged by verifiers and used to track an owner across services."],
    v: "Derive the identity under two firmware versions and confirm they differ, then verify the certificate chain for the current one to the manufacturer root.",
    dep: ["fused-device-keys", "hardware-root-of-trust"]
  },
  "boot-rom": {
    s: "Code burned into the chip at manufacture that runs first after reset, initializes minimal hardware and verifies the next stage before running it.",
    d: "The ROM reads the first-stage image from flash, checks its signature with a public-key hash held in fuses, optionally decrypts it, measures it and jumps to it. It also locks configuration registers and decides whether to enter recovery or debug modes. It cannot be changed after manufacture, so mistakes persist. It parses data from external flash, which an attacker with write access can control, so parsing must be minimal and strict. Many real vulnerabilities in secure boot have come from this stage.",
    k: ["Verify a single image vs a chain of certificates: single is minimal and hard to rotate; chains support rotation and enlarge the ROM parser.", "Fall back to recovery mode on failure vs halt: recovery allows repair and a possible attack channel; halting is safe and bricks devices."],
    p: ["The ROM's image header parser trusts a length field and is overflowed from flash.", "A recovery mode accepts images over a serial link without authenticating them."],
    v: "Present first-stage images with a bad signature, a truncated header and a valid signature with an old version. Confirm the ROM accepts only the valid current one.",
    dep: ["fused-device-keys", "hardware-root-of-trust"]
  },
  "platform-firmware": {
    s: "The updatable low-level code that initializes memory, devices and the isolation hardware before the operating system, and whose version is part of what attestation reports.",
    d: "It sets up memory, programs controller registers including reserved ranges and key slots, hands off to the boot loader or hypervisor, and provides runtime services. Components of it, such as the security processor's firmware and microcode, are signed by the vendor and have their own versions. Because it configures the isolation hardware, a flaw or a wrong setting can silently disable protection. It is large and written by many parties, so it is the part of the trusted base with the worst track record.",
    k: ["Vendor-controlled closed firmware vs open firmware under owner control: closed has support and cannot be audited; open can be reviewed and the owner must keep it correct.", "Measure all firmware components vs only core: all gives a complete claim and many reference values; core is manageable and omits parts."],
    p: ["A setting that disables memory encryption ships as the default on some boards.", "An update changes measured values and breaks sealed secrets for the whole fleet."],
    v: "Dump the platform's reported firmware inventory and versions and compare against the vendor's list. Confirm isolation features are enabled by reading controller status registers.",
    dep: ["firmware-signing", "boot-rom", "reserved-memory-carveout"]
  },
  "microcode-update": {
    s: "A signed patch to the processor's internal instruction implementation, loaded early at boot or at runtime, used to fix flaws in isolation and security instructions.",
    d: "Parts of the processor's behavior are defined by updatable microcode. A patch is authenticated by hardware against a vendor key, applied to volatile storage, and lost at reset unless reloaded. It can fix bugs in security instructions, add mitigations and change reported security versions. Loading early, from firmware, ensures protected domains start under the fixed behavior. Runtime loading must be coordinated across cores. The difficulty is that a patch may reduce performance and may change what keys are derived.",
    k: ["Load from firmware at boot vs from the OS: firmware loading covers everything early and needs a reboot; OS loading is quick and starts some code on old behavior.", "Version bump for every security patch vs only major: every bump makes revocation precise and invalidates data tied to versions."],
    p: ["Microcode in firmware is stale and the OS patch is not trusted by the verifier, so the reported version is wrong.", "A patch changes key derivation and sealed data from before the update becomes unreadable."],
    v: "Read the microcode revision before and after update, confirm the attestation report shows the new security version, and confirm sealed data written before the update still opens as designed.",
    dep: ["tcb-version", "firmware-signing", "isolation-instructions"]
  },
  "tcb-version": {
    s: "A set of version numbers for each trusted component, reported in attestation, that lets a verifier tell whether a platform has the fixes for known flaws.",
    d: "Each component of the trusted base, such as boot code, security processor firmware, microcode and the quoting component, has a security version counter that increases only with security-relevant fixes. They appear in reports and are used as inputs to key derivation. Verifiers set minimums. Because versions are checked as numbers, they must be monotonic and never reset by an update. Granularity matters: a single combined number is simple and hides which part is old, while per-component numbers are precise.",
    k: ["Per-component versions vs one combined version: per-component lets verifiers reason about each fix; combined is simple and obscures where a platform is behind.", "Version in key derivation vs only in reports: derivation enforces it cryptographically; reports rely on verifier policy."],
    p: ["A verifier checks the quoted version against the minimum but never raises the minimum when fixes ship.", "Fix releases do not bump the security version, so patched and vulnerable parts look identical."],
    v: "Apply an update that bumps one component and confirm that component's number changes in a fresh report and a verifier configured with the new minimum accepts it, while the old one is rejected.",
    dep: ["platform-firmware", "microcode-update", "security-processor"]
  },
  "firmware-signing": {
    s: "The signing of firmware and microcode images by the vendor, with keys held in hardware security modules and verified by hardware at load.",
    d: "The vendor signs images with a key whose public hash is fused into the chip or in a chain from the ROM. The loader verifies signature, version and target hardware, and rejects anything else. Signing infrastructure uses offline keys, multi-person authorization and staged intermediates so that a leak of a lower key can be revoked without replacing the root. If a signing key is stolen, an attacker can produce updates that run with full privilege on every affected device, so protection of this process is as important as any technical feature.",
    k: ["Hierarchy of keys with intermediates vs single key: hierarchy limits damage and enables rotation; single is simple and catastrophic if leaked.", "Quantum-resistant signatures now vs later: now protects long-lived devices and costs larger signatures and code; later is cheaper and risks unpatchable devices."],
    p: ["A build server holds a signing key online and a breach signs malicious firmware.", "The device accepts images signed for a different product line."],
    v: "Attempt to load an image with one altered byte, one signed by a test key and one for another model. Confirm all three are rejected with distinct reasons.",
    dep: ["boot-rom", "fused-device-keys"]
  },
  "downgrade-protection": {
    s: "Hardware or firmware logic that refuses to install or run an older version of a trusted component once a newer security version has been seen.",
    d: "Without it, an attacker with write access flashes an old, vulnerable image that is still correctly signed. The platform stores a minimum acceptable version in fuses or protected non-volatile memory, increments it as fixes are applied, and rejects images below it. Because fuse counters are finite and permanent, vendors avoid bumping them for every release. Rollback also has legitimate uses, such as reverting a bad update, and the design must decide if that is possible at all.",
    k: ["Permanent fuse floor vs resettable counter in flash: fuses cannot be reset and run out; flash counters are plentiful and can be erased by an attacker with access.", "Block all rollback vs allow with authorization: blocking is strongest and risks bricking; authorized rollback helps recovery and creates a privileged path."],
    p: ["Version checks apply to firmware and not to the quoting component, so an old copy runs.", "A bad update with a bumped floor cannot be reverted and devices are stuck."],
    v: "Install a newer image, then attempt to flash the previous signed image and confirm refusal. Check that the stored minimum version equals the newer image's.",
    dep: ["tcb-version", "fused-device-keys", "firmware-signing"]
  },
  "revocation-lists": {
    s: "Signed lists of keys, certificates or versions that verifiers must stop trusting, distributed to every party that checks attestation.",
    d: "When a key is compromised or a version is found vulnerable, the vendor publishes an updated list. Verifiers fetch it regularly and reject evidence that matches. Lists have issue times and expiry so stale ones can be detected. With group signatures, lists name individual member keys or signatures. Their usefulness depends on distribution: a verifier that does not update continues to accept bad evidence, and one that requires a fresh list becomes unavailable if the publisher is.",
    k: ["Short-lived lists with required refresh vs long-lived: short lists limit exposure and create an availability dependency; long lists are tolerant and slow to take effect.", "Revoke by key vs by version: key revocation is precise and requires identifying keys; version revocation covers all units at once and affects healthy ones."],
    p: ["Verifiers cache the list indefinitely and keep accepting revoked platforms.", "A list grows large and slows verification at scale."],
    v: "Publish a revocation for a test platform key and measure the time until all verifiers reject its evidence. Confirm the platform is accepted before and rejected after.",
    dep: ["firmware-signing", "endorsement-chain-validation"]
  },
  "platform-revocation": {
    s: "The process of declaring a specific platform, a model or a firmware version untrustworthy after a compromise, so that verifiers stop releasing secrets to it.",
    d: "A discovered flaw, such as an extracted key or a bypassable check, means that evidence from affected platforms may be forged. The vendor decides the scope, publishes revocation entries, raises minimum versions and supplies fixes. Verifiers apply the new policy. Owners must patch quickly, since revoked platforms stop working for sensitive workloads. Policy must cover a gray period: platforms that are vulnerable but not yet known compromised. The business problem is that revocation causes outages for honest customers.",
    k: ["Revoke immediately vs allow a grace period: immediate protects secrets and breaks customers; a grace period keeps service and leaves a known window.", "Revoke the whole model vs only extracted keys: model-wide is safe and disruptive; narrow is precise and requires knowing which keys leaked."],
    p: ["Revocation is announced, but relying parties have no process to apply it for weeks.", "A single extracted key is used to attest virtual machines on emulated hardware until it is listed."],
    v: "Simulate a compromised key in a test environment: revoke it, then confirm that new secret release requests are denied while previously healthy platforms continue to be accepted.",
    dep: ["revocation-lists", "tcb-version", "evidence-appraisal"]
  },
  "attestation-key-rotation": {
    s: "Replacing the keys that sign attestation reports on a schedule or after a flaw, so that a single extracted key has a bounded useful life.",
    d: "Because the attestation key can be derived from the security version, a firmware update implicitly rotates it. Explicit rotation issues new certificates and retires old keys. Verifiers accept overlapping validity windows to avoid outages. Long-lived keys are attractive targets, and rotation limits damage, but frequent changes complicate caching and pinned certificates. Group schemes must reissue member credentials, which needs the platform to contact the issuer.",
    k: ["Frequent rotation vs long-lived keys: frequent bounds the damage of extraction and demands live issuer access; long-lived keys work offline and are more valuable to steal.", "Version-derived keys vs explicitly rotated: derived rotate automatically with fixes; explicit lets the vendor rotate without any update."],
    p: ["Pinned certificates in verifiers are not updated, and attestation fails the day after a rotation.", "Rotation relies on contacting the issuer, which is impossible in isolated networks."],
    v: "Trigger a rotation, then confirm reports signed with the new key verify, those with the old key verify during overlap and fail after the old key's expiry.",
    dep: ["attestation-key-hierarchy", "platform-endorsement", "tcb-version"]
  },
  "tcb-recovery": {
    s: "The procedure of bringing a platform with a known flaw back to a trusted state by updating firmware, rotating keys and re-establishing attested identity.",
    d: "After a flaw, owners apply fixed firmware and microcode, which raises the security version and changes derived keys. The platform then obtains new attestation certificates and workloads re-attest. Data sealed under the old version may need migration, done before the update with a key broker or sealed to a version both can derive. Recovery has to be quick and testable in advance, because during the gap the platform cannot run sensitive workloads. It is also the point where mistakes cause permanent data loss.",
    k: ["Rolling updates with migration of sealed data vs reprovisioning from scratch: migration preserves state and takes careful steps; reprovisioning is simple and loses state.", "Automatic recovery vs manual: automatic is fast and can fail at scale; manual is slow and controlled."],
    p: ["Data sealed to the old version is not migrated before the update and is lost.", "Recovered platforms are accepted by verifiers before their new certificates are checked."],
    v: "Run a recovery drill on a test machine from a revoked state: update, re-attest and confirm a verifier accepts it again and migrated data is readable.",
    dep: ["tcb-version", "platform-revocation", "migration-and-backup-keys", "microcode-update"]
  },
  "threat-model": {
    s: "The statement of which attackers the design defends against, such as a malicious operating system or operator, and which it does not, such as a physical attacker or a flaw in the protected code.",
    d: "Everything above depends on it: a model that excludes physical access justifies cheaper memory protection, one that includes malicious operators requires attestation and integrity. It says which side channels count. Written down, it tells integrators where the guarantees stop. In practice most disappointments come from using a design against an attacker it was never built for, such as expecting protection from timing attacks or from bugs in the guest.",
    k: ["Strong model (malicious host, physical access) vs narrow model (malicious host software only): strong needs integrity, replay protection and cost; narrow is cheaper and unsafe in untrusted facilities.", "State exclusions explicitly vs imply them: explicit exclusions prevent misuse and read as weakness in marketing."],
    p: ["Teams assume the protection covers side channels, which the model excludes.", "The model is written for the hardware and ignores the guest software, which is outside the vendor's guarantee."],
    v: "Map each documented attacker capability to the specific component that stops it, and for each exclusion confirm a compensating control or a recorded decision to accept the risk.",
    dep: []
  },
  "tcb-size": {
    s: "The amount of code and hardware that must be correct for the guarantees to hold, which sets the audit effort and the likelihood of a flaw undermining the system.",
    d: "Each design places the line differently: enclaves include a small library, confidential VMs include a guest kernel, and secure worlds include a monitor and secure OS. Larger bases make adoption easier and enlarge the attack surface and review cost. Both the line and its drift matter: services accumulate inside the boundary to avoid costly crossings. Reducing it means moving functions outside and treating their results as untrusted, which complicates the code that remains.",
    k: ["Minimal base with outside services treated as hostile vs fuller base with services inside: minimal is auditable and awkward to program; fuller is productive and holds more bugs that matter.", "Formally verify the smallest parts vs test broadly: verification gives strong evidence for small code and is expensive; testing scales and leaves gaps."],
    p: ["Convenience features accumulate inside the boundary until it contains a network stack.", "The size is measured in lines and ignores hardware and firmware components."],
    v: "Count the code and firmware components inside the boundary for each release, compare to the previous release, and require a recorded justification for any growth.",
    dep: []
  },
  "vendor-trust": {
    s: "The fact that every attestation finally rests on keys and certificates issued by the hardware vendor, so the vendor's honesty and key security are part of every design.",
    d: "Verifiers trust vendor roots, vendor firmware and vendor statements about hardware correctness. A compromised or coerced vendor could issue certificates for fake platforms or ship flawed silicon. Mitigations are limited: transparency logs for certificates, multiple independent vendors across a deployment, owner-controlled firmware where available, and open specifications. It is a trust that cannot be removed, only spread or documented, and users who cannot accept it should not use these systems.",
    k: ["Single vendor root vs multi-vendor verification: single is simple and concentrates trust; multiple vendors need a verifier supporting several formats and limit dependence on any one.", "Vendor-run verification service vs owner-run: vendor-run is convenient and reveals usage; owner-run keeps privacy and demands operation."],
    p: ["Every workload's availability depends on a vendor service that is down or has changed its terms.", "The verifier trusts a vendor root without any transparency or revocation process."],
    v: "List every vendor key and service the verification path depends on, and test attestation with each service unreachable to learn which cases fail closed and which fail open.",
    dep: []
  },
  "host-availability-control": {
    s: "The residual power the untrusted host keeps even when it cannot read data: it can refuse to schedule, starve memory, drop messages, reorder calls and shut the workload down.",
    d: "Confidentiality and integrity are enforced by hardware, while availability is not, because the host owns CPUs, memory and devices. It can delay a protected thread, evict pages, tamper with I/O ordering or stop the machine. Protocols must therefore be safe when messages are delayed and replayed, and applications cannot assume that fairness exists. Replication across independent hosts and timeouts handle failure. Many subtle attacks exploit this control, such as scheduling threads in a chosen order to expose a race.",
    k: ["Replicate across independent hosts vs rely on one host's good behavior: replication keeps availability and costs resources and coordination; a single host is simple and can be starved at will.", "Make operations idempotent and ordered vs assume host order: idempotency tolerates reordering and replay and takes design effort; assuming order is easy and exploitable."],
    p: ["A lock inside protected code depends on the host scheduling the holder, and the host deadlocks the system.", "State updates assume calls arrive once and in order, and the host replays or reorders them."],
    v: "Run the workload under a host that delays, reorders, duplicates and drops every call, and confirm results stay correct or the workload stops safely without exposing data.",
    dep: []
  },
  "performance-overhead": {
    s: "The cost of protection in extra cycles, memory and latency from encryption, integrity metadata, world switches, copying and paging, which constrains where it is practical to use.",
    d: "Memory encryption adds small latency, integrity trees add memory and accesses, each boundary crossing costs thousands of cycles, copies through bounce buffers consume bandwidth, and limited protected memory causes paging. Workloads with frequent calls, large working sets or heavy I/O suffer the most. Some costs can be amortized by batching, shared-memory queues and larger protected regions. Designs are judged against how much of the original performance remains for the workload, not by microbenchmarks.",
    k: ["Batch crossings and use asynchronous queues vs simple synchronous calls: batching recovers speed and complicates code and validation; synchronous is simple and slow.", "Protect the whole workload vs only the sensitive core: whole-workload is easy and pays everywhere; a small core is fast and needs careful partitioning."],
    p: ["A benchmark of compute-bound code is used to justify a deployment that is actually I/O-bound.", "Working set exceeds the protected pool and paging dominates runtime."],
    v: "Run the real workload with protection on and off on the same hardware and report throughput and tail latency for both, with profiles showing the share spent in crossings and paging.",
    dep: []
  },
  "observability-vs-secrecy": {
    s: "The tension between operating, debugging and auditing a system and keeping its data hidden: every log, metric, dump and trace is a possible leak.",
    d: "Operators need logs, crash dumps, profiles and monitoring; protected workloads must not hand these to the host in plaintext. Choices include encrypting logs to the owner, emitting only aggregate metrics, forbidding dumps, and giving the owner a debug build. Debug modes disable protection, which attestation reveals. Without visibility, production failures become hard to diagnose, and with too much, the protection is empty. The balance is chosen per environment and per data class, and has to be decided before an incident.",
    k: ["Encrypted logs to the owner vs host-readable logs: encrypted logs protect secrets and need key handling and tooling; plain logs are easy and leak.", "Allow debug in production vs build-time separation: allowing it speeds repair and weakens the guarantee; separation keeps the guarantee and slows fixes."],
    p: ["A crash handler writes registers and stack to a host-visible file.", "Metrics with fine granularity, such as request sizes, reveal secret-dependent behavior."],
    v: "Trigger a crash and a heavy request path in a production-configured workload, then inspect everything the host can read, including dumps, logs and metrics, for secrets or secret-dependent patterns.",
    dep: []
  },
});
