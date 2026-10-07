// Details part 4: memory protection, processor isolation, attack defenses.
ATLAS.details("trusted-execution", {
  "memory-encryption-engine": {
    s: "A block in the memory controller that encrypts data as it leaves the chip and decrypts it on return, so RAM, buses and DIMMs only ever hold ciphertext for protected domains.",
    d: "Sitting between the last-level cache and DRAM, the engine applies a block cipher in a mode with an address-dependent tweak to each cache line using a key selected by the requesting domain. Plaintext exists only inside the processor package. It defeats cold-boot dumps, bus snooping and a hypervisor reading guest pages. Latency and bandwidth overhead are modest for encryption alone and grow when integrity and freshness are added. It does not hide access patterns, which still reveal which addresses are touched.",
    k: ["Encryption only vs encryption plus integrity: encryption alone is cheap and permits silent corruption and replay; adding integrity metadata detects tampering at memory and bandwidth cost.", "Single platform key vs per-domain keys: a single key is simple and lets one domain's ciphertext be swapped into another; per-domain keys isolate and need key slots."],
    p: ["Deterministic encryption without an address tweak lets an attacker detect equal plaintext lines or move ciphertext between addresses.", "Bandwidth-heavy workloads slow down noticeably when encryption sits on the critical path."],
    v: "Fill a protected page with a repeating pattern, dump physical memory through a bus analyzer or a host-side tool, and confirm the dump shows no repeats and no recognizable bytes.",
    dep: ["address-tweaked-cipher", "domain-key-slots", "reserved-memory-carveout"]
  },
  "integrity-tree": {
    s: "A hash or MAC tree over protected memory that detects modification and replay of old contents, with its root held on chip where an attacker cannot reach it.",
    d: "Each cache line has a MAC, and counters or hashes of those are organized into a tree whose root stays in on-chip storage. On a read, the engine verifies the path to the root; on a write it updates it. This detects spoofing, splicing and replay of earlier ciphertext. The cost is extra memory (often 10 to 25 percent), extra accesses, and cache pressure for the metadata. Large trees add latency, so designs cache upper levels and limit protected size.",
    k: ["Full-memory integrity tree vs MAC only: the tree stops replay and costs memory and speed; MAC-only stops modification and misses replay of old valid data.", "Deep tree with small root vs shallow wide tree: deep uses little on-chip state and adds accesses; wide is fast and needs more on-chip storage."],
    p: ["Protected-memory size is limited by metadata overhead, and large enclaves page heavily.", "A verification failure triggers a machine halt that the host can induce, creating a denial of service."],
    v: "Using a memory interposer or emulator, flip one bit and also restore a stale copy of a protected line. Confirm each triggers an integrity fault, not silent acceptance.",
    dep: ["memory-encryption-engine", "address-tweaked-cipher", "hardware-root-of-trust"]
  },
  "address-tweaked-cipher": {
    s: "A cipher mode that mixes the physical address into encryption so identical data at different locations produces different ciphertext and blocks cannot be moved.",
    d: "Modes designed for storage, with a per-block tweak derived from the address, make each location's ciphertext unique under the same key. This hides data equality and prevents copying a valid block elsewhere to fool a reader. It does not provide freshness, so writing an old ciphertext back to the same address still decrypts to the old data. Tweakable modes are length-preserving, so no extra storage is needed, which is why they are used for encryption without integrity metadata.",
    k: ["Tweakable block cipher mode vs counter mode with stored counters: tweaked is stateless and deterministic per address, so replay is invisible; counters give freshness at metadata cost.", "Wide-block vs narrow-block: wide diffuses a flip across the whole line and costs more; narrow limits damage but leaks structure."],
    p: ["Ciphertext of one value at one address can be compared over time, revealing whether data changed.", "A malleable mode lets the host flip chosen bits in plaintext by modifying known ciphertext."],
    v: "Encrypt two identical lines at different addresses and confirm distinct ciphertexts. Move a ciphertext line to another address and confirm decryption yields garbage, not the original.",
    dep: ["memory-encryption-engine", "domain-key-slots"]
  },
  "domain-key-slots": {
    s: "A table of encryption keys in the memory controller, each assigned to one protected domain, with software referring to them only by an identifier.",
    d: "When a protected domain is created, the security processor generates a random key, loads it into a slot and tags the domain with a key identifier. Memory accesses carry that identifier, so the controller picks the key. Software, including the hypervisor, can assign slots but never read keys. The number of slots limits how many protected domains can run at once, and hypervisors need to multiplex or limit tenants. Slot reuse requires flushing cached lines tagged for the old key, to avoid leaks to a new tenant.",
    k: ["Many hardware key slots vs few slots with swapping: many supports dense hosting at silicon cost; few is cheap and needs host-assisted context swapping.", "Keys generated by the security processor vs by the host: processor-generated keys are never visible; host-generated keys are easier to manage and defeat the purpose."],
    p: ["Key slots run out and new confidential VMs fail to start at peak load.", "A freed slot is reassigned without flushing caches and the new domain observes stale plaintext lines."],
    v: "Create domains until slots are exhausted and confirm a clear error. Destroy one, create another reusing the slot, and confirm no data from the first is readable.",
    dep: ["memory-encryption-engine", "security-processor", "entropy-source"]
  },
  "page-ownership-table": {
    s: "A table maintained by hardware recording, for each physical page, which domain owns it and whether it is private, shared or assigned, checked on every translated access.",
    d: "Encryption alone does not stop a hypervisor remapping one guest's page into another's address space. The ownership table records the owner and guest address of each page, and the hardware verifies on a nested translation that the page belongs to the requester and is mapped where the guest expects. Special instructions let the hypervisor assign pages and the guest validate them. This blocks remapping, aliasing and replay of pages across addresses. Management cost is a table lookup per translation and care when pages change state.",
    k: ["Hardware ownership table vs encryption alone: the table prevents remapping and aliasing attacks and needs memory and lookups; encryption alone allows moving valid pages around.", "Guest must validate each page vs trust the first assignment: validation catches later host changes and adds boot work."],
    p: ["Guest skips validation of a page and later uses it after the host remapped it.", "Table lookups cause slowdowns when translation caching is poor."],
    v: "Have the hypervisor map one guest page to two guest addresses. Confirm the second access faults with an ownership violation recorded by hardware.",
    dep: ["nested-translation-checks", "protected-page-cache", "reserved-memory-carveout"]
  },
  "nested-translation-checks": {
    s: "Extra checks on the second-level address translation used by virtualization, so a hypervisor's mappings cannot give a guest a page it does not own or hide its changes.",
    d: "Virtual machines use two translation stages: guest virtual to guest physical, then guest physical to host physical, controlled by the hypervisor. In confidential designs the hardware adds checks on the second stage: the resulting host page must be owned by this guest, must be at the expected guest address, and must have a matching state. Changes to the host-controlled mappings are allowed but cannot produce an access that violates ownership. Translation caches must be flushed correctly when mappings change, otherwise stale entries violate the guarantee.",
    k: ["Hardware checks on second stage vs hypervisor trusted to maintain: hardware checks protect against a malicious host and add logic to the translation path; trust is cheaper and removes the isolation claim.", "Immutable mappings once private vs allowed changes with notification: immutable is simplest and prevents ballooning; changes enable memory management and require validation."],
    p: ["Stale cached translations let the guest access a page just reassigned.", "Large-page mappings hide per-page ownership differences until a split."],
    v: "Change a mapping while the guest runs and confirm the next access faults or is validated. Verify with a translation-cache flush trace that no stale entry served an access.",
    dep: ["page-ownership-table", "isolation-instructions"]
  },
  "dma-protection": {
    s: "Controls that stop devices from reading or writing protected memory through direct memory access, using an address-translation unit for devices and ownership checks.",
    d: "Devices can access memory without the CPU, so a malicious device or a hypervisor-controlled device could read decrypted pages if they were reachable. The memory controller treats device access as a request with no domain key, so protected pages return ciphertext or are blocked; an I/O translation unit confines each device to permitted ranges. Newer designs let a device join a protected domain after authenticating itself, so it can access private memory. Difficulties include peer-to-peer device traffic, device-initiated attacks through firmware flaws and misconfiguration of translation units.",
    k: ["Block all device access to private memory vs admit authenticated devices: blocking is safe and forces bounce buffers; admitting is fast and adds trust in device firmware and links.", "Per-device translation tables vs a global allow-list: per-device limits damage and costs table management."],
    p: ["A device left outside the translation unit's scope has full memory access, or the unit is disabled in firmware.", "Device firmware vulnerability extends the trusted base when devices are admitted."],
    v: "Program a DMA-capable device to read a protected page and confirm it returns ciphertext or faults. Repeat with translation disabled to confirm the test could detect a failure.",
    dep: ["page-ownership-table", "memory-encryption-engine", "reserved-memory-carveout"]
  },
  "reserved-memory-carveout": {
    s: "A physical range set aside at boot, configured by firmware before the operating system starts, that only protected code and hardware may use.",
    d: "Firmware programs controller registers that define the range and lock them until reset. The range is excluded from the memory map reported to the OS, which cannot allocate it. Hardware metadata for the range sits in the same area. Because it is carved at boot, its size must be chosen in advance and cannot easily grow, so firmware settings decide how many protected workloads a machine can hold. The registers' lock status is itself part of what attestation reflects.",
    k: ["Static carveout at boot vs dynamic allocation: static is simple and guards against runtime tampering; dynamic uses memory efficiently and needs more hardware logic.", "Contiguous range vs scattered pages: contiguous is easy to check; scattered fits any memory layout with more metadata."],
    p: ["The setting is left at default and too small, so large workloads fail on the first deployment.", "Firmware leaves range registers unlocked, so later software moves the boundary."],
    v: "Read the controller's range registers after boot and confirm they are locked and that the OS memory map omits the range. Attempt to write the registers from the OS and confirm failure.",
    dep: ["platform-firmware", "hardware-root-of-trust"]
  },
  "isolation-instructions": {
    s: "New processor instructions that create, extend, enter, exit and destroy protected domains, and whose hardware checks the host cannot bypass.",
    d: "Dedicated instructions, some privileged and some for use by the protected code, implement operations such as add page, finalize, enter, resume, report and seal key. Each validates operand state against hardware metadata and fails with a code if the request would break an invariant. They are microcoded or handled by a security processor and some can be updated through microcode. Because they are architecture extensions, software must detect support through feature bits and handle fused-off or locked-down parts.",
    k: ["New instructions in the core vs a separate security processor with a mailbox: instructions are fast and increase core complexity; a processor is isolated from core flaws and slower.", "Rich instruction set for flexibility vs minimal: rich supports dynamic features and enlarges the verification burden."],
    p: ["Software assumes instructions are available and fails on parts where firmware has disabled them.", "An error code is ignored by the host driver and a half-built domain is started."],
    v: "Execute each instruction with invalid operands, such as a wrong page type or state, and confirm each returns the documented error and leaves hardware metadata unchanged.",
    dep: ["secure-cpu-modes", "page-ownership-table"]
  },
  "secure-cpu-modes": {
    s: "Additional processor states, such as a secure world level or a guest-private mode, that determine which memory and registers code can touch.",
    d: "The core carries a security state bit or a privilege level that accompanies every memory access, interrupt and register read. Normal-world code at any privilege cannot reach secure resources. A mode switch happens only through defined entry points, often through the monitor or an entry instruction. In confidential VMs, a guest-private mode keeps the hypervisor from seeing registers and imposes limits on what it can inject. Mode logic needs thorough verification, since a bypass is a full break.",
    k: ["Orthogonal security state vs extra privilege ring: orthogonal state is independent of ordinary privilege and doubles the combinations; a ring is simpler and entangles with existing OS.", "Software-visible mode vs mode hidden by firmware: visible allows secure code to reason about its context; hidden reduces what the host can learn."],
    p: ["A new debug or power-management feature forgets to carry the security state and bypasses checks.", "Mode transitions leave cache lines tagged secure that normal code can probe for timing."],
    v: "From each normal-world privilege level, attempt to access secure registers, memory and devices and confirm all fault. Confirm only the documented entry paths change the mode.",
    dep: ["isolation-instructions", "register-state-protection"]
  },
  "register-state-protection": {
    s: "Saving, encrypting and clearing a protected context's registers whenever control leaves, so the host cannot read or change them and can only resume at the saved point.",
    d: "On an exit, register contents are written to a protected save area in encrypted and integrity-protected memory, or kept in hardware, and the visible registers are replaced with benign values. The host gets only the information the architecture deliberately returns, such as the reason for an exit and the data needed to emulate an instruction. On resume, the hardware restores the saved values and checks that the host did not modify the save area. Hard cases are instructions that need host emulation, which require disclosing selected register values.",
    k: ["Hardware-managed encrypted save area vs software-saved state: hardware cannot be tampered with by the host and needs extra silicon; software save is flexible and trusts the saving code.", "Share minimal registers for emulation vs hide all: sharing allows device emulation; hiding forces the guest to do such operations itself."],
    p: ["Vector or floating-point state is omitted from clearing and leaks data.", "The host changes the instruction pointer in a shared area and redirects execution on resume."],
    v: "Run protected code that fills all register files with a marker, force an exit at arbitrary points, and confirm the host sees no marker while resumed execution continues with correct values.",
    dep: ["isolation-instructions", "memory-encryption-engine", "integrity-tree"]
  },
  "debug-lockout": {
    s: "Hardware settings that disable external debug ports and internal debug instructions for protected code in production, and report their state to attestation.",
    d: "Debug interfaces such as hardware ports and software debug instructions can read memory and registers at any time. Lockout is controlled by fuses, firmware settings or per-domain flags, and may be set permanently once a device ships. A domain created in debug mode has its flag reported, so verifiers can refuse it. Some designs allow authenticated re-enabling for repair using a signed token. The tension is that failure analysis in the field needs debug, while any enabled path undermines the guarantee.",
    k: ["Permanent fuse lockout vs signed re-enable: permanent is the strongest and prevents repair; signed re-enable lets the vendor analyze and makes that credential a target.", "Per-domain debug flags vs a platform-wide switch: per-domain allows developers and production to coexist and needs careful reporting."],
    p: ["A production device ships with a debug port still enabled in a manufacturing configuration.", "A diagnostic mode of the platform dumps secure memory in crash reports."],
    v: "Attach a debugger to a production-configured device and attempt to read protected memory and registers. Confirm refusal and that the attestation report shows debug disabled.",
    dep: ["fused-device-keys", "launch-policy"]
  },
  "trace-and-counter-limits": {
    s: "Restrictions on performance counters, branch tracing and similar instrumentation when protected code runs, so they cannot reveal its control flow or data.",
    d: "Performance monitoring and tracing give precise information about branches, cache misses and instruction counts. When these count events from protected code, they become a side channel and a debugging backdoor. Hardware can mask counters during protected execution, restrict tracing to the protected code's own use, or permit only coarse aggregates. Operators lose profiling visibility into protected workloads, and developers need alternate ways to find performance problems.",
    k: ["Disable counters in protected mode vs let the code opt in: disabling is simple and blinds performance work; opt-in lets the owner profile and risks leaking through the same data.", "Coarse aggregate counts vs none: aggregates help operators and still leak coarse behavior."],
    p: ["Host counters count events from protected code and reveal secret-dependent branch counts.", "Trace buffers keep records after the protected code exits and are read later."],
    v: "Enable branch tracing on the host, run a secret-dependent loop inside protected code, and confirm the trace contains no entries from the protected region.",
    dep: ["side-channel-mitigations", "secure-cpu-modes"]
  },
  "tcb-boundary": {
    s: "The explicit line listing everything that must be correct for the protection to hold: which hardware, firmware and software is trusted, and which is assumed hostile.",
    d: "Every design states its trusted computing base. For enclaves it is the processor package, its microcode, and the enclave code; for confidential VMs it adds the security processor firmware and the guest OS; for a secure world it includes the monitor and the secure OS. Everything else, including the operating system, hypervisor, other devices and often the cloud operator, is outside. The boundary is a design document and a testing guide. It tends to grow, as convenience features move inside.",
    k: ["Small TCB with few features vs larger TCB with services inside: small is easier to review and pushes work to the untrusted side; large is productive and holds more bugs that matter.", "Trust the vendor's firmware vs require open, reproducible firmware: trust is practical; openness allows audit and is rarely available for silicon."],
    p: ["A feature added inside later, such as a network stack, makes the trusted base as big as the system it was meant to avoid.", "The TCB list is not updated when firmware gains a new component."],
    v: "Produce a list of every binary and hardware block in the TCB, with versions and hashes, and confirm each appears in the attestation report or is covered by a named vendor statement.",
    dep: ["hardware-root-of-trust", "platform-firmware"]
  },
  "secure-timer-source": {
    s: "A clock the protected code can trust, because the host cannot set it back or forward, used for freshness, expiry and timeouts.",
    d: "Protected code usually gets time from the host, which can lie. A secure timer inside the processor package gives monotonic ticks that the host cannot alter, though it may not give calendar time. Calendar time requires a trusted time service. Hardware timers also help detect single-stepping and slowdowns. Some systems read the timer only through a secure-world call, while others expose a counter in protected mode. Without it, certificate validity, token expiry and rate limiting all rest on the host's word.",
    k: ["Secure monotonic counter vs trusted network time: counter works offline and has no absolute time; network time gives dates and needs a trusted authenticated source.", "Expose raw timer inside protected code vs coarsened: raw helps detection and enables fine timing attacks; coarsened reduces leakage."],
    p: ["Certificate expiry is evaluated against host time, and an expired credential is accepted.", "The timer resets after sleep and replayed tokens look recent."],
    v: "Set the host clock back one day and confirm protected code's secure timer is unaffected, and that a token expired by true time is still refused.",
    dep: ["hardware-root-of-trust", "nonce-freshness"]
  },
  "side-channel-mitigations": {
    s: "The set of hardware and software measures that reduce what an observer learns from timing, cache state, power or other effects of protected code's execution.",
    d: "Isolation hides contents and not behavior. A host sharing the machine can observe cache lines touched, branch predictor state, execution time and exit counts. Mitigations include flushing state on switches, partitioning shared structures, disabling simultaneous multithreading across domains, and writing code whose control flow and addresses do not depend on secrets. No single measure covers every channel. Vendors treat many of these as outside the protection promise, so application developers inherit the burden.",
    k: ["Hardware mitigations vs application-level discipline: hardware changes cover all code and cost performance; discipline is specific and error-prone and costs nothing at runtime.", "Disable sibling threads vs keep them: disabling removes a rich channel and loses throughput; keeping them is efficient and exposes shared core state."],
    p: ["A cryptographic routine branches on key bits, and an attacker sharing the cache recovers them.", "Mitigations are applied to the enclave and not to the helper libraries it calls."],
    v: "Run a known cache-timing attack on a secret-dependent lookup inside and outside the protected domain, with and without mitigations, and compare the recovered-bit success rates.",
    dep: ["cache-partitioning", "constant-time-code", "speculation-barriers"]
  },
  "cache-partitioning": {
    s: "Dividing shared caches among domains so one cannot evict or probe another's lines, removing a main source of timing information.",
    d: "Way-based or set-based partitioning assigns cache capacity to domains. Page coloring in software achieves a similar result by controlling which physical pages map to which sets. Partitioning removes cross-domain eviction channels at the cost of effective cache size and flexibility. It does not cover other shared structures, such as translation buffers, predictors and memory controller queues. Dynamic repartitioning on domain switches introduces its own leak through the resizing.",
    k: ["Hardware way partitioning vs software page coloring: hardware is transparent and coarse; coloring works on existing parts and constrains memory allocation.", "Static partitions vs dynamic: static is leak-free and wastes unused capacity; dynamic uses capacity and its changes are observable."],
    p: ["A partitioned cache is accompanied by shared predictors, and the attack moves there.", "Coloring fragments memory so large contiguous allocations fail."],
    v: "Run a prime-and-probe attacker on a neighboring domain with partitioning on and off, and confirm the probe's hit-rate difference disappears when the victim accesses vary.",
    dep: ["side-channel-mitigations", "page-ownership-table"]
  },
  "controlled-channel-defense": {
    s: "Countermeasures to attacks where the host observes or induces page faults to learn which pages protected code touches and so infer secrets from the sequence.",
    d: "Since the host manages page tables, it can unmap pages and record each fault to trace an execution at page granularity. Defenses include keeping all pages resident so there are no host-visible faults, hardware that hides the fault address or handles faults privately, detecting abnormal fault rates, and rewriting code and data layout so access sequences do not depend on secrets. Some defenses cost large slowdowns. Variants use access and dirty bits in page tables, which can leak without any faults.",
    k: ["Pin pages and hide fault addresses vs detect and abort on abnormal fault rates: hiding removes the signal and needs hardware or pinning; detection is software-only and leaves some leakage.", "Randomize or obfuscate layout vs constant-access code: obfuscation is general and slower; constant access is exact and demands rewriting."],
    p: ["Code that indexes a table by secret value leaks through the page touched on every lookup.", "Defense relies on a fault handler inside the enclave, which the host can interrupt in turn."],
    v: "Run an attack harness that unmaps pages and records fault order on a sample secret-dependent routine, and confirm the secret is recovered without the defense and not recovered with it.",
    dep: ["protected-paging", "enclave-threads", "constant-time-code"]
  },
  "speculation-barriers": {
    s: "Instructions and compiler settings that stop the processor speculatively executing past checks, so misspeculated reads do not leave secret-dependent cache traces.",
    d: "Processors run ahead of unresolved branches; if they guess wrong, results are discarded but cache effects remain. Attackers train predictors so protected code speculatively reads secrets and encodes them in cache. Barriers fence loads after bounds checks, predictor flushes on world switches clear trained state, and compilers can mask indices. Each adds overhead and must be placed at the right sites. Hardware changes reduce some variants. The attack class keeps producing new variants because each predictor structure is a new channel.",
    k: ["Barriers everywhere vs only at suspected gadgets: everywhere is safer and slow; targeted is fast and misses unconsidered paths.", "Flush predictors on every switch vs rely on hardware tagging: flushing is simple and costly; tagging is cheap and trusts hardware correctness."],
    p: ["A bounds check is compiled without a fence and a speculative out-of-bounds read leaks.", "Predictor state from the host trains protected code's branches."],
    v: "Run a known speculative-read proof of concept against a sample bounds-checked function inside the domain, before and after the barrier, and confirm the leaked byte rate falls to chance.",
    dep: ["side-channel-mitigations", "world-switch", "isolation-instructions"]
  },
  "constant-time-code": {
    s: "Programming so that control flow, memory addresses and execution time do not depend on secret values, removing the signal that timing and access-pattern attacks need.",
    d: "Secret-dependent branches become arithmetic selects; table lookups indexed by secrets become scans of the whole table or computed values; early exits on mismatch become full comparisons. Compilers may reintroduce branches, so verification looks at generated code or runs statistical timing tests. It applies in particular to cryptographic primitives, which are usually provided by audited libraries. It is hard because performance-sensitive code is naturally data-dependent and because hardware can vary timing for certain operations such as division and multiplication.",
    k: ["Use audited constant-time libraries vs write your own: libraries encode expert knowledge and update with fixes; custom code is tailored and often leaky.", "Verify with tools that track secret taint vs trust the source: tools find compiler-introduced leaks and need effort; trusting the source is cheap and misses them."],
    p: ["The compiler converts a branch-free select back into a branch.", "A non-constant-time memcmp on a MAC check reveals the tag byte by byte."],
    v: "Run a timing-variance test harness with two secret classes over millions of calls and confirm no statistically significant difference in execution time or in the recorded address trace.",
    dep: ["side-channel-mitigations", "enclave-sdk"]
  },
  "fault-injection-defense": {
    s: "Protections against attackers who glitch voltage, clock or electromagnetic fields to make a processor skip checks or compute wrong values that reveal keys.",
    d: "A well-timed glitch can skip a signature check at boot or corrupt one step of a cipher so that the faulty output exposes the key. Defenses include voltage and clock monitors, redundant computation with comparison, double-checking security-critical branches, randomized delays, and hardware detection that wipes keys or halts. Software variants, where a privileged host raises power or frequency through legitimate interfaces, also exist and are mitigated by locking those interfaces. Defenses cost area and speed and are mostly verified by lab testing.",
    k: ["Redundant computation in software vs sensors in hardware: software is portable and doubles cost for protected steps; sensors are general and need silicon design and tuning.", "Halt or wipe on detection vs retry: halting is safe and can be abused for denial of service; retry keeps availability and lets an attacker try repeatedly."],
    p: ["A single comparison guards a boot signature check, and one glitch skips it.", "Software-accessible voltage control lets a privileged host induce faults remotely."],
    v: "Subject a test board to a controlled glitch campaign aimed at a signature-check branch and confirm zero accepted invalid images over the planned number of attempts, with detectors logging events.",
    dep: ["hardware-root-of-trust", "boot-rom"]
  },
  "physical-attack-defense": {
    s: "Measures against someone with the machine in hand: bus probing, cold-boot memory capture, and DIMM swapping or replay, mostly met by encryption, integrity and tamper response.",
    d: "Memory encryption makes captured DRAM useless without the key, which lives only on chip. Integrity trees detect modified or replayed contents. On-package keys avoid exposing fuses to probing. Tamper sensors, meshes and detectors can clear keys when the package is opened. Cheaper commodity systems often exclude the physical attacker from the model and state that explicitly. Defense in this area is a cost choice about who the attacker is: a cloud neighbor, an operator, or someone with a lab.",
    k: ["Include physical attackers in scope vs exclude: inclusion needs integrity, tamper response and cost; exclusion is cheaper and limits use to facilities where physical access is controlled.", "Encryption alone vs encryption with replay protection: encryption stops reading; replay protection stops substituting old data and costs memory."],
    p: ["Documentation says physical attacks are out of scope, and a deployment in an untrusted facility assumes otherwise.", "A bus interposer replays old ciphertext and the system accepts it because no freshness is tracked."],
    v: "Pause a running system, capture DRAM contents with a cold-boot or interposer rig, and confirm no plaintext secrets, then replay a recorded line and confirm an integrity fault when replay protection is enabled.",
    dep: ["memory-encryption-engine", "integrity-tree", "fused-device-keys"]
  },
  "single-step-detection": {
    s: "Hardware or software checks that notice when the host interrupts protected code unusually often, a technique used to observe execution one instruction at a time.",
    d: "Attackers set timers or use interrupt controllers to interrupt protected code after each instruction, measuring access patterns or timing at fine granularity. Defenses count interrupts or time between exits, abort when the rate is implausible, or use hardware that blocks interrupts for a few instructions after entry so progress is guaranteed. Detection thresholds must separate legitimate load from attack. Without a trusted timer, the code may be unable to tell.",
    k: ["Guarantee forward progress in hardware vs detect and abort in software: hardware is reliable and costs silicon; software detection is flexible and relies on trusted time.", "Strict thresholds vs lenient: strict catches more attacks and kills legitimate busy hosts; lenient avoids false aborts and lets slow attacks through."],
    p: ["A threshold tuned on an idle machine aborts under heavy host interrupts.", "The detector reads time from the host and is deceived."],
    v: "Run a single-stepping harness against a sample routine and confirm the detector aborts or the hardware progress guarantee prevents more than one step per interrupt, while a loaded host sees no false aborts.",
    dep: ["secure-timer-source", "exception-routing", "enclave-threads"]
  },
});
