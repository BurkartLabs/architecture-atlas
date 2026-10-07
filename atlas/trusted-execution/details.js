// Details for the trusted execution plate, part 1: development, confidential workloads, attestation verification.
ATLAS.details("trusted-execution", {
  "trust-partitioning": {
    s: "The design step of deciding which code and data live inside the protected environment and which stay outside, with the goal of keeping the protected part as small as possible.",
    d: "An application is split along the data it must protect: key handling, model weights or a decision rule go inside; networking, storage and user interface stay outside. Every function placed inside enlarges the attack surface and the trusted computing base, and every function placed outside must be treated as run by the adversary. The split also fixes the interface, so data crossing it is either encrypted, validated or deliberately public. The difficulty is that a clean cut rarely matches the existing code structure, and secrets leak through the interface's shape.",
    k: ["Few large trusted components vs many small ones: fewer crossings and less marshalling, but a bigger audit surface and a larger blast radius per bug.", "Partition an existing application vs run it unmodified in a confidential guest: partitioning gives a tiny trusted base but costs rewriting; the whole-guest route is easy but trusts the entire guest software stack."],
    p: ["Code is moved inside for convenience until the protected part contains a parser and a network stack, and the isolation guarantees mean little.", "Outside code is trusted to return correct values, such as file contents or time, and an adversarial host feeds the enclave crafted answers."],
    v: "List every function reachable from outside and every outside call the protected code makes, and show each has a stated threat assumption. A fuzzer driving only the boundary should find no memory fault inside.",
    dep: ["interface-definition", "tcb-boundary"]
  },
  "interface-definition": {
    s: "A declarative description of every call that crosses the trust boundary, from which the toolchain generates the stubs and checks on both sides.",
    d: "Each entry names a function, its direction (into or out of the protected code), and the type, size and ownership of every argument, including which pointers refer to inside or outside memory. A generator emits proxy and bridge code that copies buffers across, validates lengths, and rejects pointers that point into the wrong region. Having one machine-readable source keeps both sides consistent. The hard part is expressing real data structures: nested pointers, variable-length arrays and callbacks need rules a generator can enforce without guessing.",
    k: ["Generated marshalling vs hand-written glue: generation applies the same checks everywhere, but a generator bug or an unsupported type silently becomes a vulnerability shared by every user.", "Deep copy of arguments vs passing pointers to shared memory: copying prevents the host changing data after validation; sharing avoids the cost for large buffers."],
    p: ["A length field read twice, once for validation and once for use, lets the host change it in between.", "An output pointer that is not checked to lie outside the protected region makes the enclave overwrite its own memory."],
    v: "Generate stubs from a definition containing an out-pointer aimed at protected memory and confirm the bridge rejects the call before any copy, with the rejection visible in a trace.",
    dep: ["trust-partitioning"]
  },
  "enclave-sdk": {
    s: "The libraries and runtime linked into the trusted part that provide entry points, thread setup, crypto, sealing and attestation calls, plus the host-side loader.",
    d: "On the trusted side it supplies the entry stub that the hardware jumps to, a heap, thread-local storage, exception handling, random numbers and wrappers over the sealing and report instructions. On the host side it creates the protected region, loads and measures the image, and dispatches calls. It must run with no operating system underneath, so anything normally taken from the kernel is either provided here, forwarded outward, or missing. The challenge is keeping the runtime small enough to audit while offering enough that developers do not reinvent it badly.",
    k: ["A thin SDK that exposes hardware primitives vs a broad runtime with familiar APIs: thin is auditable but pushes work to developers; broad is convenient but expands what must be trusted.", "Static linking of everything into one signed image vs dynamically loaded modules: static gives one measurement to verify, dynamic gives flexibility but moves loading logic into the trusted base."],
    p: ["The runtime's heap allocator reuses freed memory without clearing it, leaving secrets for later calls.", "Exception handlers run with attacker-influenced state and re-enter the enclave in an inconsistent context."],
    v: "Build a sample that seals a value, restarts the process, unseals it and prints a report. Confirm the loader log shows the measured image hash matching the signing tool's output.",
    dep: ["enclave-signing", "enclave-calls", "minimal-trusted-libc"]
  },
  "minimal-trusted-libc": {
    s: "A reduced standard C library for protected code that implements memory and string functions inside and forwards or refuses anything needing the operating system.",
    d: "Memory copy, string handling, math and allocation are implemented inside the boundary. Functions that need files, sockets or time either route through a checked outward call or are removed. Keeping the surface small matters because each linked function is code that holds secrets and could contain a flaw. The library also hardens common failure points, for example by checking that pointers passed to copy routines are entirely inside or entirely outside the protected region. Compatibility with existing code is the pressure pushing against minimalism.",
    k: ["Remove OS-dependent functions vs forward them through the host: removal keeps secrets safe but breaks ported code; forwarding works but trusts the host's answers.", "Own allocator inside the boundary vs allocating from host memory: inside is private and fast, but fixed enclave size limits the heap."],
    p: ["Time and random functions are forwarded outward, so an adversary controls timestamps and the supposedly random values.", "A copy routine that allows overlap between inside and outside regions turns a bounds bug into disclosure."],
    v: "Link a program that calls a removed function and confirm the build fails, then call a forwarded one and confirm the trace shows the outward call with checked arguments.",
    dep: ["enclave-calls"]
  },
  "library-os": {
    s: "A shim that lets unmodified programs run inside the protected environment by implementing the operating system's system call interface in user space within the boundary.",
    d: "Instead of porting an application, a library OS provides a file system layer, a process and threading model, signals and network sockets, and translates them to a small set of host calls. Files can be encrypted and integrity-checked inside, so the host only sees ciphertext. This moves the partitioning decision from the developer to the library, at the price of a larger trusted base and a manifest listing which files, environment and arguments are allowed. Performance suffers from every forwarded call leaving the boundary.",
    k: ["Run unmodified binaries vs port to a small SDK: lift-and-shift is quick and supports legacy code, but the trusted base becomes the application plus the library and its interpreter.", "Encrypted file layer inside vs trusting host files: encryption protects contents but leaks sizes, names and access patterns, and needs key management."],
    p: ["A manifest that allows an entire directory of host files silently makes those files trusted input.", "Multi-process emulation shares state through untrusted memory and exposes it to tampering."],
    v: "Run an unmodified server binary and verify with a host-side packet and file capture that no plaintext secrets appear, while the manifest hash appears in the attestation report.",
    dep: ["syscall-proxy", "minimal-trusted-libc", "enclave-signing"]
  },
  "enclave-signing": {
    s: "The build step that hashes the trusted image, attaches its configuration and the author's signature, and produces the file the hardware will check at load.",
    d: "The tool computes the expected measurement by replaying the same load process the hardware will perform, records attributes such as debug permission, thread count and memory size, and signs the structure with the author's key. At load, the hardware or firmware verifies the signature and derives a signer identity from the public key. This identity lets sealed data be shared between versions by the same author. It is hard because the signing key becomes a high-value secret: whoever holds it can produce images that the hardware accepts as that author's.",
    k: ["Key held in an offline hardware module vs in the build server: offline is safe but slows releases; online is convenient but a compromised pipeline signs arbitrary code.", "Policy tied to the signer vs tied to exact measurement: signer-based allows upgrades, while measurement-based gives the strongest binding but breaks sealed data on every rebuild."],
    p: ["A reproducibility gap means the signed build cannot be recreated from source, so reviewers cannot verify what was measured.", "Test signing keys leak into production images and are accepted as release identities."],
    v: "Rebuild from the tagged source on a clean machine and compare the measurement printed by the signing tool with the one in a live attestation report. They must match byte for byte.",
    dep: ["launch-measurement", "signer-identity"]
  },
  "debug-enclaves": {
    s: "Special launch modes and tools that let developers inspect protected code, deliberately turning off confidentiality so a debugger can read memory.",
    d: "A debug attribute in the signed image tells the hardware to permit reading and writing of protected memory through a privileged debug instruction. Development tools use it to set breakpoints and examine state. Because the attribute is part of the attested identity, a verifier can see that a debug image is running and refuse it. Production images must have the attribute cleared. The difficulty is workflow: developers need real behavior, and production-only bugs cannot be reproduced under debug mode because timings and memory layout differ.",
    k: ["A debug flag in the measured identity vs a separate debug key: reported flag lets verifiers refuse it reliably; a hidden mode would let attackers silently enable inspection.", "Full debugging vs restricted tracing: full access finds bugs fast; tracing preserves secrecy but gives less insight."],
    p: ["A debug-mode image is promoted to production because the verifier policy never checks the attribute.", "Crash dumps from production contain secrets because they are written as plaintext by the host."],
    v: "Launch a debug image, read its memory with the debugger, then check that a verifier with a production policy rejects its report on the debug attribute alone.",
    dep: ["debug-lockout", "launch-policy"]
  },
  "confidential-vm-image": {
    s: "A guest operating system image prepared to run inside an encrypted virtual machine, with measured firmware, a verified kernel and no assumption that the host is honest.",
    d: "The image bundles virtual firmware, a boot loader, kernel and initial disk, all of whose hashes feed the launch measurement. Drivers are configured to treat all host-provided devices as untrusted, to use bounce buffers for I/O, and to validate everything read from shared memory. Disk and network traffic must be encrypted by the guest itself. The challenge is that a general-purpose OS assumes a trustworthy hypervisor, so every paravirtual driver becomes an attack surface that must be reviewed or disabled.",
    k: ["Hardened minimal guest vs stock distribution kernel: minimal has less to trust but needs maintenance; stock supports more workloads and inherits a large device driver surface.", "Measure the whole image vs measure only firmware and verify the rest later: whole-image measurement is simple to verify but changes with every patch."],
    p: ["The guest accepts host-supplied device configuration without validation and an attacker redirects interrupts or memory ranges.", "An unmeasured initial RAM disk allows the host to inject code ahead of the verified kernel."],
    v: "Boot the image, fetch its attestation report and confirm the measurement equals the hash of firmware, kernel, command line and initial disk computed offline from the build outputs.",
    dep: ["confidential-vm", "launch-measurement", "bounce-buffer-io"]
  },
  "confidential-container-runtime": {
    s: "A container runtime that starts each pod or container inside its own confidential virtual machine, so the cluster operator and host kernel cannot read its memory.",
    d: "The orchestrator asks for a container as usual, but the runtime creates a lightweight guest VM, boots a minimal guest kernel and starts an agent inside, which then pulls and runs the container image within the guest. The host sees only an encrypted VM and network traffic. Operators lose some conveniences, since host-side logs, exec and port forwarding must be mediated by the agent. Hard problems are startup latency, image pulling inside the guest, and keeping orchestration APIs from becoming a covert path to the workload.",
    k: ["One VM per pod vs one shared VM per node: per-pod gives strong isolation between tenants but costs memory and start time; shared is cheaper but mixes workloads inside one trust domain.", "Pull images in the guest vs on the host: guest pulling hides the contents but needs guest networking; host pulling is fast but exposes images."],
    p: ["Orchestrator exec and log APIs remain enabled and let the cluster operator read workload output.", "Resource limits applied on the host are ignored inside the guest, causing hangs that look like attacks."],
    v: "Start a container that holds a known secret, dump host memory of the VM process, and confirm the secret string is absent while the container serves requests normally.",
    dep: ["confidential-vm", "guest-agent", "encrypted-image-layers", "workload-policy"]
  },
  "encrypted-image-layers": {
    s: "Container or VM image content stored encrypted in a registry so that only an attested guest can decrypt and run it.",
    d: "Each layer is encrypted with a content key, and the key is wrapped for a key broker rather than for any host. At pull time the guest agent proves its identity to the broker, receives the unwrapped key, and decrypts layers into guest memory or encrypted storage. Registries and hosts can store and distribute the image without learning its contents. The work is in tying key release to a specific measurement and in handling layer deduplication, which conflicts with per-image encryption.",
    k: ["Encrypt layers vs encrypt only the final filesystem: layer encryption fits existing registries and caches, but defeats deduplication across images.", "Per-image keys vs per-tenant keys: per-image limits damage from one leak but multiplies the keys the broker must manage."],
    p: ["Image signing is skipped, so the guest decrypts a validly encrypted but attacker-chosen image.", "Keys are released to any guest that attests under a loose policy, making encryption cosmetic."],
    v: "Pull the image on an unattested host and confirm decryption fails. Pull it in an attested guest and confirm the broker log shows one release tied to the expected measurement.",
    dep: ["key-broker", "attested-tls", "guest-agent"]
  },
  "guest-agent": {
    s: "A small trusted process inside the confidential guest that talks to the host-side runtime, performs attestation and enforces which operations the host may request.",
    d: "The agent is the guest's front door: it receives requests to start, stop or inspect containers, fetches secrets after attestation, mounts storage and relays selected output. Since the host controls the channel, the agent treats every request as untrusted and checks it against a policy measured at launch. It is part of the trusted base, so size and parsing code matter. Typical difficulty is deciding which management operations are safe, since logs, exec and metrics each expose workload data.",
    k: ["Strict allow-list of host requests vs full management API: allow-list limits leakage but breaks tooling; a full API is convenient and quietly lets the operator read everything.", "Agent in the guest kernel image vs separate process: image inclusion is measured automatically; a separate process is easier to update but must be measured explicitly."],
    p: ["The request parser has memory-safety flaws reachable by the host, giving it code execution inside the guest.", "The agent accepts a replaced policy after boot because policy is not tied to the measurement."],
    v: "Send the agent a forbidden exec request from the host and confirm it is refused and logged, while a permitted start request succeeds and appears in the measured policy.",
    dep: ["workload-policy", "guest-host-interface", "remote-attestation"]
  },
  "workload-policy": {
    s: "A signed or measured document that states which images, commands, mounts and host operations a confidential workload may use, enforced inside the guest.",
    d: "Policy lists allowed image digests, entry commands, environment variables, volume mounts and whether exec, log or port-forward calls are allowed. It is hashed into the launch measurement or the attestation report so a verifier can see exactly which rules apply. The guest agent denies anything outside it. Writing a policy tight enough to matter but loose enough for real deployments is difficult, and generated policies tend to grow permissive over time as teams hit denials.",
    k: ["Policy bound into the measurement vs delivered at runtime: binding makes verification simple but forces re-measure on every change; runtime delivery is flexible and needs a separate signature check.", "Allow-list vs deny-list: allow-list fails closed on unexpected requests, at the cost of constant maintenance."],
    p: ["A wildcard in the command list lets any binary in the image run, defeating the point of the policy.", "Policy changes are approved by the same operator the policy is meant to constrain."],
    v: "Change one allowed image digest, rebuild the policy, and confirm the measurement in the attestation report changes and the old digest no longer starts.",
    dep: ["launch-measurement", "evidence-appraisal"]
  },
  "encrypted-guest-storage": {
    s: "Disk or volume content encrypted and integrity-protected by the guest, with its key obtained only after attestation, so the host stores ciphertext it cannot read or silently alter.",
    d: "The guest performs block or file encryption below its file system, using a key received from a broker or derived from a sealed value. Integrity metadata or authenticated encryption detects tampering and sometimes replay. The host supplies only raw blocks. Costs include the extra metadata space, write amplification, and the need to resist rollback, where the host serves an old but validly authenticated disk image. First-boot key setup is its own sensitive step.",
    k: ["Authenticated encryption per block vs plain encryption plus a Merkle tree: per block is simple but cannot detect rollback; a tree detects it but adds write cost and a root to store safely.", "Key from broker vs key sealed to hardware: broker allows migration and recovery, sealing avoids a network dependency but ties data to one machine."],
    p: ["The host replaces the disk with an earlier snapshot and the guest accepts it as valid.", "The unlock key is placed on a host-readable file or in kernel command-line text visible to the hypervisor."],
    v: "Copy the disk image to another host and attempt to mount it: it must fail. Restore an older snapshot onto the original host and confirm the guest detects the rollback.",
    dep: ["key-broker", "rollback-protection", "hardware-key-derivation"]
  },
  "attested-tls": {
    s: "A secure channel whose handshake carries attestation evidence, so the peer learns not just a name but which code is on the other end.",
    d: "The workload generates a key pair inside the protected environment, asks for an attestation report that includes a hash of the public key, and presents it in the certificate or handshake extension. The client verifies the report through a verifier and checks the key hash before trusting the session. This makes the channel terminate inside the boundary and removes any trusted load balancer or proxy. Hard parts are certificate renewal inside the boundary, caching verification results, and keeping the evidence fresh.",
    k: ["Evidence in the handshake vs checking attestation out of band first: in-handshake is atomic with the connection; out of band keeps standard libraries unchanged but allows time-of-check gaps.", "Terminate at the workload vs at an ingress: workload termination keeps plaintext inside, but loses standard routing and inspection."],
    p: ["The report is not bound to the key, so a valid report is replayed with an attacker's certificate.", "Long-lived certificates outlive the platform's security version and keep being accepted after revocation."],
    v: "Connect with a client, extract the certificate, and confirm the embedded report data equals the hash of the presented public key and the verifier accepts the report.",
    dep: ["report-data-binding", "verifier-service", "remote-attestation"]
  },
  "verifier-service": {
    s: "A service that receives attestation evidence, checks its signatures and contents against policy, and returns a signed verdict that others can rely on.",
    d: "It parses the evidence format, validates the certificate chain back to a hardware vendor anchor, confirms freshness, compares measurements and version numbers against reference values, and runs the appraisal policy. The result is an attestation token with claims about the workload. Running a verifier separates the cryptography from relying parties, which then need only trust its signature. It becomes critical infrastructure: if it is down, no secrets are released, and if it is wrong, every decision downstream is wrong.",
    k: ["Central verifier vs verification library in each relying party: central eases policy management and caching; embedded avoids a new trust and availability dependency.", "Verifier run by the platform vendor vs by the workload owner: vendor-run is convenient but the vendor sees all attestations; owner-run keeps control at the cost of operating it."],
    p: ["The verifier caches vendor certificates and keeps accepting them after the vendor has revoked them.", "A policy bug accepts any measurement because empty reference sets are treated as a match."],
    v: "Submit evidence from a known-good workload, from a modified image and from a replayed old report. Confirm the verdicts are accept, reject on measurement and reject on freshness, respectively.",
    dep: ["evidence-appraisal", "endorsement-chain-validation", "reference-values", "nonce-freshness", "attestation-token"]
  },
  "evidence-appraisal": {
    s: "The policy logic that decides whether specific claims in the evidence, such as measurement, security version and debug state, are acceptable for a particular use.",
    d: "Appraisal turns raw evidence into claims and tests each against a rule set: expected measurement, minimum version numbers, debug off, allowed signer, required features. Different relying parties apply different policies to the same evidence. Rules are written in a declarative language so they can be reviewed and audited. The difficulty is staying correct as the platform changes: new fields, new vendor semantics and partial-trust states such as an out-of-date but not revoked version need explicit decisions.",
    k: ["Strict equality on measurements vs allow-lists of several good values: strict is simplest and breaks on every legitimate update; allow-lists are practical but require disciplined removal of old entries.", "Hard reject vs graded results: reject is easy to enforce; graded results let low-risk uses proceed on slightly out-of-date platforms."],
    p: ["Policy checks a field's presence but not its value, so a zero or default is accepted.", "Appraisal ignores unrecognized claims, letting a new weakening flag pass unnoticed."],
    v: "Feed the same evidence to two policies, one demanding the latest security version and one allowing the previous, and confirm they reach different verdicts with the reason shown.",
    dep: ["reference-values", "tcb-version", "launch-policy"]
  },
  "reference-values": {
    s: "The trusted set of expected measurements and versions, produced by builds and vendors, against which evidence is compared.",
    d: "Software authors publish the measurement of each release, ideally with provenance statements showing how it was built. Hardware vendors publish minimum firmware versions and endorsement material. A reference store collects these, signs them, and serves them to verifiers with validity periods. The difficulty is provenance: a measurement alone says nothing about whether the build was honest, so reproducible builds and signed supply-chain records are needed to make the value mean something.",
    k: ["Reference values pushed by the software author vs derived by the relying party from source: author-pushed is easy, but the relying party trusts the author's build; derivation is independent but expensive.", "Short validity windows vs long ones: short windows limit use of known-bad releases but add operational churn."],
    p: ["Old release measurements are never removed and a vulnerable version stays acceptable indefinitely.", "The store is writable by the same team whose software it describes, with no second approval."],
    v: "Publish a new release, confirm its measurement appears with a signature and validity window, then expire the previous one and confirm evidence from it is now rejected.",
    dep: ["firmware-signing", "enclave-signing"]
  },
  "endorsement-chain-validation": {
    s: "Checking the certificate chain that links an attestation signing key back to the hardware vendor's published root, including validity and revocation status.",
    d: "Evidence is signed by a key unique to a platform or a group, certified by an intermediate that identifies the chip model and security version, which chains to a root published by the vendor. The verifier checks each signature, extension fields that carry version numbers, validity dates and revocation lists. It must fetch fresh certificates and lists, which makes it dependent on an external service. Failure modes include unreachable certificate sources and expired intermediates that break otherwise healthy deployments.",
    k: ["Fetch certificates live vs cache them locally: live is fresh but adds an availability dependency; caching is fast and risks accepting revoked certificates.", "Fail closed vs fail open on unreachable revocation data: closed protects security but causes outages; open keeps service and weakens revocation."],
    p: ["The verifier validates the signature but not the key usage fields, accepting a non-attestation certificate.", "Pinned intermediate certificates expire and attestation stops across a whole fleet at once."],
    v: "Present evidence whose chain contains a certificate listed as revoked and confirm rejection naming that certificate, then present a clean chain from the pinned root and confirm acceptance.",
    dep: ["platform-endorsement", "revocation-lists", "attestation-key-hierarchy"]
  },
  "attestation-token": {
    s: "The signed statement a verifier returns, containing the claims it checked, a validity period and a binding to the requester's nonce or key.",
    d: "The token lists claims such as workload measurement, security version, debug state and any custom report data, signed by the verifier's own key and set to expire quickly. Relying parties and key brokers read it instead of parsing raw hardware evidence. Standardized formats let different verifiers and consumers interoperate. The risk is token reuse: if it is not bound to a specific session, key or audience, it can be stolen and replayed to impersonate the attested workload.",
    k: ["Short-lived tokens vs long-lived: short tokens limit replay but force frequent re-attestation; long tokens are efficient and extend the exposure window.", "Bearer token vs token bound to a key: binding prevents use by anyone else but requires the consumer to check proof of possession."],
    p: ["Consumers check the signature but not the audience or expiry, so tokens meant for one service work on another.", "Tokens are logged in plaintext and later used by anyone with log access."],
    v: "Request a token, wait past its lifetime and confirm the key broker refuses it, then replay a fresh token from a different key and confirm the binding check fails.",
    dep: ["verifier-service", "nonce-freshness", "report-data-binding"]
  },
  "nonce-freshness": {
    s: "A random challenge supplied by the verifier and included in the signed evidence, proving the evidence was produced after the request and not replayed.",
    d: "The verifier or relying party generates an unpredictable value, sends it to the workload, and requires it in the report data field of the signed report. Alternatives use timestamps from a trusted source or a signed counter. Without freshness, an attacker can record a valid report from a genuine platform and present it later from a compromised one. Difficulty arises when clocks are controlled by the host, and when attestation must be done offline or cached.",
    k: ["Verifier-chosen nonce vs timestamp: nonce needs a round trip but needs no clock trust; timestamps allow one-way evidence but depend on synchronized trusted time.", "Fresh evidence per request vs cached evidence for a window: fresh is strongest and slow; caching eases load and creates a replay window."],
    p: ["Nonces are generated with a weak or reused generator and are predicted by an attacker.", "The nonce is checked for presence but not equality with the one issued."],
    v: "Capture a valid report, replay it against a new challenge and confirm rejection because the nonce differs, while a report generated for the new challenge is accepted.",
    dep: ["report-data-binding", "remote-attestation"]
  },
  "relying-party-integration": {
    s: "The application-side code and protocol that consume an attestation result, so that a database, key store or client only talks to or releases data to verified workloads.",
    d: "A relying party might be a data owner, a service that issues credentials, or a peer in a multi-party computation. It requests evidence, obtains a verdict, checks its binding to the channel, and applies its own rule about what to do. The integration needs to handle expiry, re-attestation on long sessions and platform updates. It is hard because every relying party reimplements the same checks, and errors tend to be omissions: a missing nonce, audience or revocation check.",
    k: ["Library-based checks in each service vs a gateway that does it for all: a library keeps trust local; a gateway is consistent but is a high-value target.", "Attest once at connection vs continuously: once is cheap; continuous detects platform changes mid-session but costs repeated verification."],
    p: ["Attestation is performed but its result is never tied to the data channel, so a different endpoint receives the data.", "Re-attestation after a firmware revocation is never scheduled, and old sessions continue indefinitely."],
    v: "Revoke a platform's version in the verifier and confirm an already connected client drops the session within the configured re-attestation interval.",
    dep: ["attestation-token", "attested-tls", "key-release-policy"]
  },
});
