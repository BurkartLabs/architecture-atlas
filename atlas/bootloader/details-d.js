// Bootloader details, part 4: trust chain, reset and early init, memory initialization, early debug, cross-cutting concerns.
ATLAS.details("bootloader", {
  "hardware-root-of-trust": {
    s: "The immutable code and keys in silicon that start the trust chain: the first thing that runs, and the one thing that cannot be replaced by software.",
    d: "A boot ROM, fixed at manufacture, holds the first code and either a public key or a hash of one, often backed by one-time-programmable fuses. It verifies the next stage against that anchor before running it. Everything later is only as trustworthy as this anchor, because no later stage can verify the one before it. Fuses also hold device identity, security state and revocation counters. The hard part is that a flaw in ROM cannot be patched, and a lost or wrong key burned into fuses cannot be changed.",
    k: ["Key burned into fuses vs. hash of a key stored in flash: fuses are immutable and cannot be rotated; a stored key hash allows rotation and needs another protected store.", "Large capable ROM vs. tiny ROM: capable ROM can verify more formats and cannot be patched when wrong; tiny ROM has less to get wrong and defers work to patchable stages."],
    p: ["A fuse programmed with the wrong key bricks every unit built with that setting.", "A parsing bug in ROM lets a crafted next stage run unverified and cannot be fixed in the field."],
    v: "On a development unit with fuses set to a test key, present a stage signed with a different key and confirm the ROM refuses to run it, reporting a verification failure code on the debug output.",
    dep: ["boot-rom", "debug-port-lockdown"]
  },
  "verified-boot-chain": {
    s: "Each stage checks a signature or digest on the next stage before running it, so only code signed by an authorized key can reach the kernel.",
    d: "The ROM verifies the first stage, the first stage verifies the second, and so on to the kernel, with each link using a key or hash anchored in the previous one. Verification covers the code and, ideally, its configuration and ramdisk. On failure, a stage halts, falls back or enters recovery according to policy. The design question is what gets verified: unverified configuration or ramdisk files that the kernel trusts reopen the gap. The hard part is key management and covering every input.",
    k: ["Verify each next stage vs. verify the whole chain at once: stagewise checks need keys at every link and catch failures early; whole-chain checks are simpler and delay detection.", "Halt on failure vs. continue with a warning: halting is secure and may brick; warning keeps working and defeats the purpose."],
    p: ["The kernel is verified but the ramdisk and command line are not, and a modified ramdisk runs with full trust.", "A stage verifies the image header but not the body that follows."],
    v: "Flip one byte in each stage's image in turn, boot, and confirm the previous stage refuses it with a distinct failure code every time, and an unmodified set boots.",
    dep: ["hardware-root-of-trust", "signing-key-databases", "stage-chain-design"]
  },
  "signing-key-databases": {
    s: "The stored lists of trusted keys, trusted hashes and forbidden hashes that verification consults, with a hierarchy that controls who may change them.",
    d: "A top-level platform key, owned by whoever controls the device, authorizes changes to a key-exchange list, which authorizes entries in the allowed database. A forbidden database lists revoked keys and hashes, overriding allowance. Updates are signed payloads applied through the firmware variable service. This split lets a hardware vendor, an operating system vendor and an owner each have a place. The hard part is that the databases are mutable state in flash, their provisioning at factory, and the size they reach after many revocations.",
    k: ["Several signers (vendor keys plus owner keys) vs. one: several enable ecosystem boot media, and each trusted party can sign malware; one is simple and excludes unrelated systems.", "Allow-list of keys vs. allow-list of image hashes: keys allow updates without changes; hashes are exact and need an update for each build."],
    p: ["The forbidden list grows until it no longer fits the variable store, and revocations cannot be added.", "Setup mode left enabled lets anyone install their own platform key."],
    v: "Enroll a test key, boot an image signed with it and confirm success; add its hash to the forbidden list and confirm the same image is refused.",
    dep: ["firmware-variables", "hardware-root-of-trust"]
  },
  "revocation-and-rollback-protection": {
    s: "Prevents known-bad or older components from running even though they carry valid signatures, using forbidden lists and monotonic version counters.",
    d: "A valid signature only proves origin, not freshness. Two mechanisms close the gap: a revocation list of banned hashes or keys, and a security version recorded in a counter that can only increase. Images carry a version, and the verifier refuses anything below the counter. Counters live in fuses, protected flash or secure storage, and are advanced after a successful new boot. The hard part is the tradeoff: raising the counter too early makes rollback to the last good image impossible, and each revocation consumes limited storage.",
    k: ["Version counters vs. hash revocation lists: counters take almost no space and block whole ranges; lists are precise and grow without bound.", "Advance the counter at install vs. after health confirmation: advancing at install blocks attackers immediately but removes the safety net; advancing after health is safer for availability."],
    p: ["Counter advanced by a release that then proves faulty, and the fleet cannot roll back at all.", "A downgrade through a recovery path ignores the counter altogether."],
    v: "Try to boot an older, validly signed image after the counter has moved: it must be refused with a rollback reason. Boot the current image and confirm the counter value is unchanged.",
    dep: ["signing-key-databases", "persistent-state-and-wear", "verified-boot-chain"]
  },
  "secure-boot-policy-modes": {
    s: "The states that define how strictly verification applies: setup, user, audit and deployed, controlling who may change keys and whether failures block boot.",
    d: "In setup mode the key hierarchy is open, so provisioning can proceed. In user mode, signatures are enforced and changes need authorization. Audit mode checks and logs failures without blocking, to test a policy before enforcing it, and a deployed mode locks the configuration further. A firmware setting toggles the whole feature. The modes make adoption possible. The hard parts are unattended machines left in setup mode, operators disabling the feature to get a foreign system to boot, and the loader needing to know the mode to decide its own policy.",
    k: ["Enforcement on by default vs. off: on by default protects most machines, and breaks custom systems; off is convenient and leaves the chain unverified.", "Audit mode before enforcing vs. enforce at once: audit shows what would break and risks being left on; direct enforcement is secure and surprising."],
    p: ["Machines ship in setup mode and no one enrolls keys, so the verification never applies.", "Disabling the feature to boot one tool leaves it off permanently."],
    v: "Read the mode variable on a fleet sample and confirm all report user or deployed mode; in audit mode, boot an unsigned image and confirm it runs and the failure is logged.",
    dep: ["signing-key-databases", "firmware-variables", "firmware-settings-interface"]
  },
  "boot-measurement-log": {
    s: "An ordered record of every component, setting and event that was measured during boot, kept in memory and handed to the kernel for later review.",
    d: "Each time a stage measures something, it appends an entry holding the register it extended, the event type, the digest and a description. The log lets a verifier recompute the final register values and see which component caused a difference. Firmware creates it and passes its address to the loader, which continues it, and then to the kernel. It is necessary because the registers themselves are only hashes. The difficulty is that the log is not itself protected: it must be replayed and checked against hardware values to be trusted.",
    k: ["Detailed log of every event vs. digests only: detailed logs explain differences and grow large; digests are compact and opaque.", "Pass log in memory vs. store it persistently: memory handoff is simple and lost at reboot; persistent logs help forensics and need protected storage."],
    p: ["A loader extends a register but forgets to log it, so replay never matches the hardware value.", "The log is treated as authoritative without replay, and an attacker edits it to hide a change."],
    v: "Replay the log by hashing each entry into fresh registers and confirm the result equals the hardware register values for every register used; modify one entry and confirm replay fails.",
    dep: ["measurement-registers", "boot-parameters-block"]
  },
  "measurement-registers": {
    s: "Hardware registers that can only be extended, never set: each new value is the hash of the old value and the new measurement, so history cannot be rewritten.",
    d: "A trusted platform module or equivalent provides a bank of registers, reset only at power-on. A stage measures the next component, then extends a register with the digest. The final value depends on every component in order. Registers are grouped by purpose: firmware code, firmware configuration, loader, kernel, and so on. Keys and secrets can be sealed to specific register values, so they are released only if the boot sequence matches. It is hard because any benign change, such as a firmware update, changes the values and breaks sealed secrets.",
    k: ["Measure in firmware, then loader, then kernel vs. measure only the first stages: full chains cover the kernel and break on every update; short chains are stable and leave later code unrecorded.", "Seal secrets to exact values vs. to a signed policy: exact values are strict and brittle; signed policies survive updates and need a signer."],
    p: ["Resetting the module without resetting the CPU lets an attacker replay a known-good chain.", "The measured value includes a timestamp or random data and is different every boot."],
    v: "Boot the same images twice and confirm the register values are identical; change one byte in the loader and confirm only the registers for that component and later ones differ.",
    dep: ["hardware-root-of-trust", "verified-boot-chain"]
  },
  "remote-attestation": {
    s: "A signed report of the measurement registers, with a challenge value, that a remote verifier checks to decide whether a machine booted what it should.",
    d: "A verifier sends a fresh random challenge. The machine asks its trusted module to sign the current register values together with the challenge, using a key bound to the device, and sends the signature and the measurement log. The verifier checks the signature chain to the device vendor, replays the log, and compares the result with a list of acceptable values. Attestation gates access to networks or secrets. The hard parts are keeping the acceptable-values list current as software updates, and knowing that a good report only proves the boot, not later compromise.",
    k: ["Compare against exact known values vs. policy on log contents: exact values are simple and constantly stale; policy over events tolerates updates and is complex.", "Attest at boot only vs. repeatedly: boot-time attestation is cheap and leaves later changes unseen; repeated attestation needs runtime measurement."],
    p: ["Challenge not included in the signed quote, so an old valid report is replayed for a compromised machine.", "The verifier accepts any device with a certificate and never checks the vendor chain."],
    v: "Request a quote with a new challenge, verify the signature and replay the log against the registers; then reuse an old quote with a new challenge and confirm the verifier rejects it.",
    dep: ["measurement-registers", "boot-measurement-log"]
  },
  "debug-port-lockdown": {
    s: "Disables or authenticates hardware debug interfaces and engineering modes in production units, so a probe cannot bypass the trust chain or read secrets.",
    d: "Development hardware leaves debug ports open: they can halt the CPU, read memory and rewrite flash. Production parts blow a fuse or set a lifecycle state that disables them, or require a signed challenge to unlock them. Firmware also locks configuration registers and flash write protection before handing off. The goal is that physical access alone cannot defeat verification. It is hard because the same ports are needed for failure analysis, and a unit returned from the field may need a controlled way to reopen.",
    k: ["Permanently disabled ports vs. authenticated unlock: permanent is strongest and loses field debugging; authenticated unlock enables returns and relies on a key that must be guarded.", "Lock early in the ROM vs. in a later stage: early locking shortens the window and hampers boot debugging."],
    p: ["Lock registers are set after code that an attacker can influence has already run.", "A debug unlock key leaks and applies to every unit."],
    v: "On a production unit, attempt to attach a probe and halt the CPU, read memory and write flash. Each attempt must fail. Confirm the lifecycle state reads as production.",
    dep: ["hardware-root-of-trust", "boot-rom"]
  },
  "boot-mode-straps": {
    s: "Physical pins or fuses sampled at reset that select where the first code is read from: internal flash, a memory card, a serial link, or a recovery path.",
    d: "At reset release, the hardware latches the level of a few pins, or reads fuses, and the boot ROM uses them to pick a source. A manufacturing setup might select a serial download mode so a blank chip can be programmed. A board designer selects the normal source with resistors. The strap choice is a part of the security story: a mode that loads unsigned code must be disabled in production. The hard part is that straps are hardware, so errors require board changes, and fuse overrides are permanent.",
    k: ["Pin straps vs. fuses: pins are changeable, which helps development and testing; fuses are fixed and safer in production.", "Allow serial download in production vs. disable: allowing it recovers blank units, and gives attackers a path; disabling needs another recovery route."],
    p: ["A floating strap pin reads randomly and the board boots from different sources between power cycles.", "Download mode remains enabled in production units and accepts unsigned code."],
    v: "Hold each strap setting in turn on a bench board and confirm via the debug output that the ROM reports the selected source each time; confirm a production sample refuses unsigned download.",
    dep: ["boot-rom", "hardware-root-of-trust"]
  },
  "power-sequencing-and-reset": {
    s: "The ordered turn-on of voltage rails and clocks, and the release of reset only when each is stable, so the CPU starts in a defined state.",
    d: "A power controller enables rails in a specified order with delays, waits for each to report good, starts the clock and a phase-locked loop, and then deasserts reset. Different reset types exist: a cold start from power, a warm reset keeping memory contents, and watchdog resets. Firmware must know which happened, because they require different initialization, such as skipping memory training after a warm reset. Errors here cause intermittent starts. The hard parts are marginal rails, brownouts, and detecting the reset cause reliably.",
    k: ["Hardware sequencer vs. firmware-controlled: hardware is fast, fixed and reliable; firmware sequencing is flexible and cannot run before it has code.", "Treat any reset as cold vs. use the reason: cold-only is simple and slow; reason-based is fast and needs trustworthy state."],
    p: ["A slow rail makes the CPU start before voltage is stable and the machine boots only when warm.", "A watchdog reset is treated as a warm resume and uses stale memory state."],
    v: "Power-cycle 500 times on a bench with a logic analyzer on reset and rail-good lines: reset release must always follow all rails good, and the reset cause register must match each reset type.",
    dep: ["boot-mode-straps"]
  },
  "reset-vector": {
    s: "The fixed address where the processor fetches its first instruction after reset, mapped to a flash or ROM region holding the earliest code.",
    d: "The architecture defines a start location, usually near the top of the address space or at zero, and the hardware maps flash there. The first instructions run in a restricted mode with no stack, no memory and caches off. They jump to initialization code, set up registers, and work toward a stack. Because the vector location is fixed by silicon, the flash layout must place code exactly there. It is hard because code at this point cannot use almost any language feature, and one mistake yields a silent hang.",
    k: ["Vector in external flash vs. internal ROM: external flash allows replaceable firmware and exposes the first code to tampering; internal ROM is fixed and trusted.", "Tiny assembly stub vs. larger early code: a stub is easy to verify and moves work to a later stage; larger code reaches more features sooner."],
    p: ["The flash image is built with the vector at the wrong offset and the CPU executes erased bytes.", "Early code uses a stack before one exists and fails with no output."],
    v: "Attach a probe, reset and step: the first instruction fetched must come from the documented address and match the first bytes of the image, and execution must reach the second-stage entry label.",
    dep: ["power-sequencing-and-reset", "flash-image-mapping"]
  },
  "boot-rom": {
    s: "Immutable code inside the chip that runs first: it reads the boot mode, finds the next stage in a permitted source, verifies it if required, and jumps to it.",
    d: "The ROM knows how to read a small set of devices, such as parallel or serial flash, memory cards, or a serial link. It copies the first stage into internal memory, checks header fields and optionally a signature against the root of trust, and transfers control. Some ROMs also initialize clocks and a basic memory path. It is the least changeable code and so must be small and well tested. The hard parts are the variety of formats it must accept, and a fallback when the preferred source holds nothing valid.",
    k: ["Few simple sources vs. many: few sources reduce the ROM's attack surface and reduce flexibility for board designers; many suit varied boards and enlarge the unpatchable code.", "Fall through sources in order vs. use only the strapped one: fall-through recovers from a blank primary source; strapped only is predictable."],
    p: ["A ROM bug in header parsing lets an oversized length overwrite internal memory, with no way to fix it.", "Fall-through accepts a card inserted by an attacker when internal flash fails."],
    v: "With the debug output enabled, boot with valid, corrupt and blank images in each permitted source and confirm the ROM reports the matching status and either boots or falls through as documented.",
    dep: ["boot-mode-straps", "hardware-root-of-trust", "flash-image-mapping"]
  },
  "early-cpu-mode-setup": {
    s: "Moves the processor from its minimal reset state into a usable one: stack, privilege level, exception vectors, floating-point and cache controls.",
    d: "The first code sets up a stack pointer in on-chip memory, switches to the intended privilege level or mode, installs minimal exception handlers that print and halt, and configures features such as the floating-point unit and instruction prefetch. On processors with legacy modes, this includes switching up to a wide mode and building descriptor tables. It stays minimal: caches are enabled once memory is known. The hard part is that each step changes how code behaves, so errors appear as faults with nothing to report them yet.",
    k: ["Enable caches early vs. late: early caches speed everything and risk coherence faults with devices; late is slow and safe.", "Handlers that print vs. handlers that reset: printing helps debugging, while resetting hides failures and may loop."],
    p: ["A fault in the exception handler itself causes a double fault and a silent reset loop.", "Floating-point left disabled and a later stage that uses it faults."],
    v: "Trigger a deliberate fault right after setup, such as a null access, and confirm the handler prints the faulting address and register state on the early console.",
    dep: ["reset-vector", "cache-as-ram", "early-serial-console"]
  },
  "microcode-and-patch-load": {
    s: "Loads vendor patches into the processor early, fixing errata and security flaws in the chip's own behavior before the rest of the boot relies on it.",
    d: "The processor contains updatable internal logic. A patch blob stored in firmware is applied by writing to a special interface, and takes effect immediately, but is lost at power-off, so it must be applied every boot. Firmware applies one early, and the kernel usually applies a newer one from the ramdisk. Patches are signed by the processor vendor and verified by the chip. The hard parts are matching the patch to the exact processor revision, and ensuring that all cores run the same level.",
    k: ["Apply in firmware only vs. also in the kernel: firmware-only covers early boot; adding the kernel update lets new patches ship without a firmware update.", "Patch before memory training vs. after: patching first fixes errata that affect training; later is simpler."],
    p: ["Cores end up with different patch levels because only one applied a late update.", "The stored patch is for another revision and is rejected silently."],
    v: "Read the patch revision register on every core after boot and confirm all match the revision in the bundled patch file, and that the kernel reports the same value.",
    dep: ["early-cpu-mode-setup", "flash-image-mapping", "multiprocessor-startup"]
  },
  "cache-as-ram": {
    s: "Uses the processor's cache or a small on-chip memory as a temporary stack and data area, before the main memory controller has been set up.",
    d: "Early code needs somewhere to store variables and a call stack. Some chips offer a block of static memory on the die; others let firmware configure part of the cache so reads and writes stay inside it and never reach memory. Code runs from flash and data lives in this temporary space, which is small, often tens of kilobytes. It lasts until memory is trained, after which contents are copied to real memory. The hard part is the size limit and the cache setup, which must prevent evictions to a memory that does not exist.",
    k: ["Dedicated on-chip memory vs. locked cache lines: dedicated memory is simple and costs silicon; locked cache needs delicate setup and uses existing hardware.", "Run from flash with caching vs. copy code to temporary RAM: caching speeds execution and has rules; copying is simple and uses scarce space."],
    p: ["A stack deeper than the temporary space overwrites adjacent data silently.", "A cache line is evicted to nonexistent memory and data is lost, leading to random crashes."],
    v: "Fill the area with a pattern at startup, run to memory initialization, and report the maximum depth touched; confirm it is below the area size with margin.",
    dep: ["early-cpu-mode-setup", "reset-vector"]
  },
  "flash-image-mapping": {
    s: "How the firmware image is laid out in the flash chip and presented to the processor as readable memory, including regions, descriptors and write protection.",
    d: "The flash holds the reset code, firmware volumes, variable store, calibration data, a descriptor naming regions and their access permissions, and sometimes regions for other controllers. A controller maps flash into the processor's address space for reads, and exposes a separate path for writes. Region permissions and write-protect ranges are locked at boot. Build tools assemble the image so each region sits at its offset. The hard parts are reading speed from slow serial flash, alignment with erase blocks, and the order of locking.",
    k: ["One image vs. regions updated independently: one image is simple to sign and ship; independent regions cut update size and multiply versions.", "Lock write protection early vs. late: early locking resists attack and blocks updates; late locking leaves a window."],
    p: ["Variable store and code share an erase block, and a variable write erases code.", "Write protection is never locked on some units because the lock step is skipped on a fast boot path."],
    v: "Dump the flash with an external programmer and compare each region to the build output by offset and digest; then try to write a protected region from the running system and confirm it fails.",
    dep: ["power-sequencing-and-reset"]
  },
  "memory-module-detection": {
    s: "Reads each memory module's identification data to learn its size, speed, timing and organization, and decides which configuration the controller will use.",
    d: "Each module carries a small nonvolatile chip holding its parameters. Firmware reads these over a low-speed serial bus, checks that modules in the same channel are compatible, and picks the highest common speed and timing. Soldered memory skips this and uses fixed parameters from board configuration. The result is a configuration programmed into the controller before training. It is hard because modules lie, or are mixed, and because the configuration found here must be stable across every boot: a wrong value works until the machine is warm.",
    k: ["Read module data vs. fixed board configuration: reading supports upgrades; fixed configuration is simpler and only fits soldered memory.", "Run at the module's rated speed vs. a conservative speed: rated is faster and less stable on marginal boards; conservative is slower and safe."],
    p: ["A mixed pair of modules is run at the faster one's timing, and the slower one corrupts data when warm.", "The identification chip returns corrupt data on one read, and a bad configuration is chosen."],
    v: "Install each supported module type, compare the detected size, speed and ranks with the printed label and the controller's reported configuration, and boot ten times to confirm the same result.",
    dep: ["early-cpu-mode-setup", "boot-mode-straps"]
  },
  "memory-training": {
    s: "Tunes signal timing, voltage references and equalization between the controller and each memory module until data is read back reliably at the target speed.",
    d: "At high speeds, the signals on each wire arrive at slightly different times and levels, so the controller sweeps delay and reference settings, writes known patterns, reads them back, and selects values at the center of the passing region. It does this for each channel, rank and often each bit lane. Training takes from tenths of a second to many seconds on large servers. It is the most board-specific and time-consuming part of early boot, and a main reason firmware code is vendor-supplied binary.",
    k: ["Full training every boot vs. reuse saved results: full training adapts to temperature and aging and takes time; reuse is fast and can be stale.", "Aggressive margin vs. conservative margin: aggressive finds the best speed and fails on drift; conservative gives margin and loses speed."],
    p: ["Training passes on a cold board and fails once the board has warmed to operating temperature.", "A marginal module trains with almost no margin and crashes weeks later."],
    v: "Run the margin report after training on every channel and confirm each shows adequate eye width and height; then run a long pattern test at high temperature with zero errors.",
    dep: ["memory-module-detection", "cache-as-ram", "early-serial-console"]
  },
  "saved-training-data": {
    s: "Stores the results of memory training in nonvolatile storage so later boots can restore them and skip most of the tuning time.",
    d: "After a successful training, firmware writes the settings to a protected flash region together with a record of the configuration they apply to: module identifiers, speeds and firmware version. On the next boot, it checks that the configuration is unchanged, loads the saved values, runs a quick validation and continues. If anything differs, it trains again. This can cut seconds from the boot. It is hard because the saved data must be authentic, protected from the operating system, and invalidated by any change.",
    k: ["Fast restore vs. retrain each time: restore saves seconds on every boot, while retraining is simple and slowest.", "Validate the saved values with a quick test vs. trust them: a test catches drift at small cost; trusting is fastest and risky."],
    p: ["Data saved under one module set is applied after a module swap and the machine fails to start.", "Frequent rewrites of the region wear the flash."],
    v: "Boot twice and confirm via the timing trace that the second boot skipped full training; swap one module and confirm the next boot retrains and replaces the saved data.",
    dep: ["memory-training", "flash-image-mapping", "persistent-state-and-wear"]
  },
  "memory-test-and-ecc-init": {
    s: "Writes and reads patterns across memory, and initializes error-correction check bits, so that later reads of never-written memory do not report false errors.",
    d: "Memory with error correction stores extra bits that must be consistent with the data, so every location must be written once before it is read. Firmware sweeps all of memory, which takes seconds on large machines, and optionally tests it with patterns to find stuck bits. Faulty ranges are excluded from the memory map. It also enables background scrubbing and error reporting. The hard parts are the time cost on large memory, partial testing policies, and reporting errors usefully.",
    k: ["Full test every boot vs. a quick or skipped test: full testing finds latent faults and takes minutes on large machines; quick testing is fast and leaves faults.", "Zero memory in firmware vs. let the kernel do it: firmware zeroing is required for correction bits and duplicates the kernel's work."],
    p: ["Uninitialized ECC causes a spurious uncorrectable error on the first read, and the machine resets.", "A failing range is not excluded from the map and the kernel allocates it."],
    v: "Inject a stuck bit with a test module and confirm firmware logs the failing address, excludes the range, and the kernel's usable memory is reduced by that range.",
    dep: ["memory-training", "memory-map-construction"]
  },
  "firmware-relocation-to-ram": {
    s: "Copies firmware code and data from flash or temporary memory into main memory, then continues from there, because flash is slow and temporary space is small.",
    d: "Once memory works, the early phase allocates a region, copies the next phase and its data, switches the stack to main memory, enables full caching and jumps to the copy. Sometimes the code is decompressed during the copy. After that, the firmware has a heap and can use richer code. The temporary memory is released. It is hard because pointers to temporary memory are invalid after the switch, and the copy must preserve what earlier phases recorded, such as the hand-off list.",
    k: ["Execute in place from flash vs. relocate to memory: execute in place avoids copying and runs slowly; relocation costs copy time and gives speed.", "Relocate to the top of memory vs. a low fixed address: the top keeps low memory for the kernel; a low address is simple and constrains layout."],
    p: ["A saved pointer to the temporary stack is used after the switch and corrupts memory.", "Firmware occupies a range later reported as usable in the map."],
    v: "Print the program counter and stack pointer just before and after relocation: both must move from temporary regions to the main memory region, and the next phase must read the same handoff list.",
    dep: ["memory-training", "cache-as-ram", "memory-map-construction"]
  },
  "memory-map-construction": {
    s: "Builds firmware's own list of physical memory ranges and their roles: usable, reserved for devices, firmware code and data, tables, and holes.",
    d: "Firmware combines installed memory from the controller, fixed holes where devices map their registers, regions it reserves for itself, the temporary regions it used, and ranges excluded after testing. It keeps the map current as allocations occur and presents it through boot services. The final copy is given to the kernel. It is hard because of the many sources of truth: controller decoders, device windows and reservations must agree, and remapping memory around holes produces ranges at odd addresses.",
    k: ["One authoritative map in firmware vs. each phase tracking its own: one map prevents disagreement and needs an early, shared structure; per-phase maps are simple and diverge.", "Report adjacent same-type ranges merged vs. separate: merged is compact and loses allocation detail; separate is detailed and noisy."],
    p: ["A device register window is omitted and the kernel allocates it as ordinary memory.", "Remapped memory above the 4-gigabyte line is lost from the map and never used."],
    v: "Sum the usable ranges and compare with installed memory minus all reserved areas; check that every device register window appears as reserved and that no ranges overlap.",
    dep: ["memory-module-detection", "memory-test-and-ecc-init"]
  },
  "early-serial-console": {
    s: "A text output line, usually a simple serial port, brought up in the earliest code so boot progress and errors can be seen before any display works.",
    d: "Firmware programs a serial controller with a baud rate, using a clock that may not yet be calibrated, and writes characters by polling a status register. Output usually goes through a thin logging layer with levels, so verbosity is selectable. Input is also available for menus. Because every later stage can reuse it, it is the standard debugging channel for boards and servers. The hard parts are getting the clock right before the clock tree is configured, and the fact that output is slow and can change timing.",
    k: ["Polled output at all times vs. buffered output: polling is simple and slow and works before interrupts; buffering is fast and needs setup.", "Verbose by default vs. quiet by default: verbose helps every failure and costs boot time; quiet is fast and silent when it matters."],
    p: ["Wrong clock assumption yields garbled output that looks like a hang.", "Verbose serial output adds seconds to boot through slow polled writes."],
    v: "Connect a terminal at the documented rate, power on, and confirm the first line appears before memory initialization and the full log reaches the loader's menu without garbled characters.",
    dep: ["early-cpu-mode-setup", "reset-vector"]
  },
  "post-codes": {
    s: "Single values written to a fixed output, such as a port decoded to a display or LEDs, marking each step of boot so the last one shows where it stopped.",
    d: "Firmware writes a number at the start of each step to a port that hardware decodes to a two-digit display, a set of lights or a management controller. Codes are defined per vendor and map to steps such as memory detection, device enumeration or loader start. When boot hangs, the last code points to the failing step, even with no serial line. Error conditions use beep patterns or distinct values. The hard part is meaning: codes are vendor-specific, and a code only says the step began.",
    k: ["Codes at every step vs. only at phase boundaries: every step gives fine location and adds code and noise; boundaries are coarse.", "Hardware display vs. reporting through the management controller: a display needs no software, and a controller can log history remotely."],
    p: ["A code is written before the step starts, and the failure is blamed on the previous step.", "Two vendors' modules reuse the same value for different steps."],
    v: "Force a failure at a known step, such as removing memory, and confirm the displayed code matches the documented value for that step and stays after the hang.",
    dep: ["reset-vector", "platform-init-phases"]
  },
  "debug-probe-access": {
    s: "Hardware debug connections that halt the CPU, read registers and memory, set breakpoints and reprogram flash, used to diagnose failures before any software console exists.",
    d: "A small connector exposes a debug interface of the chip. A probe attached to it can halt the CPU at the reset vector, step instructions, inspect memory, and load code or flash. It works even when firmware is corrupt or has crashed. It is used in bring-up, manufacturing and field failure analysis. Access must be controlled in production: an open port bypasses verification. The hard parts are probes that change timing, multi-core coordination and getting access to a locked part.",
    k: ["Probe access on production units vs. removed: present helps analysis and is an attack path; removed is secure and loses diagnostics.", "Boundary scan only vs. full CPU debug: boundary scan is safe and limited; full debug is powerful and sensitive."],
    p: ["The debug connector is not populated on production boards, and failures cannot be examined.", "Debug access is left enabled on units shipped to customers."],
    v: "Attach a probe to a development unit, halt at the reset vector, read the first instruction and a memory range, then confirm the same attempts fail on a production-locked unit.",
    dep: ["reset-vector", "debug-port-lockdown"]
  },
  "boot-log-buffer": {
    s: "A memory region where every stage appends log messages, which later stages and the kernel can read, so output is not lost when no console is attached.",
    d: "A ring buffer in reserved memory holds timestamped text from firmware and loaders. Each stage continues writing where the last stopped, and the kernel imports it into its own log. This captures messages from stages that ran before any console existed, and from machines with no serial line. It survives warm resets if memory is retained. The hard parts are reserving the memory so nobody reuses it, a format all stages agree on, and limiting size so a verbose stage does not push out the early messages.",
    k: ["Shared ring buffer vs. per-stage logs: shared gives one story in order and needs an agreed format; per-stage logs are independent and awkward to merge.", "Overwrite oldest vs. stop when full: overwriting keeps the latest; stopping keeps the earliest, which usually matter more for boot failure."],
    p: ["The region is not in the memory map as reserved and is overwritten before the kernel imports it.", "Messages are lost across a stage handoff that did not pass the buffer address."],
    v: "Boot without a serial console, then read the kernel's log and confirm firmware and loader messages appear first, in order, with timestamps that increase across stage boundaries.",
    dep: ["memory-map-handoff", "boot-parameters-block", "early-serial-console"]
  },
  "boot-timing-trace": {
    s: "Timestamps recorded at stage and step boundaries, so engineers can see where boot time goes and detect regressions between builds.",
    d: "Each phase records a counter reading at its start and end into a table in memory, passed through the handoff to the kernel and exported to tools. Plotting the table shows what dominates: memory training, device enumeration, disk spin-up or network wait. Teams track it per release as a budget. The hard parts are a counter that runs from reset and survives phase changes, accounting for time before the counter starts, and measuring without altering what it measures.",
    k: ["Fine-grained timestamps vs. per-phase only: fine detail pinpoints slow drivers and fills the table; per-phase is compact and may hide the cause.", "Always on vs. debug builds only: always on catches regressions in the field at small cost; debug only is free and misses real units."],
    p: ["The counter restarts at a stage boundary and the totals look shorter than reality.", "Time before the first timestamp, in the ROM and power-up, is not counted and the budget looks met."],
    v: "Compare the sum of recorded phase times with an external measurement from power-good to kernel start using a probe, and confirm they agree within a small known offset.",
    dep: ["interrupt-and-timer-init", "boot-parameters-block"]
  },
  "trust-boundaries": {
    s: "A decision about what each stage may assume about the one before it, the data it receives, and which inputs, such as configuration and ramdisks, stay outside verification.",
    d: "Every handoff crosses a boundary where the next stage either checks what it received or trusts it. Choices include which keys anchor each link, whether configuration files are verified, whether the operating system may write boot variables, and whether a person at the keyboard counts as trusted. A gap anywhere, such as an unsigned ramdisk or an editable command line, makes the verification above it moot. Choosing explicitly and writing it down is the cross-cutting work; the components only implement it.",
    k: ["Verify every input vs. trust configuration from a protected volume: verifying everything closes gaps and complicates updates; trusting a protected volume is simple and depends on that protection.", "Physical access in the threat model vs. out: including it demands encryption and lockdown; excluding it is cheaper for machines in controlled rooms."],
    p: ["A stage assumes the previous one verified a file, and the previous one assumed the same of it.", "Policy differs between firmware and loader, so unsigned entries run in one path only."],
    v: "Make a table listing each input to each stage with the check applied and its key; modify each input in turn on a test machine and confirm all modifications are caught or documented as accepted.",
    dep: ["verified-boot-chain", "hardware-root-of-trust"]
  },
  "recoverability": {
    s: "A decision that every failure in the boot path leaves a way back to a working machine, from a single bad update up to corrupted firmware, without opening the case.",
    d: "It requires deciding which failures are survivable and by what mechanism: slot rollback for a bad kernel, a recovery entry for a damaged system volume, a protected recovery image for damaged firmware. Each mechanism must not share failure causes with what it protects. It also decides how recovery is triggered, automatically or by a person, and how it is secured. Recoverability costs storage, hardware and test effort, and is only real if it has been exercised. Untested recovery paths fail when needed.",
    k: ["Automatic recovery vs. human-triggered: automatic suits unattended fleets and can loop or mask faults; human-triggered is controlled and needs someone present.", "Redundant copies vs. a small recovery loader: copies recover fully and cost storage; a small loader costs less and restores less."],
    p: ["Recovery relies on the same flash chip that failed.", "A recovery path was never tested after a layout change and fails when first used."],
    v: "Inject each failure class on a test unit, including corrupted firmware region, kernel and configuration, and confirm each recovers to a booted system within the documented time with no manual hardware change.",
    dep: ["firmware-recovery-image", "automatic-rollback", "rescue-environment"]
  },
  "boot-time-budget": {
    s: "A decision about how many seconds the boot may take and how that time is divided among stages, because every added driver, test or wait is paid on every boot.",
    d: "Server firmware may accept minutes for memory test and device scan, while an appliance or vehicle may need a fraction of a second. The budget drives choices: saved training data, skipped tests, lazy driver loading, small kernels, parallel initialization, and no menu delay. Each step has a measured cost in the timing trace. Budget is a cross-cutting constraint because savings need agreement across stages, and security measures such as verification and measurement add cost that must be planned for.",
    k: ["Optimize time to first output vs. time to a usable system: early output reassures people, and the second metric is what users feel.", "Skip checks for speed vs. keep them: skipping saves seconds per boot and loses fault detection; keeping is safer and slower."],
    p: ["Each team adds a small delay for its own reasons, and the total triples without anyone noticing.", "A timeout tuned for the lab is too short on slow production hardware, causing sporadic failures."],
    v: "Track boot timing per release from the trace on a reference unit and fail the build when any phase exceeds its allotted time by more than a set margin.",
    dep: ["boot-timing-trace", "saved-training-data"]
  },
  "hardware-diversity": {
    s: "A decision about how many boards, chip revisions and add-in devices one boot image must support, and where per-platform differences are isolated.",
    d: "A single firmware image for many boards needs discovery, tables and configuration data, and drivers that adapt. A per-board image is simpler and multiplies builds and updates. The choice affects every layer: memory configuration, device trees, loader drivers, kernel entry state. Standards such as hardware tables and shared handoff protocols exist to keep differences out of upper stages. Diversity also drives testing cost: each hardware combination can fail in its own way, and many boot bugs appear only on one board.",
    k: ["One generic image vs. per-board images: generic reduces builds and needs runtime discovery; per-board is simple and expands releases.", "Isolate differences in firmware vs. in the loader and kernel: firmware isolation keeps the kernel generic and trusts vendors; upper-layer handling is under your control and duplicates work."],
    p: ["A generic image passes tests on common boards and fails on one rare configuration.", "Board-specific workarounds in the loader accumulate with no record of which hardware needs them."],
    v: "Boot the release image on a matrix of every supported board and revision in a test rack and confirm all reach the same kernel state, with the timing trace and log within limits.",
    dep: ["hardware-description-tables", "device-tree-blob"]
  },
  "stage-ordering-and-state": {
    s: "A decision about which stage owns what state at each moment, how it is passed on, and which hardware or memory configuration each stage may assume or must restore.",
    d: "Boot is a relay where the baton is memory contents, device state and CPU mode. Each stage must know what the previous left configured, such as caches, interrupt controller, clocks and memory map, and what it must leave for the next. Undocumented side effects are the main source of boot bugs. The rule of one owner per resource at a time, with explicit handoff structures, keeps ordering understandable. Stages written by different organizations make this hard: the contracts between them are the real interface, and they change.",
    k: ["Explicit handoff structures vs. implicit shared state: explicit structures are verifiable and add boilerplate; implicit sharing is quick and breaks on change.", "Stages quiesce devices before handoff vs. leave them running: quiescing gives clean state and costs time; running devices save time and surprise the next stage."],
    p: ["A stage leaves DMA active into memory the next stage reuses, and data is corrupted after handoff.", "A stage changes its assumptions about cache state and the unchanged next stage reads stale data."],
    v: "At each stage boundary, dump a defined set of device and CPU state and compare it with the written contract for that boundary; any mismatch must be explained by a documented exception.",
    dep: ["boot-protocol-contract", "stage-chain-design", "cpu-state-at-entry"]
  },
  "persistent-state-and-wear": {
    s: "A decision about which state survives reboot, where it lives, and how often it may be written, given that flash wears out and writes can be interrupted by power loss.",
    d: "Boot depends on small persistent items: boot order, one-shot flags, attempt counters, security version counters, saved training data, entropy seeds and logs. Each needs a home, firmware variables, a loader file or protected counters, with different durability and access control. Frequent writers, like counters updated every boot, must be spread across blocks or placed in storage rated for it. Every write must tolerate power loss mid-operation. These decisions are made once and affect update, rollback, security and speed.",
    k: ["Store in firmware flash vs. on the storage device: firmware flash is available early and wears; the storage device has capacity and needs a driver and trust.", "Write on every boot vs. only on change: every-boot writes give fresh counters and consume endurance; change-only saves flash and misses crashes."],
    p: ["A counter incremented each boot wears out a flash block in a year of heavy use.", "A power loss during a multiword update leaves two fields inconsistent and the loader misreads the slot state."],
    v: "Compute writes per boot per storage location, multiply by the expected boots over product life, and confirm it is under each location's rated cycles; interrupt writes at random times and confirm the state stays consistent.",
    dep: ["variable-store-persistence", "boot-attempt-counters", "saved-training-data"]
  },
});
