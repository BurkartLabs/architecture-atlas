// Bootloader details, part 2: kernel and ramdisk loading, loader stages, storage and filesystems, network boot.
ATLAS.details("bootloader", {
  "kernel-image-format-parser": {
    s: "Reads the kernel file's header to learn its type, load addresses, entry point, size and requirements before any of it is copied into memory.",
    d: "Kernels ship in a structured executable format, a flat image with a header, or a firmware-native executable. The parser validates magic numbers, reads segment tables or header fields, and computes how much memory is needed and where. It rejects images with impossible sizes or overlapping segments. This is hostile-input parsing running at the highest privilege, so bounds checks matter. The difficulty is the number of formats and the optional fields, and the temptation to trust sizes that an unsigned or corrupted file may misstate.",
    k: ["Support many image formats vs. require one: many formats boot more kernels, but multiply parsing code in the most trusted stage.", "Parse then verify vs. verify then parse: verifying the whole file first keeps the parser away from untrusted bytes, but needs the complete file in memory."],
    p: ["A segment size larger than the file causes a read beyond the buffer, and the loader copies garbage over its own data.", "The header claims a load address inside the loader's own memory."],
    v: "Feed the loader a kernel with a truncated segment table and one with overlapping segments: both must be rejected with a clear message, and a valid kernel must report the entry point and sizes found in its header.",
    dep: ["filesystem-readers", "loader-memory-allocator"]
  },
  "kernel-image-loader": {
    s: "Copies the kernel's segments into the physical memory addresses they need, clears uninitialized regions and records where everything ended up.",
    d: "After parsing, the loader allocates memory at the requested or chosen addresses, reads the file into place, zeroes the uninitialized part, and notes the entry point. If the kernel wants a fixed address that firmware or the loader already occupies, the loader must pick another place and let relocation fix it up. It also has to keep the loaded image out of the ranges reserved for firmware and devices. The hard part is memory placement above what early code can address and keeping the copy consistent with instruction caches.",
    k: ["Load at the kernel's preferred address vs. wherever fits: preferred is simplest and fastest, but fails if that range is taken; flexible placement needs relocation support.", "Stream directly into place vs. stage in a buffer then copy: streaming saves memory, while staging allows verification before anything overwrites live memory."],
    p: ["The preferred address overlaps a firmware reserved range, and the copy succeeds but the machine hangs when firmware code is overwritten.", "Instruction cache holds old data at the destination, and execution begins in stale bytes."],
    v: "After load, compare a digest of the in-memory image against the file's digest for every segment, and confirm no loaded range overlaps a reserved region in the memory map.",
    dep: ["kernel-image-format-parser", "loader-memory-allocator", "memory-map-handoff"]
  },
  "kernel-decompression": {
    s: "Expands a compressed kernel into its runnable form in memory, either by a loader or by a small stub at the front of the image.",
    d: "Compression shrinks the kernel on flash and speeds reads from slow media. A stub inside the image, or a loader step, runs a decompressor into a destination, checks integrity, and jumps to the result. The stub must run with almost nothing set up and needs a scratch area for the output and sometimes a window for the algorithm. It is hard because decompression can cost more time than the saved reads on fast storage, and the output and input regions must not overlap in ways that overwrite unread input.",
    k: ["Compress the kernel vs. store it raw: compression saves space and read time on slow flash, but costs CPU time at every boot and a decompressor to trust.", "Fast algorithm with weak ratio vs. strong ratio: fast algorithms shorten boot, while strong ones suit tiny flash."],
    p: ["Input and output ranges overlap, and the decompressor overwrites compressed bytes it has not read yet.", "Decompression runs with caches off and takes seconds longer than expected."],
    v: "Time the stub on target hardware with caches in the shipped configuration, and compare a digest of the decompressed image with the digest recorded at build time.",
    dep: ["kernel-image-loader", "early-cpu-mode-setup", "loader-memory-allocator"]
  },
  "kernel-relocation": {
    s: "Adjusts addresses inside a loaded kernel when it ends up somewhere other than where it was linked, including random placement for address-space layout protection.",
    d: "The image carries a table of locations that hold absolute addresses. The loader or an early kernel stub adds the difference between actual and linked base to each. Randomizing the base makes exploits that need fixed addresses harder, so the loader chooses an offset from entropy and a set of ranges that are free. Relocation must complete before any code that depends on those addresses runs. The hard part is entropy quality this early, alignment limits, and avoiding memory the firmware or ramdisk occupies.",
    k: ["Randomize the base vs. fixed address: randomizing hardens the kernel but complicates debugging and needs early entropy; fixed is simple to analyze and easier to attack.", "Relocate in the loader vs. in the kernel's stub: the loader keeps the kernel simple, but a stub works the same under any loader."],
    p: ["The relocation table is applied twice because both loader and kernel stub process it, corrupting pointers.", "Poor early entropy gives the same base on every boot, giving false security."],
    v: "Boot ten times and log the kernel base each time: addresses should differ within the allowed range, and every boot should reach the same functional state with symbols resolving correctly.",
    dep: ["kernel-image-loader", "boot-entropy-seed", "memory-map-handoff"]
  },
  "boot-entropy-seed": {
    s: "Random bytes collected from hardware or a stored seed and passed to the kernel so its random number generator is usable from its first instruction.",
    d: "Early boot has few unpredictable inputs. The loader reads a hardware random source if there is one, mixes it with a seed stored from the previous boot, and passes the result in the handoff structure. It then replaces the stored seed with fresh output so the same bytes are never reused. The kernel needs it for address randomization and for keys generated at startup. The difficulty is cloned systems, virtual machines restored from snapshots, and read-only media that cannot store a new seed.",
    k: ["Rely on the hardware source alone vs. mix with a stored seed: hardware alone is stateless but may be weak or absent; mixing adds resilience and requires writable storage.", "Seed from firmware vs. loader: firmware has access to platform sources, but a loader works the same on any firmware."],
    p: ["A cloned disk image contains the same seed, so two machines produce identical keys at first boot.", "The stored seed is not replaced after use and is replayed on the next boot."],
    v: "Boot a freshly imaged machine twice and confirm the kernel's initial random state differs, and that the stored seed file's content changed after each boot.",
    dep: ["boot-parameters-block", "filesystem-readers", "kernel-relocation"]
  },
  "initial-ramdisk-loading": {
    s: "Reads a small archive or filesystem image into memory and tells the kernel where it is, so early userspace can load drivers and find the real root.",
    d: "The ramdisk contains the first program and the modules needed to reach the root filesystem: storage and network drivers, unlockers, and mount logic. The loader reads one or more files, concatenates or lists them, places them where the kernel can reach them, and passes address and size. It is hard because the ramdisk couples to kernel version and hardware: one built without a needed driver leaves the root unreachable, and a very large one competes with the kernel for low memory.",
    k: ["Generic large ramdisk vs. host-specific minimal one: generic boots many machines, but is slow to load and large; minimal is fast and breaks when hardware changes.", "Ramdisk signed with the kernel vs. loaded unverified: signing keeps early userspace trusted, but blocks local customization."],
    p: ["The ramdisk is unsigned and runs before any integrity check, making it an easy way to subvert a verified kernel.", "A ramdisk rebuilt for an old kernel omits a driver and the boot ends at an emergency shell."],
    v: "Boot, then compare the kernel's reported ramdisk address and size with the file loaded, and confirm the first process runs from it and mounts the root.",
    dep: ["filesystem-readers", "boot-parameters-block", "loader-memory-allocator"]
  },
  "device-tree-fixups": {
    s: "Edits the hardware description before handoff: adds the ramdisk and command line, sets memory size, and enables or disables devices the loader detected.",
    d: "The loader parses the tree it was given, locates nodes such as the chosen-parameters node and the memory node, and rewrites properties or applies small overlay files for optional hardware. Overlays let one base description serve board variants and add-on boards. The loader must keep sizes valid when it grows the tree. It is hard because overlays depend on node names and phandle references, and a typo silently has no effect or breaks a link the kernel needs.",
    k: ["Overlays at boot vs. separate trees per variant: overlays reduce image count, but allow invalid combinations that fail only at boot; separate trees are explicit and numerous.", "Loader edits vs. kernel-side parameters: loader edits keep one format, while kernel parameters avoid giving a loader a parser."],
    p: ["An overlay targets a node name that changed in the base tree, and the device never appears.", "The patched tree exceeds its reserved space and overwrites the following data."],
    v: "Dump the final tree after fixups on the running system and confirm chosen-node values match what was loaded, and that an overlay-enabled device is present and bound to a driver.",
    dep: ["device-tree-blob", "filesystem-readers", "hardware-description-handoff"]
  },
  "boot-module-list": {
    s: "An ordered list of extra files, such as drivers, microcode or configuration, that the loader reads into memory and describes to the kernel beside the main image.",
    d: "Some protocols let the loader load arbitrary named modules. Each entry has a path, an address, a size and a command string. The kernel uses them for processor patches that must apply before cores start, or for components in a multi-part system. The loader must keep modules intact in memory and mark them reserved. It is hard because the kernel must know what each module means, and a missing or misordered module only shows up as a subtle failure much later.",
    k: ["Many modules from the loader vs. a single ramdisk containing them: modules give fine control and verifiable pieces, but each needs a memory range and an entry in the handoff.", "Load every module found vs. only those named: loading all is easy but unpredictable; named loading is explicit and needs configuration."],
    p: ["A module's memory is not reserved and is reused by the kernel before it reads the module.", "Module order matters to the kernel but the configuration lists them alphabetically."],
    v: "Boot with two modules and confirm the kernel's module list shows both with correct addresses, sizes and strings, and that each module's contents match its file digest.",
    dep: ["boot-parameters-block", "filesystem-readers", "loader-memory-allocator"]
  },
  "stage-chain-design": {
    s: "The decision of how many stages the boot uses, what each is allowed to do, and what each hands the next, driven by size limits and trust requirements.",
    d: "A tiny first stage fits in a few hundred bytes or a ROM page and does one thing: find and load a bigger stage. Later stages add drivers, filesystem readers and a menu. Splitting costs time and adds handoffs, but each boundary is a place to verify and measure. Stages also differ in environment: one runs from flash with no memory, another in a full firmware environment. The hard part is defining stable interfaces between stages built and updated by different teams.",
    k: ["Few large stages vs. many small ones: fewer stages boot faster and are simpler; more stages give smaller trusted pieces and finer verification.", "Stages sharing a runtime library vs. independent code: sharing saves space, but one bug then spans every stage."],
    p: ["A stage changes its handoff format and the unchanged earlier stage passes the wrong data.", "Each stage assumes the previous verified the next, and none does."],
    v: "Draw the chain from the boot ROM log: each stage must announce its name and version, and the next stage's image digest must appear in the verification record before it runs.",
    dep: ["boot-rom", "first-stage-loader", "second-stage-loader", "verified-boot-chain"]
  },
  "first-stage-loader": {
    s: "The smallest code after the boot ROM or firmware: it initializes just enough hardware to find and read the next stage into memory and jump to it.",
    d: "It runs from on-chip memory or a fixed flash window, sets up a stack, may initialize the memory controller, then reads the next stage from a fixed location such as a raw sector range or a file. Because it is size-limited, it has no menu, no filesystem beyond a trivial one, and little error text. Its location is dictated by what the ROM can read. The hard part is that failures are almost invisible, so a status code or a single serial character is often the only diagnostic.",
    k: ["Raw sector addresses vs. filesystem lookup: raw addresses fit in tiny code but break if files move; lookups survive changes but need driver code.", "Initialize memory in this stage vs. an earlier one: doing it here keeps the ROM simple, but this stage becomes large and board-specific."],
    p: ["The next stage is moved by a filesystem tool and the stored raw address now points at other data.", "The stage loads a next stage without checking its size and overwrites its own stack."],
    v: "On a board with a serial console, power on with the next stage deleted: the first stage should emit a distinct error code and stop, rather than jump into garbage.",
    dep: ["boot-rom", "early-block-drivers", "memory-training", "cache-as-ram"]
  },
  "legacy-boot-sector": {
    s: "The older convention where firmware reads the first sector of a disk into low memory at a fixed address and jumps to it in a primitive CPU mode.",
    d: "Legacy firmware loads 512 bytes at a fixed address and executes it if a signature is present. That sector holds a few hundred bytes of code plus a partition table, so it loads a larger stage from a gap before the first partition or from a known list of sectors. It runs in a mode with a one-megabyte address limit and relies on firmware interrupt calls for disk and console. It persists for compatibility and in virtual machines. It is hard because space is tiny and the environment is fragile.",
    k: ["Support legacy boot vs. drop it: supporting it runs on old hardware and many virtual machines, but carries an insecure path outside modern verification.", "Embed the next stage in a gap vs. a boot partition: a gap needs no filesystem, while a partition is clean and allows normal tools."],
    p: ["A partitioning tool aligns the first partition to the start of the disk and overwrites the embedded stage.", "Legacy boot stays enabled on a secure-boot machine and bypasses verification."],
    v: "Boot a test disk in legacy mode and confirm the first sector's code announces itself, loads the second stage, and reaches the menu. Then confirm secure-boot mode refuses it.",
    dep: ["early-block-drivers", "partition-table-parsing", "second-stage-loader"]
  },
  "second-stage-loader": {
    s: "The full-featured loader that runs once memory and basic services work: it holds filesystem and network drivers, a menu, configuration parsing and the kernel loading logic.",
    d: "This stage does the visible work: reads configuration, shows a menu, loads the kernel and ramdisk, builds handoff data and jumps. It can be a firmware application loaded from a system partition or a self-contained program with its own drivers. It is the largest piece of boot code the team owns, so its attack surface is wide: it parses file formats and text from disk. The difficulty is deciding how much to build in versus rely on firmware services, which vary by platform and quality.",
    k: ["Use firmware drivers vs. bring its own: firmware drivers shrink the loader but inherit their bugs; its own drivers behave the same everywhere and cost size and effort.", "Interpreter for scripts vs. data only: scripting enables custom boot logic, but any parser can be exploited."],
    p: ["A filesystem parser flaw lets a crafted disk run code in the loader, before any kernel protection exists.", "The loader relies on a firmware driver that is broken on one vendor's machines."],
    v: "Boot the same loader on two firmware versions and confirm identical menu, entry list and kernel command line, and that a deliberately malformed configuration produces an error, not a crash.",
    dep: ["loader-runtime-environment", "boot-services", "filesystem-readers", "boot-menu"]
  },
  "loader-runtime-environment": {
    s: "The execution context a loader runs in: CPU mode, stack, heap, console and timers, whether supplied by firmware or set up by the loader itself.",
    d: "In a firmware application, the environment is provided: the loader is entered with a table of services and a heap. In a self-contained loader, it sets up its own stack, switches CPU modes, installs a minimal interrupt table, and starts a timer for timeouts. It needs memory it can allocate and free, a way to print, and ways to stall. It is hard because moving between modes (for instance, from a restricted mode to a wide mode) means rebuilding page tables or segment descriptors mid-flight.",
    k: ["Run inside the firmware's environment vs. take over the machine: staying in the firmware environment is easy and portable; taking over gives control and removes services.", "Identity-mapped memory vs. a custom address space: identity mapping is simple, but caps what the loader can address."],
    p: ["Stack too small for a deep filesystem path walk silently overwrites adjacent heap structures.", "A timer interrupt is enabled before its handler is installed."],
    v: "Run the loader with a debug build that fills the stack with a pattern and report the high-water mark after a full boot. It should stay well within the stack size.",
    dep: ["loader-memory-allocator", "early-cpu-mode-setup", "interrupt-and-timer-init"]
  },
  "loader-memory-allocator": {
    s: "Hands out memory inside the loader, usually by asking firmware for pages or by managing a region it was given, and tracks what has been placed where.",
    d: "A loader needs buffers for files, destinations for the kernel and ramdisk, and scratch space. With firmware, it calls an allocation service that updates the system memory map; without, it runs its own simple allocator over a described range. It must place images at specific addresses, respect alignment, and avoid the regions firmware reserves. The hard part is fragmentation at large sizes, memory only usable below some address, and the requirement that final allocations be recorded in the map given to the kernel.",
    k: ["Allocate through firmware vs. a private allocator: firmware allocation keeps the system map correct, but can fail for fixed addresses; a private allocator is flexible and must report itself.", "Allocate by address vs. by size: address placement matches kernel needs but can collide; size-only is easy and needs relocation."],
    p: ["A private allocator is not reflected in the memory map, and the kernel overwrites loaded files.", "Large ramdisk allocation fails because free memory is fragmented below the addressable limit."],
    v: "After allocating the kernel and ramdisk, dump the allocation list and the final memory map: every loader allocation must be present in the map with a non-usable type.",
    dep: ["boot-services", "memory-map-construction"]
  },
  "chain-loading": {
    s: "One loader starting another instead of the kernel: handing over to a different loader on another partition or disk, often belonging to a different operating system.",
    d: "The first loader finds the second's boot sector or application file, loads it at the address and in the mode it expects, and jumps, sometimes after hiding or swapping partitions so the target sees the layout it expects. In firmware-application environments, the first loader simply starts the other application and gives it the same services. It is hard because each loader has assumptions about its own location and the disk it was loaded from, and a security policy must decide whether to run an unverified second loader at all.",
    k: ["Chain to the other loader vs. load its kernel directly: chaining respects that system's own logic and updates, while direct loading needs the other's configuration knowledge.", "Verify the chained loader vs. trust it: verification keeps the chain intact but rejects loaders signed with other keys."],
    p: ["The chained loader expects to have been loaded from the first disk and cannot find its files.", "A chained, unsigned loader is accepted and bypasses secure boot."],
    v: "From the first loader's menu, select an entry belonging to a second installation and confirm the second loader's own menu appears and boots its kernel without modification to either system.",
    dep: ["second-stage-loader", "partition-table-parsing", "verified-boot-chain"]
  },
  "early-block-drivers": {
    s: "Minimal drivers for the disk controllers a loader needs, either its own small implementations or the block service that firmware exposes.",
    d: "Firmware drivers expose a uniform read interface, so a loader just asks for sectors by number. A loader without firmware must contain drivers for the storage controllers on its targets: an embedded flash controller, a memory-card interface or an attached disk interface. They are polled rather than interrupt-driven, and read-only. The hard parts are controller initialization sequences, timeouts for devices that wake slowly, bad blocks on raw flash, and very large disks whose sector addresses exceed early limits.",
    k: ["Use firmware's block service vs. native drivers: firmware's is portable and varies in quality; native is predictable and costs code and board support.", "Polled I/O vs. interrupts: polling is simple and avoids interrupt setup, but wastes time and blocks other work."],
    p: ["A disk that needs 10 seconds to spin up is missing from the first scan, and the machine reports no bootable device.", "Sector addresses above 32 bits wrap, and the loader reads the wrong place on a large disk."],
    v: "Read a known pattern sector at the very start and the very end of the largest supported disk and compare with a read from a running system.",
    dep: ["boot-services", "bus-enumeration", "loader-runtime-environment"]
  },
  "partition-table-parsing": {
    s: "Reads the disk's partition table to locate each volume's start and size, and identifies the system partition and each entry's type.",
    d: "Two layouts dominate: an old one with four entries in the first sector, and a newer one with a header, a backup at the end, checksums and unique identifiers. The loader validates the header and checksum, falls back to the backup if the primary is damaged, and returns a list of ranges and type identifiers. It is hard because tools disagree about edge cases: hybrid layouts, overlapping entries, disks with a changed sector size, and tables that were cloned to a bigger disk without moving the backup.",
    k: ["Support both layouts vs. only the newer: both reach old disks, but need extra parsing; newer-only is smaller and bigger-disk safe.", "Trust the primary table vs. cross-check the backup: cross-checking detects tampering and damage, and takes an extra read at the disk's end."],
    p: ["A cloned disk keeps the old backup header at the wrong location and the table is declared invalid.", "Two identical partition identifiers from a cloned disk cause the wrong volume to be chosen."],
    v: "Parse a test disk image with a damaged primary header: the loader should report the checksum failure, use the backup and list the same partitions as a reference tool.",
    dep: ["early-block-drivers"]
  },
  "system-partition-conventions": {
    s: "Agreed names, types and directory layouts for the small volume that holds loaders and configuration, so firmware and tools can find them without searching.",
    d: "A designated partition type marks the system volume, formatted with a simple filesystem every firmware can read. Defined paths hold loader applications, one per operating system and architecture, plus a fallback path for removable media. Having a convention lets firmware boot a disk it has never seen and lets several systems share the volume. The hard parts are size (too small for multiple kernels), shared writes from independent tools, and the fallback path being overwritten by whichever installer ran last.",
    k: ["Shared system partition vs. one per system: sharing is the norm and saves partitions, but systems can overwrite each other's files.", "Kernels on the system partition vs. a separate boot volume: keeping kernels there lets firmware boot them directly, but forces a small filesystem and a size limit."],
    p: ["The volume is sized for one kernel and fills up, so updates fail partway through.", "Two installers write the fallback loader path and the later one hides the first."],
    v: "List the system partition's contents from firmware's file service and confirm each installed system's loader is at its defined path, and the fallback path boots on a disk with no stored boot entries.",
    dep: ["partition-table-parsing", "filesystem-readers"]
  },
  "filesystem-readers": {
    s: "Read-only code in the loader or firmware that walks directories and reads files from a volume's on-disk format, without journal replay or write support.",
    d: "A reader parses the superblock, directory structures and allocation maps, and resolves a path to a file extent list, then reads data. Loaders include several readers to cover common formats, while firmware typically includes one simple format. Features like compression, encryption, inline data, large directories and snapshots each need handling. The hard part is parsing untrusted structures safely, and handling a volume with an unreplayed journal: reading it as is may show stale or inconsistent data.",
    k: ["Many readers in the loader vs. a small boot volume: many readers allow kernels anywhere, but each is attack surface; a small volume keeps one simple reader.", "Ignore journal vs. replay it read-only in memory: ignoring is simple and risks stale reads; in-memory replay is correct and complex."],
    p: ["A directory with millions of entries is read linearly and the boot takes minutes.", "A reader skips a newer on-disk feature and returns wrong file contents without any error."],
    v: "Read a set of known files, including one fragmented across many extents and one in a deep path, and compare digests with the same files read from a running system.",
    dep: ["early-block-drivers", "partition-table-parsing", "early-read-cache"]
  },
  "volume-naming-and-discovery": {
    s: "Gives each partition a stable name, such as a unique identifier or label, and finds the right one among all attached disks.",
    d: "Entries refer to volumes by the unique identifier from the partition table or filesystem, or by label. The loader scans every disk, builds a table of identifiers, and resolves each entry's reference. A search order is needed when two volumes share a name. Discovery requires reading headers on every disk, which is slow with many devices. It is hard because identifiers are copied by imaging tools and labels are chosen by humans, so uniqueness cannot be assumed.",
    k: ["Identifiers vs. labels: identifiers are unique and unreadable; labels are readable and collide.", "Scan all disks vs. a configured device: scanning is flexible and slow on large systems; a configured device is fast and fragile."],
    p: ["A disk image restored onto a second drive duplicates identifiers, and the loader boots the wrong copy.", "A scan of 24 disks adds a minute to every boot."],
    v: "Attach a second disk with a cloned volume identifier and confirm the loader reports the duplicate and uses its documented tie-break rather than choosing silently.",
    dep: ["partition-table-parsing", "filesystem-readers"]
  },
  "encrypted-volume-unlock": {
    s: "Obtains a key and decrypts the volume holding the kernel or root before it can be read, from a passphrase, a key file, or a hardware-bound secret.",
    d: "The loader recognizes an encrypted container, prompts for a passphrase or asks hardware to release a key only if the measured boot state matches expectations, derives the key, and exposes decrypted sectors to the filesystem reader. Often only the root is encrypted, while the kernel and ramdisk stay in the clear and are protected by signing, with unlocking done in the ramdisk. The difficulty is loader size, key derivation cost on slow CPUs, and what to do when the hardware refuses to release the key after a legitimate update.",
    k: ["Encrypt the boot volume vs. only the root: encrypting everything hides more, but puts crypto in the loader; encrypting only the root is simpler and leaves the kernel readable.", "Passphrase vs. hardware-sealed key: passphrases work anywhere and need a person; sealed keys boot unattended but break on state changes."],
    p: ["A firmware update changes the measured state, the sealed key is refused, and the machine waits for a recovery key nobody has.", "The passphrase prompt appears on a console the user cannot see."],
    v: "Boot with the correct passphrase and confirm the kernel loads; boot with a wrong one and confirm refusal without revealing any file names. Change a measured component and confirm sealed unlock is refused.",
    dep: ["filesystem-readers", "measurement-registers", "early-block-drivers"]
  },
  "logical-volume-assembly": {
    s: "Combines several disks or partitions into the single volume a boot file lives on, for mirrored, striped or pooled storage.",
    d: "If the root or boot volume spans devices, the loader must read the metadata on each member, check they belong together, and map logical sectors to physical ones. Mirrors can be read from one healthy member; stripes and pools need all. Loaders often support only simple layouts, and keep the boot files on a plain partition. It is hard because metadata formats are varied, degraded arrays need decisions, and a loader that mounts a stale mirror member may boot old data.",
    k: ["Support spanned boot volumes vs. require a plain boot partition: spanning is flexible, but adds metadata parsers; plain partitions keep loaders small and need per-disk copies.", "Boot from a degraded mirror vs. stop: booting keeps service up and may use stale data; stopping is safe and causes downtime."],
    p: ["The loader reads a mirror member that missed recent writes and boots an older kernel than the one installed.", "A pooled volume needs a member that is missing, and nothing says which."],
    v: "Remove one member of a mirrored boot volume and boot: confirm the loader reports the degraded state, and that the kernel it loads matches the most recently installed digest.",
    dep: ["partition-table-parsing", "volume-naming-and-discovery", "early-block-drivers"]
  },
  "early-read-cache": {
    s: "Keeps recently read sectors or directory data in memory in the loader so repeated lookups and large sequential reads do not repeat slow device operations.",
    d: "A small cache sits between the filesystem reader and the block driver. It holds directory blocks and allocation maps that are read repeatedly, and prefetches ahead of large files such as kernels. On slow media like cards or networks, it can cut seconds from the boot. It adds memory pressure in an environment with little heap, and cached data must be dropped before handoff. The hard part is sizing it so it helps without displacing the images the loader must place.",
    k: ["Larger cache vs. more free memory for images: a larger cache speeds repeated reads, but may fail large ramdisk allocations.", "Read-ahead vs. on-demand reads: read-ahead hides latency for sequential files, and wastes time on files read partially."],
    p: ["The cache is not flushed after the loader writes a boot counter, and later reads return the old value.", "Read-ahead on a slow card reads megabytes the loader never uses."],
    v: "Time the loading of the kernel and ramdisk with the cache on and off using the boot timing trace, and confirm the cached run is faster and loads identical bytes.",
    dep: ["early-block-drivers", "loader-memory-allocator"]
  },
  "network-interface-bringup": {
    s: "Initializes a network adapter in the loader or firmware so it can send and receive frames before any operating system exists.",
    d: "A driver resets the adapter, reads its hardware address, allocates transmit and receive buffers, and waits for link. Firmware provides a simple network driver through its own protocol stack; a loader without firmware carries drivers for the targeted adapters. Link negotiation can take several seconds, and switches with spanning tree may block traffic for longer. It is hard because adapters need firmware blobs and long initialization, and drivers must be small, polled, and robust to cable changes.",
    k: ["Use firmware network drivers vs. loader drivers: firmware's cover whatever the vendor tested, while loader drivers need per-device work and work uniformly.", "Wait for link before continuing vs. proceed and retry: waiting is deterministic, but delays boot when no cable is attached."],
    p: ["Switch port negotiation takes thirty seconds, and the first requests are lost, so the boot fails on a retry limit.", "The driver needs a firmware blob that the loader does not carry."],
    v: "Connect through a managed switch, boot, and capture packets: the first request after link up should reach the server, and the loader should report link speed and address.",
    dep: ["bus-enumeration", "boot-services", "option-roms-and-drivers"]
  },
  "address-assignment": {
    s: "Obtains an IP address, gateway and boot parameters through a broadcast request answered by a configuration server, or uses a static setting.",
    d: "The loader broadcasts a request, receives an offer with an address, a gateway and options naming the boot file and server, and acknowledges it. IPv6 uses router advertisement or a stateful service. The options also carry architecture identifiers so the server returns the right image. The hard parts are retries with backoff, several servers answering at once, a proxy arrangement where one server gives addresses and another gives boot files, and options that vary by vendor.",
    k: ["Dynamic assignment vs. static configuration: dynamic scales to fleets and needs a trusted server; static works without a server and needs per-machine setup.", "First offer wins vs. wait for several: taking the first is fast, but may accept a rogue or wrong server."],
    p: ["A second server on the segment answers with the wrong boot file, and half the machines boot a mismatched image.", "The architecture option is missing from the request, and the server returns an image for another CPU."],
    v: "Boot on an isolated segment with one server and confirm the received address, boot file and server name match the server's lease record, and the architecture option was sent.",
    dep: ["network-interface-bringup"]
  },
  "boot-server-discovery": {
    s: "Finds where to fetch boot files from: the server address and filename supplied by address assignment, a multicast search, or a configured URL.",
    d: "The configuration reply may name a file and a server directly, or point at a second server through a proxy exchange. Some stacks support service discovery or consult a stored URL in firmware settings. The loader then contacts that server by address or name, which may need name resolution. Multiple architectures and firmware modes need different files from the same server, so the answer is chosen by the client's reported type. The hard part is a chain of dependencies, any one of which silently misdirects.",
    k: ["Server told by configuration vs. stored in firmware settings: configuration centralizes control; stored URLs work without a configuring server and are per-machine.", "Single boot file vs. a menu delivered by the server: a single file is simple; a server menu lets operators choose per machine, adding another stage."],
    p: ["Name resolution is not available at this stage, and a boot URL with a hostname fails while the numeric address works.", "A stale boot server address remains in a stored setting after a data center move."],
    v: "Change the server's boot file for one client class and confirm that class receives the new file while another class still receives its own, checking the server's request log.",
    dep: ["address-assignment", "firmware-variables"]
  },
  "file-transfer-protocols": {
    s: "The simple protocols a loader uses to download boot files, usually datagram-based with small blocks and acknowledgments, chosen because they are tiny to implement.",
    d: "The classic choice sends fixed-size blocks, each acknowledged, over a connectionless transport, needing very little code and no connection state. Later extensions negotiate larger blocks and window sizes. It is slow on high-latency links, gives no authentication or encryption, and offers no integrity beyond the transport's checksum. The difficulty is throughput: a few kilobytes per round trip makes a hundred-megabyte ramdisk take minutes, and loss handling with tiny buffers is tricky.",
    k: ["Simple datagram transfer vs. a stream protocol: datagram transfer fits in tiny code but is slow and unprotected; a stream stack costs size and gives speed and optional security.", "Small blocks vs. negotiated large blocks: negotiation speeds transfers, but needs path-size agreement or fragments get dropped."],
    p: ["A block size beyond the path's limit causes fragmentation that a firewall drops, and the transfer stalls at zero bytes.", "No integrity check means a corrupted block is loaded as the kernel."],
    v: "Download the kernel over a link with injected packet loss and confirm the loaded file's digest equals the server's, and measure the transfer time against the plan.",
    dep: ["address-assignment", "boot-server-discovery", "verified-boot-chain"]
  },
  "http-boot": {
    s: "Fetching boot images with the standard web protocol, optionally over a secured connection, which allows routing across networks and better throughput.",
    d: "Firmware or the loader includes an HTTP client and optionally a TLS stack with a set of trusted certificates in firmware settings. A URL, supplied by configuration, names the image. Compared with the simple datagram approach, it traverses routers, uses ordinary servers and content delivery networks, and transfers large files quickly. Certificate validation needs a clock and a trust store, both weak this early. Large downloads also need memory for the whole image.",
    k: ["Secured transport vs. plain: secure transport defends against tampering and needs a clock, certificates and bigger code; plain is simple and relies on image signatures.", "Fetch whole image then boot vs. stream: whole-image fetching permits verification before use and needs memory; streaming saves memory and delays integrity checks."],
    p: ["The firmware clock is wrong, and certificates look expired, so the secure fetch fails on every machine after a battery dies.", "The certificate store in firmware is outdated and rejects the current server."],
    v: "Boot from an HTTPS URL with a valid certificate and confirm success, then with an untrusted certificate and confirm refusal before any bytes are executed.",
    dep: ["network-interface-bringup", "address-assignment", "signing-key-databases"]
  },
  "network-root-delivery": {
    s: "Supplies the running system's root files over the network after the kernel starts: a network filesystem, a block service, or a downloaded image held in memory.",
    d: "The loader passes the kernel and a ramdisk containing network drivers and logic. The ramdisk configures networking again, because firmware's state is gone, then mounts the root from a file server or block target, or downloads an image into memory. Diskless workstations, clusters and installers use it. The design question is where state lives. The hard part is the second network bring-up, which must not drop the address the machine already holds, and server unavailability that blocks every client at once.",
    k: ["Network-mounted root vs. image loaded into memory: a mounted root needs servers all the time but shares state; memory images run independently and need RAM.", "Reuse the firmware address vs. re-request: reusing is quick and needs the handoff to carry it; re-requesting is simple and may change the address."],
    p: ["The ramdisk lacks the network driver for the adapter in use, and boot ends at an emergency shell.", "The root server is overloaded when a whole rack boots, and every client times out."],
    v: "Boot a diskless client, confirm it mounts the network root, write a file, reboot and confirm the file persists or does not, according to design.",
    dep: ["initial-ramdisk-loading", "file-transfer-protocols", "address-assignment"]
  },
});
