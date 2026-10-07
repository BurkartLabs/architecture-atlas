// Bootloader details, part 1: selection and configuration, update and recovery, kernel handoff.
ATLAS.details("bootloader", {
  "boot-device-selection": {
    s: "Chooses which storage device, network interface or removable medium to try first, using the stored boot order and what is actually present at power-on.",
    d: "Firmware walks an ordered list of candidates, checks each for a bootable layout or a loader at a known path, and runs the first that works. Candidates may be stored as device paths, so a removable disk or a network card that is absent is skipped quietly. Selection also has to handle hot-plugged media, devices that take seconds to spin up, and several identical disks. It is hard because the list names hardware by path, and paths change when a card moves slots or a controller is replaced.",
    k: ["Device-path entries vs. class-based search (any disk, then any network): paths are precise but go stale when hardware moves; class search survives changes but may boot the wrong disk.", "Waiting for slow devices vs. booting fast: a longer timeout finds late disks but delays every boot on machines without them."],
    p: ["A replaced disk controller changes every stored device path, and the machine drops to the menu with no valid entry.", "A stale removable disk left in a slot is selected before the internal disk and boots an old system."],
    v: "Boot with two bootable disks present, change the order, and confirm on the console which device the loader was read from each time. Remove the first and confirm the second is used.",
    dep: ["firmware-variables", "boot-services", "partition-table-parsing"]
  },
  "boot-menu": {
    s: "An interactive list shown at boot, driven by keyboard or serial input, that lets a person pick an entry, edit arguments, or enter firmware settings for this boot only.",
    d: "The menu reads the entries the configuration provides, draws them on a text or graphical console, and waits for a key until a timeout expires. It usually offers a way to edit the command line, pick a recovery entry, or jump to the firmware settings. It must work with only the console the loader has: a serial line, a basic framebuffer, or both at once. The hard parts are input on devices that firmware drives badly, and not becoming a way for anyone at the keyboard to bypass the trust chain.",
    k: ["Menu hidden unless a key is held vs. always shown with a timeout: hiding is faster and cleaner, but users cannot discover recovery options.", "Editable command line vs. locked entries: editing helps recovery, but on an unattended machine it hands root access to anyone with a keyboard."],
    p: ["Input arrives over a USB stack that the loader initialized late, so the key press is missed and the menu flashes past.", "An editable command line on a secure-boot machine lets someone disable the kernel's integrity checks."],
    v: "Hold the menu key at power-on over both serial and the local console, select a non-default entry and confirm the kernel starts with that entry's arguments. With editing locked, confirm the edit key is ignored.",
    dep: ["boot-entry-specification", "input-and-display-init", "early-serial-console"]
  },
  "boot-configuration-files": {
    s: "Text or binary files on the boot volume that list entries, defaults, timeouts and paths, read by the loader instead of being compiled into it.",
    d: "The loader locates a configuration at a known path on the system partition, parses it, and builds its entry list. Formats range from a scripted language with variables and conditionals to flat key-value drop-in files, one per installed kernel. Because it is read at every boot, a parse error can leave the machine without a menu, so loaders tend to keep a built-in default. The difficulty is regeneration: package tools write these files, and a broken generator or a half-written file is a common source of unbootable systems.",
    k: ["Scripted configuration vs. declarative drop-in files: scripting is flexible but needs an interpreter and can hide errors; declarative files are easy to validate and merge.", "One generated file vs. one file per entry: a single file is simple to read, but every kernel install rewrites it; drop-ins let installs touch only their own entry."],
    p: ["A power loss during a rewrite leaves a truncated file and no usable entries.", "The loader's filesystem driver cannot read the volume where a tool put the new configuration, so edits silently have no effect."],
    v: "Corrupt the configuration file on a test volume and reboot: the loader should fall back to its default or recovery entry and print the parse error, not hang.",
    dep: ["filesystem-readers", "system-partition-conventions"]
  },
  "boot-entry-specification": {
    s: "A defined format for one bootable choice: the kernel path, ramdisk paths, arguments, a title and a sort key, so several tools can add and remove entries safely.",
    d: "Each entry is a small file or variable naming the images to load, the arguments to pass, and metadata such as version and machine identity. Installers drop a new entry when they add a kernel, and the loader sorts entries by version and a priority key. The point of a shared specification is that the kernel package, the loader and the menu need not know each other. What makes it hard is that paths are relative to a volume the loader must identify, and version sorting rules differ subtly between tools.",
    k: ["Per-entry files vs. a monolithic list: per-entry files let independent packages cooperate without locking, but need a defined sort order and a cleanup policy.", "Paths by partition identifier vs. by device name: identifiers survive reordering but need discovery at boot; names are simple but wrong after hardware changes."],
    p: ["Old entries accumulate until the system partition fills and the next kernel install fails halfway.", "Two tools disagree about version ordering, so the default entry is an older kernel than the one installed."],
    v: "Install two kernel versions, list entries from the loader, and confirm the newest is the default and both appear with correct paths. Delete one entry file and confirm it disappears from the menu.",
    dep: ["boot-configuration-files", "volume-naming-and-discovery"]
  },
  "kernel-command-line": {
    s: "The text string the loader passes to the kernel that selects the root device, console, debug options and feature switches for this boot.",
    d: "The loader assembles the string from the entry's arguments plus anything the user edited or the firmware supplied, then places it in memory and records its address in the handoff structure. The kernel parses it very early, before its own configuration exists, so it decides the root filesystem, the console device and whether security features are on. It is hard because it is a free-form string with no schema, a size limit, and a security role: whoever controls it can weaken the system.",
    k: ["Arguments baked into a signed image vs. editable text: baked-in arguments are tamper-proof but need a rebuild to change; editable text is flexible and unauthenticated.", "Root device by stable identifier vs. by device name: identifiers survive disk reordering, but need the ramdisk to resolve them."],
    p: ["A root device named by enumeration order points at the wrong disk after a new drive is added.", "A string longer than the handoff limit is silently truncated, dropping the last option."],
    v: "Boot with an extra argument, then read the kernel's recorded command line after startup and compare it byte for byte with the entry plus the added argument.",
    dep: ["boot-entry-specification", "boot-parameters-block"]
  },
  "one-shot-boot-request": {
    s: "A flag, stored where it survives reboot, that makes the next boot only use a named entry or enter firmware settings, then clears itself.",
    d: "The running system writes a firmware variable or a loader-owned file naming an entry, then reboots. The loader reads the request, deletes it before booting, and runs that entry once. This lets software reboot into an installer, a recovery tool or a test kernel without altering the permanent default. It is hard because clearing must happen before the entry runs: if it is cleared after, a crash loops forever, and if the write fails the machine keeps rebooting into the one-shot target.",
    k: ["Clear before boot vs. clear after success: clearing first prevents loops but loses the request on a crash; clearing after retries, but can loop forever.", "Store in firmware variables vs. on the boot volume: variables need no filesystem driver but wear flash and vary by platform; files are portable but need a readable volume."],
    p: ["A read-only variable store makes the request impossible to clear, so the machine boots the recovery entry on every restart.", "The request names an entry that was deleted, and the loader quietly boots the default instead."],
    v: "Request a one-shot entry, reboot and confirm that entry runs; reboot again without any action and confirm the default entry runs and the stored request is gone.",
    dep: ["firmware-variables", "boot-entry-specification", "runtime-services"]
  },
  "boot-order-policy": {
    s: "The rules deciding which entries and devices are tried in what order, and what happens when one fails: skip, retry, or stop at the menu.",
    d: "Policy combines a device order, an entry priority, per-entry attempt limits and a failure action. After a failed load or a kernel that never reports success, the policy picks the next candidate. Simple machines try each device once; fleet systems count attempts per slot. The difficulty is distinguishing a loader that failed from a kernel that started and then crashed, since only the second has run enough to count as an attempt, and the policy must avoid both infinite loops and giving up too early.",
    k: ["Fall through to the next entry vs. stop with an error: falling through keeps the machine reachable, but can hide a persistent fault and boot something stale.", "Policy in firmware vs. in the loader: firmware policy applies to every loader, but is hard to change; loader policy is easy to update and invisible to firmware tools."],
    p: ["Every candidate fails and the policy restarts forever, so the machine never reaches a state a human can see.", "Falling through boots an older, vulnerable kernel after the new one fails verification."],
    v: "Make the first entry unbootable on a test machine and confirm the second boots and the console records the failure reason. Make all entries fail and confirm it stops at a visible error.",
    dep: ["boot-device-selection", "boot-attempt-counters", "firmware-variables"]
  },
  "boot-splash-and-progress": {
    s: "A logo, progress bar or status text shown during boot so a person can tell the machine is working, drawn by firmware or by the loader.",
    d: "Firmware draws a logo on the framebuffer it obtained from a display driver, and a loader may add text or a progress indicator. A common design hands the same framebuffer to the kernel so the image stays until the real graphics driver takes over. It trades information for polish: errors may be hidden behind a logo, and a splash must be removable. Hard parts are modes that the display does not support, and the kernel resetting the display and causing a visible flicker or blank screen.",
    k: ["Splash hiding all text vs. verbose output on demand: hidden text looks finished, but a hung boot gives no clue unless a key reveals the log.", "Keep the firmware mode vs. switch mode in the kernel: keeping avoids flicker, but can leave an awkward resolution until the driver loads."],
    p: ["A hung boot shows only a static logo, and no error is visible without a serial console.", "The splash image is read from an unsigned location and becomes a way to run a malformed-image exploit in firmware."],
    v: "Boot normally and photograph the screen at one-second intervals: the logo should persist without a blank gap to the login screen. Hold the reveal key and confirm the boot log appears.",
    dep: ["input-and-display-init", "framebuffer-handoff"]
  },
  "firmware-update-capsules": {
    s: "A signed container holding a new firmware image plus metadata, handed to firmware to apply on the next boot rather than written by the running system directly.",
    d: "The operating system or a tool stages the capsule in memory or on a system partition and sets a request flag. On reboot, early firmware finds it, verifies the signature and version policy, and writes the new image to flash from a protected context. The capsule format carries target identifiers, version numbers and sometimes several payloads. This indirection exists because the running system cannot be trusted to write flash and because flash cannot be updated while code executes from it. The hard part is surviving a power loss mid-write.",
    k: ["Apply during boot vs. apply from the running system: boot-time apply is safer and tamper-resistant, but costs a reboot and a longer first boot.", "One capsule per device vs. a bundle: bundles keep versions consistent but couple unrelated parts, so one bad component blocks the whole update."],
    p: ["The version check accepts older capsules, so an attacker downgrades firmware to one with a known flaw.", "The capsule is staged on a volume the loader cannot read, so the request is silently ignored."],
    v: "Stage a capsule with a higher version, reboot, and confirm the firmware version string changed and the update result variable reports success. Stage a tampered capsule and confirm rejection with the old version intact.",
    dep: ["update-staging-and-apply", "verified-boot-chain", "firmware-variables"]
  },
  "update-staging-and-apply": {
    s: "The sequence that writes a new image to flash or a spare slot, verifies it, switches over, and confirms success, built so a failure at any step leaves a bootable copy.",
    d: "Writing is done in steps: erase, program, read back, verify a digest, then flip a pointer or flag that selects the new image. Flash erases whole blocks, so the sequence must never leave the only copy half-written. Systems keep the old image until the new one has booted and reported health. The hard parts are the single-step commit, which must be atomic under power loss, and write endurance: updates that touch variable storage or boot counters on every boot wear flash.",
    k: ["In-place update with a recovery copy vs. write to a spare slot and switch: in-place needs less flash but recovery depends on a small trusted image; spare slots cost space and are safer.", "Verify before commit vs. verify after first boot: verifying first stops bad images early, but only a boot proves they actually work."],
    p: ["The pointer flip is not atomic, and a power cut leaves it half-set so neither slot is selected.", "The readback matches the staged data, but the staged data was corrupted before the checksum was taken."],
    v: "Cut power at several random points during an update on a test unit; every time, the unit should boot into either the old or the new image, never neither.",
    dep: ["flash-image-mapping", "ab-slot-layout", "firmware-recovery-image"]
  },
  "ab-slot-layout": {
    s: "Two complete copies of the boot payload, one active and one spare, with a small piece of state saying which to try, so an update never overwrites what is running.",
    d: "Each slot holds the kernel, ramdisk and sometimes the root filesystem. The loader reads a slot-selection record, boots the preferred slot, and falls back to the other on failure. An update writes the inactive slot, marks it as a trial, and reboots into it. The cost is doubled storage and the discipline of keeping both slots compatible with shared data such as user partitions. The hard part is the schema of the shared state: a new slot may migrate data in a way the old slot cannot read after a rollback.",
    k: ["Full duplicate slots vs. a recovery partition: duplicates give seamless rollback but double storage; a recovery partition is small but reinstalls rather than reverts.", "Shared data migrated forward vs. kept compatible both ways: forward migration is simpler but makes rollback lossy; compatibility is stricter to write."],
    p: ["The inactive slot was never booted, so a defect in it is found only when the active slot fails, at the worst time.", "A data migration in the new slot makes rolling back lose or corrupt user data."],
    v: "Update the inactive slot, boot it, then force a failed health check: the loader should return to the original slot, and the original should start with user data intact.",
    dep: ["boot-attempt-counters", "partition-table-parsing", "boot-order-policy"]
  },
  "boot-attempt-counters": {
    s: "A small persistent counter, decremented each time a trial image boots and reset when the system reports itself healthy, which triggers rollback when it reaches zero.",
    d: "The loader reads the count for the chosen slot, decrements it, writes it back before booting, and runs the image. Once the operating system has run long enough and passed its checks, it marks the slot good and resets the count. If the image crashes or hangs, the machine reboots, the counter reaches zero, and the loader switches slots. The state must be written atomically to storage the loader can modify, and a hardware watchdog is needed to turn a hang into a reboot. Writing flash on every boot limits endurance.",
    k: ["Decrement before boot vs. after: decrementing first counts crashes that never return, but also counts clean reboots during an update; after-the-fact counts miss hangs.", "Counter in firmware variables vs. a loader-owned block: variables are standard but may be slow or limited; a raw block is fast and uses wear leveling you manage."],
    p: ["The watchdog is not armed until the kernel starts, so a loader-stage hang never counts as an attempt.", "A slow first boot after a large update is mistaken for failure and triggers rollback."],
    v: "Set a trial slot with a count of three and a kernel that always hangs. Confirm the board reboots exactly three times, then boots the previous slot and logs the rollback.",
    dep: ["ab-slot-layout", "firmware-variables", "boot-order-policy"]
  },
  "automatic-rollback": {
    s: "Returns to the previous known-good image without a person, when a new image fails to boot or fails its own health checks within a set number of tries.",
    d: "The loader chooses the previous slot when attempts are exhausted or when a failure is recorded explicitly, for example by a verification error. It then marks the failed slot as bad so it is not retried until a new update replaces it, and records a reason that the running system can report. Rollback must not undo a security fix, so it is paired with a minimum-version counter. The hard part is deciding what counts as healthy: too little checking misses a broken network driver, too much rolls back on a transient fault.",
    k: ["Rollback on any failure vs. only on definite failures: aggressive rollback protects availability, but can bounce between images on transient faults.", "Allow rollback to older versions vs. enforce a minimum: allowing rollback restores service after a bad release, but also lets an attacker restore a vulnerable one."],
    p: ["The rollback target is itself outdated beyond the minimum version and refuses to boot, leaving no usable slot.", "The failed slot is not marked bad, and the update agent retries it endlessly."],
    v: "Deploy an image that boots but never signals health, and confirm the machine returns to the previous image, reports a rollback reason, and does not retry the bad image on later boots.",
    dep: ["boot-attempt-counters", "ab-slot-layout", "revocation-and-rollback-protection"]
  },
  "fallback-boot-paths": {
    s: "Alternative ways to reach a working system when the preferred entry fails: a second kernel, a removable device, a network image or a minimal built-in shell.",
    d: "Fallbacks are ordered from least to most drastic. A loader tries an older kernel on the same volume, then a recovery entry, then other devices, then the network, and finally stops in a firmware or loader prompt. Each rung has its own dependencies: it must not require the component that just failed. The design question is which failures are survivable. A damaged filesystem on the system partition defeats every rung that reads from it, so the last rungs should depend on nothing local.",
    k: ["Many fallback rungs vs. fail fast to a prompt: more rungs raise the chance of a boot but make failures take minutes and hide the first fault.", "Fallback on the same volume vs. on separate media: same-volume is convenient, but one corruption removes both; separate media survives that and costs hardware."],
    p: ["Fallback entries rely on the same corrupted filesystem as the primary and fail the same way.", "A silent fallback to an old kernel makes operators think the update succeeded."],
    v: "Corrupt the primary kernel file on a test system and confirm the loader boots the fallback, prints which entry failed and why, and the running system can read that record.",
    dep: ["boot-order-policy", "rescue-environment", "boot-device-selection"]
  },
  "rescue-environment": {
    s: "A minimal bootable system, with a shell and repair tools, kept separate from the main system for repairing storage, configuration and boot files.",
    d: "It is a small kernel and ramdisk, often with network access and basic disk tools, stored on a separate partition, removable media or the network. Its job is to run with the least possible dependence on the failed system: it needs no mounted root, only drivers for the storage and a shell. The difficulty is keeping it current enough to read modern filesystems and encrypted volumes, and keeping it secure, since a shell with disk access is also a way to bypass protections.",
    k: ["Built-in rescue image vs. external media: built-in is always there and can go stale; external media is current but may not be at hand when needed.", "Authenticated rescue shell vs. open shell: authentication stops a bystander from reading data, but locks out the owner who has lost the credential."],
    p: ["The rescue image lacks the driver for a newer controller, so the disk it must repair is invisible.", "An unauthenticated rescue shell exposes unencrypted data on an unattended device."],
    v: "Boot the rescue entry on a machine whose main root filesystem is deleted, mount the data volume, and restore a boot file from the shell, then boot the main entry.",
    dep: ["initial-ramdisk-loading", "filesystem-readers", "fallback-boot-paths"]
  },
  "firmware-recovery-image": {
    s: "A protected, rarely changed copy of firmware, or a minimal bootstrap, kept so a failed update can be repaired without opening the machine.",
    d: "Flash is split into a locked region with a small trusted recovery loader and an updatable region with the main firmware. If verification of the main image fails, the boot ROM or recovery loader runs instead and offers a way to reflash, from removable media, the network or a host connection. The recovery region is write-protected by hardware and rarely updated. The difficulty is making recovery small enough to trust yet capable enough to find a source and write flash, and keeping it from becoming an unsigned backdoor.",
    k: ["Write-protected recovery region vs. updatable recovery: protected recovery cannot be corrupted, but cannot be fixed if it has a bug; updatable recovery can be repaired and attacked.", "Automatic recovery vs. a manual trigger such as a jumper: automatic is convenient, but a manual trigger prevents repeated reflash loops and abuse."],
    p: ["Recovery image verification uses a key that has since been revoked, so recovery refuses its own update source.", "The recovery path accepts any file on removable media and bypasses the verified chain."],
    v: "Erase the main firmware region on a test unit and power on: the unit should boot recovery, accept a signed image from the documented source, and reach normal boot afterward.",
    dep: ["flash-image-mapping", "hardware-root-of-trust", "boot-rom"]
  },
  "boot-protocol-contract": {
    s: "The written agreement between a loader and a kernel: image format, entry point, register and memory state at entry, and the structure that carries boot information.",
    d: "A protocol states where the kernel may be loaded, what alignment it needs, which CPU mode it is entered in, which registers hold pointers, and what must be left untouched. Versioning fields let old kernels run under new loaders and the reverse. Standardizing a protocol lets several loaders boot several kernels. It is hard because the contract is mostly implicit side effects: interrupt state, cache state, which memory ranges are still owned by firmware. A mismatch usually shows as a hang with no output.",
    k: ["A shared, versioned protocol vs. loader-specific handoff: a shared protocol makes loaders interchangeable, but freezes decisions and needs long compatibility support.", "Strict minimal state vs. permissive state at entry: a strict contract is easy to test, but makes kernels carry more setup code."],
    p: ["A new loader leaves interrupts enabled where the kernel expects them off, and it crashes before printing anything.", "A protocol field is ignored by old kernels, which then use a default that conflicts with the new loader's choice."],
    v: "Boot the same kernel from two different loaders implementing the protocol and compare the kernel's earliest recorded view of registers and memory map; they should match the contract.",
    dep: ["cpu-state-at-entry", "boot-parameters-block", "memory-map-handoff"]
  },
  "memory-map-handoff": {
    s: "The list of physical address ranges, each tagged usable, reserved, firmware-owned or device memory, passed to the kernel so it knows which memory it may use.",
    d: "The loader obtains the map from firmware, adjusts it for regions it used (the kernel image, ramdisk, tables), and passes the final form. The kernel builds its page allocator from the usable ranges and avoids the rest. Firmware may change the map during boot, so the loader must ask for it last and finish exactly after that. The hard part is correctness at the edges: overlapping entries, ranges that are usable only after boot services end, reclaimable regions holding tables, and memory above what the first stage can address.",
    k: ["Pass the raw firmware map vs. a normalized one: raw preserves detail but burdens every kernel; normalized is easier to consume but can lose type distinctions.", "Reclaimable regions marked usable early vs. late: early reuse recovers memory, but the kernel may overwrite tables it still needs to read."],
    p: ["The loader allocates memory after taking the map, so the kernel treats the loader's pages as free and overwrites its own ramdisk.", "A reserved range for a device is reported as usable, and a driver later corrupts that device's state."],
    v: "Dump the map seen by the kernel and compare it to the firmware's map plus the loader's allocations: every loaded image must sit in a range not marked usable, and total usable memory must match the installed modules minus reserved ranges.",
    dep: ["memory-map-construction", "boot-services", "exit-boot-services"]
  },
  "hardware-description-handoff": {
    s: "Passes the kernel a pointer to the tables or tree describing the platform's devices, interrupts and power controls, so it can configure hardware it cannot discover itself.",
    d: "On one class of platform, firmware builds a set of linked tables and gives the kernel the address of the root table; on another, the loader passes a flattened device tree. The kernel parses them to find interrupt controllers, timers, buses and memory. The loader may patch the description before handoff to add the ramdisk location, the command line, or disable a node. The difficulty is that the description is a contract written by firmware authors and consumed by kernel authors, and errors are subtle: wrong interrupt numbers, missing power domains.",
    k: ["Tables built by firmware vs. a tree bundled with the kernel: firmware tables fit one image to many boards, but kernel-bundled trees give predictable behavior and fewer firmware bugs.", "Loader patches the description vs. kernel reads separate parameters: patching keeps a single source, but makes the loader parse and rewrite a format it should not need to know."],
    p: ["The loader passes a description for a different board revision, and a device is silently left unconfigured.", "Table checksums are wrong after patching, and the kernel rejects the whole table set."],
    v: "Boot with the description handed over, then list the devices and interrupt assignments the kernel found. Each device on the board should appear with the interrupt and address in the description.",
    dep: ["hardware-description-tables", "device-tree-blob", "device-tree-fixups"]
  },
  "boot-parameters-block": {
    s: "The structure in memory the loader fills with the command line, ramdisk address and size, memory map pointer, framebuffer details and other facts for the kernel.",
    d: "The loader allocates a block, fills in fields defined by the protocol, and places its address in a register or fixed location at kernel entry. Fields have versions and flags that say which are valid. The kernel copies what it needs before reusing the memory. It must be constructed carefully: sizes and offsets are fixed by the contract, many fields are optional, and some are pointers to other buffers that must stay allocated. A wrong size or an unset flag shows up much later as a missing console or a broken ramdisk.",
    k: ["One fixed-layout block vs. a tagged list of items: a fixed layout is simple to parse in early code, but hard to extend; tags extend easily and cost parsing code in the kernel's first instructions.", "Loader fills every field vs. only those it knows: filling everything avoids garbage, but old loaders cannot describe new features."],
    p: ["Uninitialized padding in the block is read as a flag by a newer kernel, enabling a feature that was never set up.", "A pointer inside the block refers to loader memory that was freed before the jump."],
    v: "At kernel entry, dump the block and verify each pointer lands inside a range the memory map marks as in use, and the sizes match the actual files loaded.",
    dep: ["boot-protocol-contract", "kernel-command-line", "initial-ramdisk-loading"]
  },
  "cpu-state-at-entry": {
    s: "The exact processor mode, registers, interrupt state, paging and cache state the kernel can assume at its first instruction.",
    d: "The contract names a privilege level, whether paging and caches are on, whether interrupts and exceptions are masked, which registers carry pointers, and whether other cores are stopped. The loader must transition from firmware's environment to this state: switching modes, disabling interrupts, installing a minimal address space if needed. Mistakes are brutal because the kernel has no handlers yet. The hard part is that the state differs between firmware and the contract in ways that cannot be changed from the loader's own mapping without care.",
    k: ["Kernel entered with translation on vs. off: entering with it on gives an easy start, but requires a mapping the kernel did not build; off needs position-independent early code.", "Secondary cores parked by firmware vs. held in reset: parked cores are quick to start but occupy memory the kernel must not reuse; reset is clean and slower."],
    p: ["Interrupts left enabled by firmware fire into a vector table that does not exist yet.", "Caches contain stale data for the memory the kernel was just copied into, and the first instructions execute old bytes."],
    v: "Stop at the first kernel instruction with a debug probe or log and compare mode, interrupt mask, translation setting and register values against the contract's table.",
    dep: ["boot-protocol-contract", "early-cpu-mode-setup", "multiprocessor-startup"]
  },
  "exit-boot-services": {
    s: "The final firmware call a loader makes before the kernel runs: it ends the firmware's boot-time services, frees their memory, and fixes the memory map.",
    d: "The loader fetches the current map and its key, then calls exit with that key. If anything allocated memory in between, the key is stale and the call fails, so loaders loop: refetch, retry. After success, boot drivers and timers stop, only runtime services remain and the loader may no longer use console or file calls. This is hard because the loader must have everything it needs ready beforehand, including its own logging, and any failure after exit has no output path at all.",
    k: ["Exit in the loader vs. let the kernel call it: exiting in the loader keeps the kernel simple, but the kernel stub-based design handles firmware quirks closer to its own mapping.", "Retry loop on stale key vs. fail: a retry succeeds in the common case, but hides a driver that keeps allocating."],
    p: ["Logging after exit calls a stopped console service, and the machine appears to hang with no message.", "Allocating memory between getting the map and exiting invalidates the key, and an unbounded retry loop spins forever."],
    v: "Trace calls at the loader's last stage: the final map fetch must be followed immediately by a successful exit, and no firmware boot service must be called afterward.",
    dep: ["boot-services", "memory-map-handoff", "runtime-address-mapping"]
  },
  "framebuffer-handoff": {
    s: "Tells the kernel the address, size, pixel format and stride of the display memory firmware set up, so it can show output before a real graphics driver loads.",
    d: "The loader asks a firmware display service for the current mode and the physical address of the framebuffer, then records them in the handoff structure. The kernel can draw text or a splash there until a native driver takes over. The firmware mode may not suit the panel, and the buffer address must be reserved in the memory map so the kernel does not allocate over it. The difficulty is that pixel formats vary, strides include padding, and the driver that takes over may reset the mode and erase the screen.",
    k: ["Pass the firmware framebuffer vs. wait for the native driver: passing gives early output, but ties the kernel to modes it did not choose.", "Mode switch in the loader vs. keep firmware default: switching gives better resolution but adds a failure mode on odd displays."],
    p: ["The framebuffer range is not marked reserved, and the allocator hands it out, so memory corruption shows up as screen noise.", "Stride is assumed equal to width times pixel size, and text is skewed on screens with padding."],
    v: "Boot with only the framebuffer console available and confirm kernel messages appear correctly aligned, with the right colors, from the first line.",
    dep: ["input-and-display-init", "memory-map-handoff", "boot-parameters-block"]
  },
});
