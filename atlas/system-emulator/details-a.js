// Details for the system emulator plate, part 1: front end, debugging, validation.
ATLAS.details("system-emulator", {
  "media-loader": {
    s: "Reads a game or program image from disk or an archive and maps its parts, such as code, data, header and extra chip contents, into the emulated machine.",
    d: "Images arrive as raw dumps, disc images with sector layouts, compressed archives or containers with a header describing the hardware the software expects. The loader detects the format, strips or interprets copier headers, splits the image into the regions the memory map needs, and reports what extra hardware the title wants. Disc media adds track tables, sector sizes and subchannel data. Difficulty lies in the long tail of badly dumped, overdumped or patched images that nonetheless must load.",
    k: ["Detect format by content versus by file extension: content sniffing survives renamed files, but ambiguous formats need ordered heuristics that can misjudge a rare image.", "Load whole image into memory versus stream sectors on demand: whole-image loading is simple and fast, but large disc images need streaming and caching to keep startup short."],
    p: ["An unrecognized header size shifts every address by a few bytes, and the machine boots into garbage with no clear error.", "Treating a bad dump as valid hides a hardware difference behind a software crash that looks like an emulator bug."],
    v: "Load a set of images covering each supported container, plus one deliberately truncated image, and confirm each good one reaches its title screen while the truncated one produces a specific load error instead of a crash.",
    dep: ["host-storage"]
  },
  "title-identification": {
    s: "Works out which exact software is loaded, usually by hashing it, so the emulator can pick the right hardware variant, settings and fixes automatically.",
    d: "A checksum or hash of the image, or of selected parts such as a header, is looked up in a database that records the title, region, hardware revision, mapper or chip variant, and known compatibility settings. The result selects per-title overrides without asking the person. It is hard because identical software appears in many dumps and patched versions, because hashes break when an image is trimmed, and because a wrong match applies the wrong hardware and fails in subtle ways.",
    k: ["Whole-image hash versus hash of stable regions: stable-region hashes tolerate trimming and headers, but can collide between revisions that differ only in the ignored bytes.", "Bundled database versus user-editable database: bundled data is reliable and testable, while editable data lets users fix gaps but also lets them break matching."],
    p: ["Two revisions with different hardware behavior share a hash on the region that was hashed, so the wrong fix is applied.", "A stale database silently assigns last year's workaround to a title that the emulator has since fixed properly."],
    v: "Load three known revisions of the same title and confirm each resolves to a distinct database entry with the correct hardware variant, then load an unknown image and confirm default settings with an explicit unknown-title notice.",
    dep: ["media-loader"]
  },
  "settings-profiles": {
    s: "Stores global, per-system and per-title options such as accuracy level, graphics scale and speed hacks, and applies the right combination when a title starts.",
    d: "Settings are layered: built-in defaults, then global user choices, then per-system overrides, then per-title overrides, often seeded from the compatibility database. At start the layers are merged into one immutable configuration handed to every component. Changing a setting mid-run must either apply live, apply at the next safe point such as a frame boundary, or require a restart. The difficulty is that many options change emulated behavior, so they must be recorded in save states and netplay handshakes.",
    k: ["Immutable configuration at start versus live-editable settings: immutable is simpler to reason about and replay, but forces restarts for tuning.", "Per-title overrides versus a single global setting: overrides make awkward software work, at the cost of many hidden differences that users forget they set."],
    p: ["An option that changes emulated behavior is left out of the save state, so loading a state under different settings corrupts it.", "A per-title override outlives the bug it worked around and keeps slowing or distorting the title."],
    v: "Start the same title with two different accuracy settings, confirm each run reports its effective merged configuration with sources, and confirm a save state made under one setting is refused or flagged under the other.",
    dep: ["title-identification"]
  },
  "input-mapping": {
    s: "Translates host keys, buttons, axes and touch points into the original machine's controls, including combinations, turbo and hotkeys for emulator functions.",
    d: "A mapping table binds host input events to guest control bits or analog values, with profiles per device and per title. Analog sticks need dead zones, range scaling and sometimes octagonal gate shaping to match the original's range. Hotkeys for save states, rewind and fast-forward share the same input stream but must be kept out of the guest. Difficulty lies in hotplug, devices that report the same button with different codes, and conflicts when two host inputs map to opposite directions at once.",
    k: ["Event-driven mapping versus polling once per frame: events minimize latency, while polling at a fixed point makes recorded input deterministic and easy to replay.", "Strict mapping versus cleanup of impossible combinations: cleanup avoids crashes in software that never expected opposing directions, but alters what the original hardware could produce."],
    p: ["A hotkey chord also reaches the guest, so opening the menu makes the character jump.", "Analog dead zones tuned for one pad make another pad drift, and the drift is recorded into every replay."],
    v: "Plug in two different pads, press each mapped control in turn and confirm the guest's input register changes exactly as expected, then unplug one mid-run and confirm the guest sees a clean release, not a stuck button.",
    dep: ["controller-abstraction", "host-input-backend"]
  },
  "controller-abstraction": {
    s: "Presents every host input device through one internal model of buttons, axes, triggers and motion so the rest of the emulator does not know what device is attached.",
    d: "Host backends report devices with different layouts, identifiers and capabilities. The abstraction normalizes them into a small set of logical controls plus optional features such as rumble, motion sensing, touch surfaces and pointer position. It also assigns player slots and remembers which device belonged to which slot across sessions. The difficulty is naming: two pads with identical hardware can enumerate differently, and guest controllers have features, such as a mouse or light gun, that have no direct host equivalent.",
    k: ["Normalize to a common model versus expose raw device data: a common model is simple for mapping code, but hides device features that a few titles need.", "Stable slot assignment by device identity versus by connection order: identity keeps players in place across restarts, but fails when identical devices are swapped."],
    p: ["A controller reconnects after sleep under a new identifier, so player one silently loses control.", "Motion data at a different rate than the guest expects makes tilt controls feel wrong without any visible fault."],
    v: "Connect two identical pads in each order, restart, and confirm each is assigned the same player slot, then trigger rumble from the guest and confirm the correct pad vibrates.",
    dep: ["host-input-backend"]
  },
  "headless-mode": {
    s: "Runs the emulator without a window or audio device, driven by a script or command line, so it can be used in automated tests, bots and batch jobs.",
    d: "Headless mode replaces the display, audio and input backends with null or capturing implementations, runs the machine as fast as possible or for a fixed number of frames, and exposes controls such as scripted inputs, memory reads and screenshots of the emulated output. Test harnesses use it to run thousands of programs unattended and compare a final frame or memory state. The difficulty is keeping it exactly equivalent to the interactive path, because separate code for headless runs diverges and then proves nothing.",
    k: ["Null backends behind the same interfaces versus a separate headless build: null backends keep one code path, but every interface needs a sensible do-nothing implementation.", "Run unthrottled versus real time: unthrottled runs finish quickly, but timing-sensitive hosts and audio paths then go untested."],
    p: ["A frame is captured before the video unit finishes drawing it, so reference images are off by one frame.", "Headless runs skip audio, so a hang waiting for audio buffer space only appears in interactive use."],
    v: "Run a deterministic test program headless for one thousand frames twice, and confirm both runs produce byte-identical final frames and memory hashes, matching an interactive run of the same inputs.",
    dep: ["frame-pacing", "regression-corpus"]
  },
  "breakpoints": {
    s: "Stops the emulated machine when it executes a chosen address, touches a chosen memory location or meets a condition, so a developer can inspect state at that moment.",
    d: "Execution breakpoints are checked as instructions are fetched, or compiled into generated code as a check at a block boundary. Watchpoints sit on the memory access path and compare addresses and access types. Conditions are small expressions over registers and memory. On a multi-processor machine each processor has its own set, and stopping one must decide whether the others stop too. The difficulty is cost: naive checks on every instruction slow the emulator, and generated code must be recompiled around a breakpoint.",
    k: ["Check every instruction versus insert checks only at breakpoint addresses: checking everything is simple and exact, while targeted insertion keeps normal speed but needs invalidation of cached code.", "Stop all processors versus only the faulting one: stopping all gives a consistent snapshot, but changes the interleaving that the bug depended on."],
    p: ["A breakpoint inside a translated block is never hit because the block was compiled before it was set.", "A watchpoint on a memory-mapped register triggers its read side effect when the debugger inspects it."],
    v: "Set an execution breakpoint and a write watchpoint in a known test program, run it, and confirm the machine stops at the exact instruction each time, with registers matching a trace of the same run.",
    dep: ["interpreter", "memory-map", "code-cache"]
  },
  "stepping-and-tracing": {
    s: "Advances the machine one instruction or one event at a time, and logs executed instructions and register changes to a file for later comparison.",
    d: "Single-step runs one guest instruction then halts; step-over and step-out use call-return tracking. Trace logging writes each executed address with registers, often in a format shared with reference tools so two traces can be diffed line by line. Logs are enormous, so they use ring buffers, filters by address range or processor, and binary encodings. The difficulty is that tracing forces slow paths: generated code usually has to be disabled, which can change timing and hide bugs that only appear at full speed.",
    k: ["Trace from the interpreter only versus from every execution mode: interpreter-only is simple, but misses bugs that only the translator produces.", "Full text trace versus compact binary trace: text is easy to diff and read, while binary is several times smaller and faster to write."],
    p: ["Tracing disables the fast path, and the bug being hunted vanishes because timing changed.", "A trace written without flags or interrupt state diffs cleanly against a reference but hides the divergence that matters."],
    v: "Trace the first ten thousand instructions of a boot, replay the same run, and confirm the two traces are identical, then diff one against a reference trace and confirm the first divergence is reported with its address.",
    dep: ["interpreter", "instruction-decoder", "disassembler"]
  },
  "disassembler": {
    s: "Converts guest machine code bytes back into readable instructions, handling variable-length encodings, mode switches and data mixed with code.",
    d: "The disassembler reuses the instruction decoder's tables to print mnemonics and operands, and may follow control flow to separate code from data. It must track processor mode, such as instruction-set switches or operand-size flags, because the same bytes decode differently under different modes. It annotates addresses with symbols, jump targets and memory-mapped register names. The difficulty is correctness without context: a linear sweep over a region that mixes code, tables and padding produces plausible but wrong output.",
    k: ["Reuse the emulator's decoder versus a separate disassembler: reuse guarantees what is shown matches what runs, but couples display needs to a decoder optimized for speed.", "Linear sweep versus control-flow following: linear sweep is simple, while control-flow following avoids decoding data as code but misses indirectly reached code."],
    p: ["Disassembling with the wrong processor mode shows a sensible but incorrect listing that sends a developer chasing a false bug.", "A listing is built from memory that has since been overwritten by self-modifying code and no longer matches what ran."],
    v: "Disassemble a region of a known program in each processor mode and confirm the output equals the assembler listing from the original build, including branch targets and mode switches.",
    dep: ["instruction-decoder", "memory-map"]
  },
  "memory-viewer": {
    s: "Shows and edits guest memory, registers and processor flags while the machine is stopped or running, with views of the address map and per-region contents.",
    d: "The viewer reads through a debug path that bypasses side effects, so looking at a status register does not clear it. It presents hex and structured views, search, diff against a snapshot, and live highlighting of recently written bytes. Edits go through the same path and must invalidate any cached or translated code covering that memory. The difficulty is separating debug reads from real bus accesses, and representing regions that are write-only or banked, where a read returns something other than what was last written.",
    k: ["Side-effect-free debug reads versus real bus reads: debug reads are safe to repeat, but may show values the guest could never observe.", "Poll while running versus stop first: polling shows live behavior, but can display torn values that change during the read."],
    p: ["Reading an interrupt status register through the normal path clears it and makes the guest miss an interrupt.", "Editing code in memory without invalidating translated blocks leaves the old code running."],
    v: "Open the viewer on a status register that clears on read, view it repeatedly, and confirm the guest's behavior is unchanged compared with a run where the viewer was closed.",
    dep: ["memory-map", "mmio-dispatch", "code-cache"]
  },
  "device-inspectors": {
    s: "Displays the internal state of non-processor hardware, such as tile maps, sprites, palettes, sound channels and timers, in a form a developer can read.",
    d: "Inspectors render video memory as tiles, background layers and sprite lists, plot audio channel waveforms and envelopes, and list timer and interrupt state. They read the device models' internal state directly, so they can show data the guest cannot read back. They are essential for graphics and audio bugs, where a wrong pixel could come from a bad register, bad memory or a bad renderer. The difficulty is that they must stay correct as devices are reworked, and that rendering a view must not disturb the emulated state.",
    k: ["Inspect device model state versus decode raw memory: model state is authoritative and complete, but ties the tool to internal structure that changes.", "Update each frame versus only when paused: per-frame updates reveal timing bugs, but cost speed and can influence frame pacing."],
    p: ["An inspector renders from its own copy of the palette logic, so it shows correct colors while the real output is wrong.", "Opening a video inspector forces a video memory read that changes emulated timing."],
    v: "Open the tile and sprite views on a title screen, compare them against the rendered frame, and confirm every visible object appears in the inspector at the same position and palette.",
    dep: ["video-chip-model", "sound-chip-model", "timers"]
  },
  "debug-protocol": {
    s: "Exposes the debugger over a standard remote protocol so external debuggers, scripts and tools can control the machine and read its state.",
    d: "A server inside the emulator speaks a remote debugging protocol over a socket or pipe, mapping requests to breakpoints, steps, register and memory reads and writes, and a list of processors as threads. This lets existing debuggers, disassemblers and scripting environments attach with no custom UI. It also supports automation, such as a test that runs to a breakpoint and checks a value. The difficulty is mapping a machine with several processors and memory spaces onto a protocol that assumes one process with one address space.",
    k: ["Standard remote protocol versus custom interface: a standard protocol reuses mature tools, but its single-address-space model hides banks and processors.", "Run the server on the emulation thread versus a separate thread: the emulation thread is simple and safe, while a separate thread stays responsive but needs careful handoff at stop points."],
    p: ["A request arrives mid-frame on another thread and reads state that is half updated.", "Memory requested from a banked region returns the currently mapped bank, and the tool shows the wrong contents with no hint."],
    v: "Attach an external debugger, set a breakpoint, run to it, read registers and a memory range, and confirm the values equal those shown in the emulator's own viewer at the same stop.",
    dep: ["breakpoints", "memory-viewer", "host-threading"]
  },
  "cheat-search": {
    s: "Finds memory addresses holding values such as health or score by comparing snapshots, and applies patches that freeze or overwrite them while the machine runs.",
    d: "Cheat search takes repeated memory snapshots and narrows candidates by how values changed between them. Found addresses become cheat entries that are written every frame, or hooks that replace code. Patch formats let people share codes tied to a specific title and revision. It is useful both for play and for debugging, because it locates game variables. The difficulty is that patching must happen at a point where it is safe and deterministic, and that shared codes assume the same memory layout, which differs between revisions and regions.",
    k: ["Write cheats at a fixed frame boundary versus continuously: a frame boundary is deterministic and replay-safe, but a value can change in between and have visible effects.", "Memory writes versus code patches: writes are simple to share and toggle, while code patches change behavior but require invalidating translated code."],
    p: ["A code written for one region's revision corrupts a different revision where the same address holds other data.", "Active cheats are not recorded in the replay, so the replay desyncs on another machine."],
    v: "Search for a value across three snapshots, freeze it, and confirm the guest keeps showing the frozen value, then disable the cheat and confirm normal behavior returns without a restart.",
    dep: ["memory-viewer", "title-identification", "input-recording"]
  },
  "test-rom-suites": {
    s: "Small programs written to exercise one hardware behavior and report pass or fail on screen or through memory, used as the emulator's primary accuracy measure.",
    d: "Test programs target individual instructions, flag behavior, timing of interrupts, video effects, memory edge cases and sound output. Many write a result code to a known address or print text, which a headless run can check. Suites are community maintained and grow as people find new hardware behaviors. Passing them is meaningful only if they were verified on real hardware. The difficulty is coverage: a suite shows what its authors thought of, and a passing grade says nothing about untested behavior.",
    k: ["Pass or fail by memory result versus comparing screenshots: memory results are exact and cheap to automate, while screenshots catch rendering bugs but need reference images that are fragile.", "Run all suites on every change versus a nightly run: every change catches regressions at their source, but long suites slow the development loop."],
    p: ["A test passes because the emulator mimics the way the test reads its result, not because the hardware behavior is right.", "A suite written against one hardware revision fails a correctly emulated later revision."],
    v: "Run the full suite headless in both interpreter and translator modes, and confirm the pass list is identical in both and matches the list recorded from the previous commit, with any difference reported by name.",
    dep: ["headless-mode", "interpreter", "block-translator"]
  },
  "single-step-vectors": {
    s: "Large sets of recorded tests that give a processor's exact starting state and the exact state after one instruction, so every instruction can be verified in isolation.",
    d: "Each vector holds initial registers, flags and a few memory bytes, the instruction, and the expected final state plus the sequence of bus accesses. Generated from real silicon or a verified model, they cover every opcode with many operand and flag combinations. The harness loads a vector, runs one instruction in the interpreter or translator, and compares everything. The difficulty is volume and scope: millions of vectors need fast tooling, and they verify single instructions, not interrupts or multi-instruction timing.",
    k: ["Compare bus access sequence as well as final state: access comparison catches timing and ordering errors, but fails on harmless reordering that real hardware also allows.", "Run vectors against both interpreter and translator versus only the interpreter: both catches translation bugs, but doubles run time and needs a harness for each."],
    p: ["Vectors with undefined flag results are compared strictly and flag the emulator when the hardware itself is unspecified.", "Vectors pass for every instruction, and the team assumes full accuracy while interrupts and memory timing remain untested."],
    v: "Run the entire vector set against the translator and confirm zero mismatches, then deliberately break one flag computation and confirm hundreds of vectors for that instruction fail with the differing register named.",
    dep: ["interpreter", "block-translator", "instruction-decoder"]
  },
  "hardware-trace-comparison": {
    s: "Compares the emulator's execution traces and bus logs against recordings captured from real hardware to find the first point where behavior diverges.",
    d: "Captures come from logic analyzers, instrumented consoles or ports of the original development tools. They record addresses, data and sometimes cycle numbers for a boot or a test program. The emulator produces the same trace format and a diff tool reports the earliest mismatch. This catches errors that the original software never notices, such as wrong open-bus values. The difficulty is capture cost and alignment: hardware traces start at an unknown phase, and interrupt timing depends on exact clocks that a recording cannot reset.",
    k: ["Compare at cycle granularity versus at instruction granularity: cycle granularity finds timing bugs, but reference captures are scarce and any small phase offset causes noise.", "Align traces by a known synchronization event versus by exact start: event alignment tolerates unknown start conditions, but can mask early divergence."],
    p: ["A trace captured at a different clock phase produces a diff on line one, and the team ignores it.", "A reference trace taken from a different hardware revision is treated as truth and a correct behavior is changed to match it."],
    v: "Boot a test program on the emulator, diff its bus log against the stored hardware capture, and confirm the tool reports no divergence for the first million cycles or names the first differing access.",
    dep: ["stepping-and-tracing", "cycle-accuracy-model"]
  },
  "regression-corpus": {
    s: "A collection of real software with recorded inputs and expected outputs, replayed after every change to confirm nothing that used to work has broken.",
    d: "Each entry holds a title, a recorded input sequence, and expected results such as frame hashes at chosen frames or audio checksums. A runner plays them headless, in parallel, and reports differences. Because the emulator is deterministic, a changed hash means changed behavior, which a human then judges as a fix or a regression. The difficulty is maintenance: legitimate improvements change many hashes at once, and the corpus needs legally obtained software and careful curation.",
    k: ["Exact hash match versus tolerance-based image comparison: exact match is unambiguous and cheap, but any intentional rendering change invalidates many references.", "Hash at selected frames versus every frame: selected frames are fast and cheap to store, while every frame localizes a divergence but costs far more."],
    p: ["Expected hashes are updated in bulk after a change without looking, and a real regression becomes the new baseline.", "A title is in the corpus but its replay never reaches the code path that regressed."],
    v: "Run the corpus on the current commit and on a commit with a known injected timing bug, and confirm the second run reports failing titles by name with the first differing frame number.",
    dep: ["input-recording", "headless-mode", "determinism"]
  },
  "differential-fuzzing": {
    s: "Feeds random or mutated inputs to two implementations, such as the interpreter and the translator, and flags any difference in resulting state.",
    d: "A generator produces random instruction sequences, register states, memory contents or command streams. Each is run through both implementations and the final state is compared. Mismatches are minimized to the smallest input that still differs. It finds bugs in rarely used instruction combinations and flag edge cases that hand-written tests never reach. The difficulty is separating real bugs from undefined behavior: sequences that depend on unspecified results must be filtered out or treated as equivalent.",
    k: ["Compare two emulator modes versus compare against hardware: two modes needs no hardware, but a bug shared by both is invisible.", "Fully random inputs versus grammar-guided inputs: random inputs reach strange cases, while guided inputs produce valid programs that execute more than a few instructions."],
    p: ["Undefined flag results differ between modes and flood the report with false positives that bury a real bug.", "A fuzz run finds a mismatch but the input is not minimized, so nobody can diagnose it."],
    v: "Run one million generated sequences through interpreter and translator, confirm zero unexplained mismatches, then inject a bug in the translator's rotate instruction and confirm the fuzzer reports a minimized failing sequence within minutes.",
    dep: ["interpreter", "block-translator", "lazy-flags"]
  }
});
