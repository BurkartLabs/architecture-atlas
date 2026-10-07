// Details for the system emulator plate, part 4: device models, firmware and system software.
ATLAS.details("system-emulator", {
  "timers": {
    s: "Models hardware counters that count clock ticks, reload, prescale and raise interrupts, which software uses for delays, scheduling and audio timing.",
    d: "Each timer has a counter, a reload value, a prescaler, a mode and control bits. Rather than ticking each cycle, the emulator computes the next overflow time from the current value and rate and schedules an event. Reads compute the current counter lazily from elapsed time. Cascaded timers, gate inputs and write-while-running behavior all have defined hardware quirks. The difficulty is that software writes timer registers constantly, each write must cancel and reschedule, and off-by-one errors in the first period are visible in music tempo and in tightly timed code.",
    k: ["Lazy computation from elapsed time versus incrementing each cycle: lazy is much faster when timers are idle, while incrementing is simple and exact but costs per cycle.", "Model the exact reload edge behavior versus an approximate period: exact edge behavior is needed for timing tests and some titles, while approximate is simpler and mostly fine."],
    p: ["A write to a running timer fails to cancel the old event, and the timer fires twice.", "Reading the counter returns a value computed from stale time because the timer was not synchronized first."],
    v: "Program each timer mode, read the counter at known emulated times and measure interrupt intervals, and confirm values and intervals equal the hardware reference down to the cycle, including writes while running.",
    dep: ["event-scheduler", "interrupt-controller", "mmio-dispatch"]
  },
  "interrupt-controller": {
    s: "Collects interrupt requests from devices, applies masks and priorities, and presents a single request line and vector to the processor.",
    d: "Devices set pending bits when something happens, such as a video line, a timer overflow or a finished transfer. Software enables sources through mask registers and acknowledges them by writing or reading status. The controller combines pending and enabled bits, resolves priority, and drives the processor's interrupt input, which the core samples at instruction boundaries. Edge versus level triggering matters. The difficulty is subtle acknowledgment rules: clearing a bit that is set again at the same moment, and interrupts raised while masked, which fire as soon as unmasked.",
    k: ["Level-sensitive line versus latched events: levels stay asserted until the source clears, matching most hardware, while latching events is simpler but loses repeated requests.", "Evaluate the line on every change versus on sampling: on every change keeps the line always correct, while sampling is cheaper and delays updates until needed."],
    p: ["An acknowledge write clears a bit that a device set in the same cycle, and the interrupt is lost.", "A masked source is dropped instead of kept pending, so enabling it later never fires."],
    v: "Raise each source with masks set and cleared, in combinations and at the same time as acknowledges, and confirm interrupt delivery order and count match the hardware reference.",
    dep: ["event-scheduler", "mmio-dispatch"]
  },
  "storage-controller": {
    s: "Emulates the disk, cartridge reader or card interface the software uses to load data, including command protocols, seek and transfer timing.",
    d: "The controller exposes registers or a command interface for reading sectors, seeking and querying status. Backing data comes from the media image, and transfers are delivered through DMA or polling with realistic delay. Timing models range from instant to emulating seek times, spin-up and rotational latency, which streaming-heavy software needs for correct loading behavior. Copy protection checks may read subchannel data or deliberately bad sectors. The difficulty is that titles depend on both the timing and the odd error responses, so instant, ideal storage is not always compatible.",
    k: ["Instant reads versus realistic latency: instant reads shorten loading, but some titles depend on delay to stay in sync with audio or video streams.", "Raw sector access versus file-level emulation: sector access works with every title, while file-level access is simple but only works when the software uses the standard file calls."],
    p: ["Reads complete faster than the original, and a title that streams audio from disc runs ahead and glitches.", "A protection check reads a deliberately damaged sector and the emulator returns clean data."],
    v: "Boot a disc-based title, log the sequence and timing of read commands, and confirm the data returned and the command status values equal the reference log, then run a title using intentionally bad sectors.",
    dep: ["media-loader", "dma-engine", "event-scheduler", "mmio-dispatch"]
  },
  "input-port-devices": {
    s: "Emulates the controller ports and the devices plugged into them, including the serial or polled protocols that return button states to software.",
    d: "Controllers do not simply show buttons in a register: they are read through a protocol, such as latching and shifting out bits one at a time or answering command packets. The emulator models the port's registers and the attached device's state machine, with the host input sampled at a defined point. Peripherals such as mice, light guns, keyboards and memory adapters speak richer protocols. The difficulty is timing of the read sequence and the quirks of devices, such as bits that float when no controller is attached.",
    k: ["Model the serial protocol bit by bit versus return button state as a whole: bitwise handles software that reads partially or at odd times, while whole-state is simpler and enough for standard use.", "Sample host input at frame start versus at the moment of the latch: frame start is deterministic and simple, while latch time reduces latency but is harder to record."],
    p: ["A disconnected controller returns zeros where hardware returns floating high bits, and software thinks buttons are pressed.", "A peripheral protocol is partially implemented and the title hangs waiting for a response."],
    v: "Run a controller test program that reads every button, with and without controllers attached and with each peripheral type, and confirm the values equal the hardware reference for each state.",
    dep: ["controller-abstraction", "mmio-dispatch", "event-scheduler"]
  },
  "real-time-clock": {
    s: "Provides the wall-clock time and date the original machine kept in a small battery-powered chip, for software that shows or uses the time.",
    d: "The device exposes date and time registers, alarms and sometimes a timekeeping oscillator, which software reads through a serial or register protocol. The emulator can mirror the host clock, use a fixed or user-set time, or advance time from emulated cycles. Using the host clock makes behavior depend on when the program runs, which breaks determinism. The difficulty is choosing between faithful, convenient and repeatable: players expect the real date, while recordings and netplay need the same time on every run.",
    k: ["Host clock versus emulated time from a fixed start: the host clock feels natural, while emulated time is repeatable and required for recordings and netplay.", "Hardware register format with exact protocol versus a simplified interface: exact protocol suits titles that probe it, while a simplified interface is easier but incomplete."],
    p: ["A recording made on one day reads a different date when replayed, and a time-dependent event changes the run.", "Daylight saving or time zone changes cause jumps that software interprets as years passing."],
    v: "Record a title that shows the clock, replay it on another day, and confirm identical output, then switch to host time mode and confirm the displayed time equals the host's.",
    dep: ["mmio-dispatch", "determinism", "host-timing"]
  },
  "serial-link": {
    s: "Emulates the serial and link ports used for cables between machines, printers and accessories, including clocking and the handshake with the other end.",
    d: "A transfer shifts bits out and in at a clock rate set by one end, the master, with an interrupt when a byte completes. With nothing attached the line floats, and software reads either idle bits or all ones. Link emulation between instances runs two emulators and exchanges bytes at transfer boundaries, which is hard because hardware transfers continuously and the two machines run at different emulated times. The difficulty is synchronization: with no cable the guest still expects completion on time.",
    k: ["Complete transfers with correct timing even with nothing attached versus never complete: correct timing matches hardware and avoids software hanging, while never completing is simple but stalls waiting loops.", "Link two instances in lockstep versus with buffered bytes: lockstep keeps exact timing but needs tight sync between instances, while buffering is loose and may let games drift."],
    p: ["A transfer with no peer never raises its completion interrupt, and the title waits forever.", "Two linked instances run at different speeds, and each sees the other's bytes at the wrong time."],
    v: "Run a transfer test with no device and with a loopback, and confirm completion timing and received bytes equal the hardware reference, then link two instances and exchange a thousand bytes without loss.",
    dep: ["event-scheduler", "interrupt-controller", "mmio-dispatch"]
  },
  "coprocessors": {
    s: "Emulates extra processors and special chips on the board or cartridge, such as geometry engines, decompressors, math units and security chips.",
    d: "Systems add chips with their own instruction sets or fixed functions: a vector unit for 3D math, a graphics accelerator on the cartridge, a decompression engine or a secondary CPU. Each has registers visible to the main processor, often shared memory, and its own clock. The emulator models it as another core or a hardware function, run on the scheduler, and synchronized with the main processor when they communicate. The difficulty is volume: each chip is its own project, with little public documentation, and few titles use some of them.",
    k: ["Emulate the chip's instruction set versus replace its function with high-level code: instruction set emulation is exact, while replacing the function is fast but only fits software that uses the standard programs.", "Run on its own thread versus the main thread: its own thread uses more cores, but requires synchronization at every shared register or memory access."],
    p: ["A chip's firmware is not available, and the emulator runs a substitute that behaves differently in an edge case.", "A coprocessor and main processor share memory without arbitration, and a race that real hardware prevents appears."],
    v: "Run a title using the chip, trace commands sent to it, and confirm outputs equal those of a reference implementation or hardware capture for a set of recorded command streams.",
    dep: ["component-synchronization", "instruction-decoder", "mmio-dispatch", "hle-versus-lle"]
  },
  "power-and-reset": {
    s: "Defines the machine's state at power-on and reset, which values are fixed, which are random, and what a reset button does to each component.",
    d: "On power-up, RAM holds unpredictable contents, registers have documented or undocumented initial values, and devices start in states that firmware expects. Reset clears some state but keeps other state, such as memory contents and certain registers. Some software reads uninitialized RAM and is sensitive to its pattern; others seed random numbers from it. The emulator picks fixed patterns, a seeded random fill or a pattern that matches hardware measurements. The difficulty is determinism: unseeded randomness here makes runs differ.",
    k: ["Fixed power-on pattern versus randomized memory: a fixed pattern is deterministic and repeatable, while randomized memory reveals software that reads uninitialized data but breaks replays unless seeded.", "Reset equals power-cycle versus preserving state like hardware: preserving matches behavior some titles rely on, while power-cycle is simpler."],
    p: ["Uninitialized RAM is filled with random bytes from the host, so the same replay differs between runs.", "A reset clears a register that hardware leaves unchanged, and a title that detects a warm start misbehaves."],
    v: "Power on twice with the same configuration and confirm every memory and register hash is identical, then reset and confirm the state equals the documented warm-reset state for each device.",
    dep: ["determinism", "memory-map"]
  },
  "firmware-loader": {
    s: "Loads the original boot and system firmware images from files the person supplies, validates them and places them in the memory map.",
    d: "Many machines contain boot ROMs, system software and character tables that the first instructions run depend on. The loader locates the files, checks sizes and hashes against known revisions, rejects ones that are damaged or from a wrong region, and maps them. Firmware cannot be redistributed by most emulator projects, so the person provides it, and the emulator must explain clearly what is missing. The difficulty is the number of revisions, regions and hardware variants, each of which behaves slightly differently, and the legal boundary that shapes the design.",
    k: ["Require original firmware versus ship a replacement: original firmware is exact for every title, while a replacement avoids setup but never matches every behavior.", "Strict hash check versus accept any plausible image: strict checks prevent obscure bugs from bad dumps, while lenient checks allow patched or translated firmware that people want."],
    p: ["A firmware dump from a different revision loads silently and games fail in ways that look like emulator bugs.", "The error for a missing file is a crash instead of a message naming the file and the expected hash."],
    v: "Start with correct firmware, a wrong-region file and no file, and confirm the first boots, the second is rejected with the region named and the third shows a message naming the missing file and its expected hash.",
    dep: ["media-loader", "memory-map", "host-storage"]
  },
  "boot-sequence": {
    s: "Runs the machine from power-on through firmware initialization to the point the loaded software takes over, or skips directly to that point.",
    d: "A faithful boot executes the firmware, which initializes hardware, shows a logo, checks media and jumps to the game. Skipping it saves seconds but requires the emulator to set up the state the firmware would have left: registers, memory contents, device configuration and sometimes values in system memory the software reads. A fast boot is built by running the firmware once and recording the resulting state, or by writing the state by hand. The difficulty is that titles rely on residue of boot, and fast boot can leave out something one title needs.",
    k: ["Full firmware boot versus fast boot with injected state: full boot is exact but slow and needs original firmware, while fast boot is quick but may miss residue titles read.", "Capture post-boot state from the real firmware versus construct by hand: capturing is accurate for what it saw, while hand construction is cleaner but can miss undocumented values."],
    p: ["Fast boot leaves a device register at a different value than firmware sets, and a few titles hang at start.", "Boot timing differs, and software that seeds randomness from the elapsed time behaves differently."],
    v: "Boot a set of titles through full firmware and through fast boot, and compare memory and device state at the point the title starts, confirming the differences are only the documented ones.",
    dep: ["firmware-loader", "power-and-reset", "state-serialization"]
  },
  "hle-kernel-calls": {
    s: "Replaces the guest operating system's kernel with emulator code that implements its calls for threads, memory, synchronization and file handles directly.",
    d: "When a machine's operating system is large and runs entirely on the main processor, an emulator can intercept the guest's calls into it and perform the operation itself, without running the real system code. The guest's thread scheduler, memory allocator and synchronization primitives are reimplemented in host code with the same visible results. This is much faster and needs no original system files. The difficulty is fidelity: hundreds of calls with subtle error codes, scheduling order, and undocumented behavior that titles depend on, so each missing or inexact call breaks some software.",
    k: ["Reimplement kernel calls versus run the real kernel: reimplementation is fast and avoids original files, while the real kernel is exact but needs those files and runs everything below it.", "Cooperative guest scheduling in the emulator versus preemptive on host threads: cooperative scheduling is deterministic, while host threads match parallel hardware but are not repeatable."],
    p: ["A call returns success where the real system returns a particular error, and software takes the wrong branch.", "Thread scheduling order differs from the original, and a race that never occurred on real hardware appears."],
    v: "Run a call-level test program that exercises every implemented call with valid and invalid arguments, and confirm return values and observable side effects equal those recorded from the real system.",
    dep: ["hle-versus-lle", "interrupt-and-exception-handling", "memory-map"]
  },
  "hle-system-services": {
    s: "Emulates system-level services that titles use, such as save data, user accounts, networking and media decoding, with emulator code instead of the original service software.",
    d: "Modern consoles run services as separate processes reached through message passing. An emulator can implement the interface of each service in host code, returning the data titles expect, or run the original service programs. Common services include storage of save data, time, settings, controller state, audio output and video decoding, the last often handed to a host decoder. The difficulty is breadth and versioning: services change between system versions, titles check version numbers, and the contract is learned by reverse engineering and test.",
    k: ["Implement service interfaces in host code versus run original service programs: host code is lightweight and flexible, while original programs are more faithful but require system files.", "Report one fixed system version versus choose by title: a single version is simpler, while by-title selection avoids version checks that block a few titles."],
    p: ["A service returns a stub success for an operation, and the title later reads data that was never written.", "A system update changes a service's message layout, and older titles break on a new emulator build."],
    v: "Launch a title that uses save data, time and controller services, and confirm each service call and response in a log matches the contract documented from a reference capture, with saves persisting across runs.",
    dep: ["hle-kernel-calls", "hle-versus-lle", "guest-file-system", "settings-profiles"]
  },
  "guest-file-system": {
    s: "Provides the file and directory structure the guest software sees, backed by host files, disc image contents or virtual storage, with the original's path rules and metadata.",
    d: "Guest software opens files by path on volumes with their own naming rules, case sensitivity, size limits and formats. The emulator maps these onto host directories, disc image file tables or save containers, and presents timestamps, attributes and free space. Writes go to a separate overlay so the original image stays intact. The difficulty is differences in naming and semantics between the guest and host: reserved names, path length, case and character sets must be translated without collisions, and some titles read raw sectors, bypassing files.",
    k: ["Back by host directories versus by container images: directories are easy for users to inspect and edit, while container images preserve exact layout and metadata.", "Overlay writes in a separate area versus modify originals: overlays keep the original pristine and make resets simple, but need lookups through two layers."],
    p: ["Two guest names differing only in case map to one host file, and one title overwrites the other's data.", "A reserved name on the host blocks creating a file the guest legitimately names."],
    v: "Create, rename, list and delete files with awkward names through the guest interface, and confirm host contents, listing order and error codes match the reference, with the original image unchanged afterward.",
    dep: ["storage-controller", "host-storage", "hle-system-services"]
  }
});
