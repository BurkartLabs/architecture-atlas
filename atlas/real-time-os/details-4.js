// Details for the real-time OS plate, part 4: power, startup, board support and drivers.
ATLAS.details("real-time-os", {
  "idle-hook": {
    s: "An application function called from the idle task each time it runs, used for low-priority background work, sleep entry and counters, which must never block.",
    d: "The hook runs whenever no other task is ready. Typical uses: enter a sleep instruction, update a load counter, run a background self-test in small slices, or feed low-priority housekeeping. Because it runs only when nothing else does, it receives no guaranteed time and cannot be given a deadline. It must return promptly so newly ready tasks are noticed through the normal preemption. It is hard because it is tempting to put real work there, which then starves under load.",
    k: ["Work in the idle hook versus a low-priority task: the hook costs no stack or control block, but cannot block, be scheduled or be given time guarantees; a task can wait and be measured.", "Sleep entry in the hook versus in the kernel: the hook allows product-specific policy, but each product must implement it correctly."],
    p: ["A blocking call inside the hook, which halts the idle task and breaks the kernel.", "Self-test work that never completes because the system is rarely idle."],
    v: "Count hook invocations over a known load and compare with the idle share; confirm that the hook returns within its time limit and the processor enters sleep from the current measured.",
    dep: []
  },
  "sleep-state-selection": {
    s: "The policy that picks which low-power mode to enter when idle, choosing the deepest one whose entry and wake-up time still lets the next deadline be met.",
    d: "Each sleep mode has an energy saving, an entry-plus-exit delay and a set of clocks and peripherals that stay alive. The kernel knows the time to the next scheduled wake-up from the timeout lists, and asks the power policy for the deepest mode whose total delay fits with margin and whose active wake sources include everything needed. It is hard because the numbers must be measured per chip and voltage, and because a peripheral still busy, such as a transfer in progress, forbids deep modes.",
    k: ["Static mode chosen at build versus chosen from the time to next event: static is simple and predictable, but wastes energy in long idles; dynamic saves more and needs tables and tests of all transitions.", "Deep sleep with long wake-up versus light sleep with fast wake-up: deep saves most energy, but may miss deadlines of events that arrive early."],
    p: ["Entering a mode whose wake-up time exceeds the next deadline because the table was copied from a datasheet's typical values.", "Sleeping while a direct memory access transfer is active and losing data."],
    v: "Measure current and wake-up latency in each mode with a power analyzer and a logic analyzer, load them in the table, then run a test where events arrive at the shortest scheduled interval and confirm no deadline is missed.",
    dep: ["wake-sources-and-latency","tickless-idle","power-state-manager"]
  },
  "wake-sources-and-latency": {
    s: "The set of events that can wake the processor from each sleep mode, together with the measured time from event to code running, which must fit the deadline of whatever the event triggers.",
    d: "Not every interrupt source works in every sleep mode: deep modes keep only a few pins, a low-power timer or a communication peripheral alive. After wake, clocks and regulators must stabilize before code can run, taking microseconds to milliseconds. The wake-up path must restore the state that sleep lost. It is hard because wake-up time varies with temperature, supply voltage and oscillator start-up, so measured values need margin.",
    k: ["Wake on any interrupt versus a selected set: any is easy, but noise or unrelated events interrupt sleep and waste energy; a selected set saves energy and needs careful configuration.", "Fast-start internal clock then switching to crystal versus waiting for the crystal: switching starts running sooner, but code must tolerate the reduced accuracy for a short time."],
    p: ["A wake source not enabled in the deep mode, so the device never wakes on that event.", "Assuming wake latency is constant when it grows at cold temperature."],
    v: "Trigger each wake source at hot, cold and nominal conditions, measure event-to-first-instruction on a logic analyzer, and confirm the maximum fits the shortest deadline that depends on it.",
    dep: ["interrupt-controller-and-priorities","clock-and-power-gating"]
  },
  "clock-and-power-gating": {
    s: "Switching off the clock or power of unused peripherals and memory blocks to save energy, with tracking so a block is never gated while a task still needs it.",
    d: "Drivers request a peripheral clock when they open a device and release it when they close it, and the power framework counts users. When the count reaches zero, the clock or supply is gated. Re-enabling takes time and may lose register state, which the driver must restore. Retained memory modes keep contents while off. It is hard because gating changes timing (a peripheral is slow to start) and causes bugs that show up only after long idle periods.",
    k: ["Reference-counted gating versus explicit enable by the application: counting is safe for shared peripherals, but costs bookkeeping; explicit is simple and error-prone.", "Aggressive gating versus keeping peripherals on: aggressive saves energy but adds start-up latency to each use; keeping on is fast and wastes power."],
    p: ["A driver that does not restore registers after a power-gated period, silently misbehaving.", "Gating a clock while a transfer is pending and losing data."],
    v: "Open and close each peripheral repeatedly across long idle times, confirm correct operation after every re-enable, and measure that current falls to the expected level when all users have released.",
    dep: ["driver-model","power-state-manager"]
  },
  "tick-compensation": {
    s: "Correcting the kernel's tick count and software timers after a sleep in which the tick was stopped, by adding the measured elapsed time in one step.",
    d: "Before sleeping, the kernel records the time and programs the wake-up. After waking, from the programmed timer or an earlier interrupt, it reads an always-on counter to find how long it slept, advances the tick count by that amount, and expires any timeouts that came due. The always-on counter must run at a known rate in every sleep mode. It is hard because errors accumulate: small mismatches between the sleep counter and the main clock become visible drift over days.",
    k: ["Always-on low-frequency counter versus estimating from the programmed wake time: the counter measures real sleep length even for early wakes, but is coarse; the estimate is exact only for scheduled wakes.", "Applying the full correction at once versus in steps: one step is simple, but may expire many timeouts in one burst; stepping spreads load and delays them."],
    p: ["An early wake from another interrupt treated as a full scheduled sleep, so time runs fast.", "Rounding every correction the same way so error accumulates in one direction."],
    v: "Run an alternating sleep and wake workload for a day against an external reference and confirm the accumulated tick error stays within the specified bound.",
    dep: ["tick-counter","high-resolution-clock","tickless-idle"]
  },
  "dynamic-frequency-scaling": {
    s: "Changing processor frequency and voltage at run time to match load, which saves energy but changes execution times, so deadlines must hold at every allowed setting.",
    d: "At lower frequency, tasks take longer and peripherals' derived clocks change. A policy raises frequency when load or deadlines demand and lowers it otherwise. Changes need clock reconfiguration, flash wait-state updates and timer adjustments done in a safe order. For hard real-time, analysis must be run at the lowest allowed frequency, or scaling is limited to cases where timing slack is proved. It is hard because every timing-dependent configuration, such as baud rates and timer reloads, must be updated with the clock.",
    k: ["Scaling allowed only with proved slack versus load-driven scaling: proved slack is safe but captures less saving; load-driven saves more and can miss a deadline when load rises suddenly.", "Fixed set of operating points versus continuous: fixed points can each be analyzed and tested, whereas continuous multiplies the cases."],
    p: ["Changing frequency without updating flash wait states, causing crashes at the fast setting.", "A serial port baud rate that drifts because the divider was not recomputed."],
    v: "Run the worst-case task set at the lowest allowed operating point, confirm all deadlines are met, and cycle between points under load verifying peripherals keep working.",
    dep: ["clock-and-memory-init","power-state-manager","schedulability-analysis"]
  },
  "power-state-manager": {
    s: "The component that coordinates device and system power states, tracking what each driver needs and deciding when sleep, clock gating and scaling are allowed.",
    d: "Drivers and tasks register constraints: this peripheral needs the high-speed clock, this transfer forbids deep sleep, this task needs a wake-up within a given time. The manager takes the strictest combination, and when the system is idle picks the allowed state. It calls driver suspend and resume functions in dependency order. It is hard because constraints must be released reliably: a leaked constraint keeps the device from sleeping and shortens battery life without any visible fault.",
    k: ["Constraint registration by each driver versus a global policy table: registration keeps policy next to the code that knows it, but is spread out; a table is reviewable and may go out of date.", "Suspend callbacks per device versus whole-system sleep sequence: per device is modular, and ordering errors cause hangs on wake."],
    p: ["A constraint held after a failed transfer, so the device never sleeps again.", "A device resumed before its clock or supply dependency was restored."],
    v: "List active constraints from the running system after load stops, confirm none is held, and measure that the device reaches its lowest-power state within the expected time.",
    dep: ["driver-model","clock-and-power-gating"]
  },
  "startup-code": {
    s: "The first code that runs after reset: it sets the stack, copies initialized data, clears uninitialized data, configures the minimum hardware and calls into the kernel and application.",
    d: "Reset loads the stack pointer and jump address from a table. Startup code then sets up clocks and memory if needed, copies initial values for variables from flash to RAM, zeroes the rest, calls constructors or initialization hooks, and finally starts the kernel, which creates tasks and starts the scheduler. It can also read the reset cause. It is hard because this code runs before the system is consistent, with no stack protection or error handling, so a mistake leaves no visible symptom.",
    k: ["Minimal startup with late initialization versus full initialization before main: minimal gets to the application quickly, but pushes setup into code that runs under the kernel; full is orderly and slower.", "Zero or pattern fill of memory at startup: filling with a pattern aids stack checks and fault detection, at a cost in startup time."],
    p: ["Using a variable before its initial value was copied, getting garbage in a rare reset path.", "Starting the scheduler before drivers are initialized so a task uses a peripheral too early."],
    v: "Dump RAM right after startup and confirm initialized data matches the image and the rest is zero or the pattern, then verify the reset cause register is captured on each reset type.",
    dep: ["image-layout","clock-and-memory-init"]
  },
  "clock-and-memory-init": {
    s: "The early configuration of oscillators, phase-locked loops, bus clocks, flash wait states and external memory so the processor runs at its intended speed with working memory.",
    d: "Startup selects a clock source, waits for it to stabilize, programs multipliers and dividers, sets flash wait states to match the new frequency, and switches the system clock. External memory controllers are configured with timing parameters before use. A failure to lock should fall back to a safe clock and report. It is hard because the order is critical and wrong values may crash or damage timing in ways that look random, and all derived peripheral rates depend on this one step.",
    k: ["Run from internal oscillator versus crystal at startup: internal starts quickly and needs no external part, but is inaccurate; crystal is accurate and takes time to start and can fail.", "Raise frequency early versus after initialization: early speeds up startup, but risks running with untested settings; late is slower and safer."],
    p: ["Raising the clock before raising flash wait states, hanging on the first instruction after the switch.", "No fallback when the crystal fails to start, so the device never boots."],
    v: "Measure the system clock output and a derived peripheral clock after startup with a frequency counter and confirm the values, and test startup with the crystal removed to check the fallback.",
    dep: []
  },
  "kernel-configuration": {
    s: "The compile-time settings that select kernel features, limits and policies, such as tick rate, number of priorities, enabled objects and checks, in one reviewed file.",
    d: "A configuration file or tool defines the tick frequency, priority count, preemption on or off, stack-check mode, which synchronization objects are built in, hook enable flags, and static limits. Only enabled features occupy code and memory. The configuration is part of the certified or tested artifact: changing an option changes behavior and timing. It is hard because options interact, and some combinations are untested or invalid, so the build should reject inconsistent settings.",
    k: ["Header file of macros versus a generated configuration from a model: a header is simple and visible, but easy to edit inconsistently; a tool validates combinations and costs setup.", "Many options versus few: many options fit tight devices, but multiply the combinations to test; few options mean larger code and less variety."],
    p: ["An option changed for one product and the timing evidence reused unchanged.", "A tick rate change that alters all tick-count based delays without review."],
    v: "Build with the shipped configuration, print the resolved options and sizes in the build log, and confirm they match the configuration index in the release evidence; try an invalid combination and confirm rejection.",
    dep: []
  },
  "bootloader": {
    s: "A small, separate program that runs first, checks the application image and starts it, and can load a new image over a wired or wireless link.",
    d: "At reset the bootloader runs from protected flash, verifies the application's integrity and often a signature, and jumps to its entry point after setting the vector table. If verification fails, or an update is requested, it stays in update mode, receives an image over a serial, bus or network link and programs flash. It is hard because it must be correct above all else: an interrupted or buggy bootloader leaves the device unbootable, and it contains the privileges that attackers want.",
    k: ["Bootloader protected from update versus updatable: protected is safe from corruption, but bugs cannot be fixed; updatable can be repaired, and needs a second recovery path.", "Verify the image on every boot versus only after update: every boot catches corruption and costs startup time; only after update is quick and misses later bit rot."],
    p: ["Jumping to an application with the vector table still pointing to the bootloader.", "Power loss during programming leaving a half-written application that passes no check and cannot be recovered."],
    v: "Cut power at random points during update many times and confirm the device always boots either the old or new image, never a partial one.",
    dep: ["startup-code","flash-and-nvm-driver","secure-update-and-rollback"]
  },
  "secure-update-and-rollback": {
    s: "A scheme for installing new firmware that authenticates the image, writes it to a spare slot, tests it and falls back to the old version if the new one fails to confirm itself.",
    d: "The new image arrives with a signature and version. The updater checks the signature and the anti-rollback counter, writes to the inactive slot, marks it pending, and resets. The bootloader runs it in trial mode; the application must confirm health within a time or the bootloader reverts. This needs two image slots and a small state record. It is hard because many failure points exist (link loss, power loss, a bad image that boots but misbehaves) and each must lead to a working device.",
    k: ["Two slots with swap versus execute-in-place from either: swapping keeps one fixed run address and costs time and flash wear; executing from either needs position-independent or per-slot builds.", "Confirm by the application versus automatic after boot: application confirmation catches an image that boots but fails, and adds a way to be stuck unconfirmed."],
    p: ["An anti-rollback counter updated before the image was proven good, locking out the working version.", "A confirmed image that works at the bench but fails with real-world data, with no further fallback."],
    v: "Install a deliberately faulty image on a device and confirm it reverts to the old image without human action, and that an older signed image is rejected by the anti-rollback check.",
    dep: ["bootloader","secure-storage-and-crypto","flash-and-nvm-driver"]
  },
  "image-layout": {
    s: "The arrangement of code, constants, initial data and reserved areas in flash and RAM, defined by the linker script and fixed so the bootloader, kernel and application agree on it.",
    d: "The layout reserves flash for the bootloader, a header with version and checksum, the application and persistent data, and RAM for stacks, kernel data and buffers. Alignment and region sizes follow the protection unit's rules. Symbols exported from the layout tell the code where each region begins and ends. A map file records every placement. It is hard because the pieces are built separately and must agree: a changed size in one breaks others in ways that show up only at run time.",
    k: ["Fixed addresses for each component versus relocatable images: fixed addresses are simple and checked at link time, but constrain growth; relocatable gives flexibility at the price of tooling and run-time cost.", "Image header with checksum versus none: a header allows verification and version checks, but costs flash and demands a tool to write it."],
    p: ["An application that grows into the persistent data area and erases settings on update.", "A mismatch between the bootloader's idea of the vector table address and the linked one."],
    v: "Check the map file against the layout specification for overlaps, margins and alignment in the build, and boot the image through the real bootloader to confirm the header and entry point are found.",
    dep: []
  },
  "architecture-port-layer": {
    s: "The small, processor-specific part of the kernel holding context switch, interrupt entry, tick setup, critical-section primitives and the initial stack frame, which is all that changes between chips.",
    d: "The kernel is written against a narrow interface: how to build a task's first stack frame, how to switch contexts, how to mask interrupts, how to start the first task and how to set the tick. The port implements these for one core, partly in assembly. It documents which registers are saved, how nesting is handled and any restrictions on interrupt priorities. It is hard because bugs here are timing dependent, and because the port must be validated per core variant and per compiler.",
    k: ["Thin port with all policy in portable code versus optimized per-core kernel: thin ports are easy to validate and move to new chips, but leave some speed unused; optimized ports are fast and costly to maintain.", "Port in assembly versus compiler intrinsics: assembly gives exact control; intrinsics are readable and depend on the compiler."],
    p: ["A port written for one core revision and used on another with different floating-point or protection behavior.", "Assumptions about stack alignment that a compiler update breaks."],
    v: "Run the kernel's port test suite on the target, which checks register preservation, nesting, priority masking and switching under random interrupts, and confirm all tests pass for the exact compiler and core.",
    dep: ["context-switch","interrupt-controller-and-priorities"]
  },
  "board-support-package": {
    s: "The code and configuration specific to one board: pin assignments, clock setup, memory map, startup, and drivers for the devices wired to it, packaged so the application is portable.",
    d: "It includes the startup sequence, clock and memory initialization, pin multiplexing for the board's wiring, interrupt priority assignments and drivers for on-board devices such as sensors, displays and storage. The kernel and application call board-independent interfaces, and the package binds them to hardware. A new board revision needs a new or adjusted package. It is hard because the package is a mix of boot code, configuration and drivers that grows with every revision, and wiring errors surface as software bugs.",
    k: ["One package per board versus parameterized by configuration: per board is simple and diverges; parameterized shares code and puts more variation into configuration.", "Board knowledge in the package versus in the application: in the package keeps application portable, and pushes board-specific logic into code that may be less tested."],
    p: ["A pin assignment conflict between two peripherals not caught until both are used.", "Application code that bypasses the package and uses board-specific addresses."],
    v: "Boot the board, run the package's self-test that exercises each wired device and pin, and confirm the same application image logic runs unchanged on two board revisions.",
    dep: ["startup-code","hardware-abstraction-layer","gpio-and-pin-mux","clock-and-memory-init"]
  },
  "hardware-abstraction-layer": {
    s: "A uniform programming interface over similar peripherals across chips, so drivers and applications call the same functions whatever the vendor's register layout.",
    d: "The layer exposes operations such as configure, read, write and transfer for each peripheral class, hiding register details and chip variants. It may be thin macros over registers or a full driver set with interrupt and direct-memory-access support. Its calls specify whether they block, use interrupts or complete by callback. It is hard because abstraction costs time and code, and because behavior that differs between chips (timing, error handling, buffering) leaks through any common interface.",
    k: ["Thin layer close to registers versus rich portable layer: thin is fast and exposes chip features, but ties code to the chip; rich is portable, larger and slower and hides specifics.", "Blocking versus non-blocking calls: blocking is simple to use and stalls the caller; non-blocking with callbacks keeps tasks responsive and needs more state."],
    p: ["A blocking hardware call used from a high-priority task, stalling it for a slow transfer.", "A portable interface that hides a chip-specific limit such as maximum transfer size."],
    v: "Run the same driver test suite against two chip variants through the layer, confirm identical functional results, and measure the added call overhead against direct register access.",
    dep: ["driver-model"]
  },
  "driver-model": {
    s: "The conventions every driver follows for open, close, read, write and control, and for blocking, interrupt use, buffering and locking, so drivers behave predictably under the kernel.",
    d: "A driver owns a device, a lock or an exclusive-access rule, and often buffers filled by interrupts or direct memory access. The model states which calls block and for how long, how errors are reported, how interrupt handlers pass data to tasks, and how power management hooks work. Following one model makes timing analysis of the whole system possible. It is hard because device behavior is unforgiving, and one driver that disables interrupts for a long time breaks everything.",
    k: ["Interrupt-driven with buffers versus polling: interrupts free the processor but add latency sources and complexity; polling is simple and wastes time or adds delay.", "One task per device versus a shared driver task: per-device isolates timing and uses stacks; a shared task saves memory and serializes unrelated devices."],
    p: ["A driver holding interrupts masked while waiting for a hardware flag.", "Two tasks using one non-reentrant driver without exclusion."],
    v: "Run the driver with the worst combination of competing tasks and interrupts, measure its longest masked interval and longest blocking time, and confirm they match the numbers in its documentation.",
    dep: ["deferred-interrupt-handling","mutexes","message-queues"]
  },
  "serial-bus-drivers": {
    s: "Drivers for serial and synchronous buses used to talk to sensors, memory and modules, which handle transfers by interrupt or direct memory access with timeouts and error recovery.",
    d: "Each driver configures the controller, queues transfer requests and completes them by interrupt or transfer-complete signal, waking the requesting task. Timeouts guard against a device holding the bus. Shared buses need a lock so only one task runs a transaction at a time. Error cases include stuck lines, framing errors and overrun. It is hard because transfer times depend on the external device, so a task's response includes time it does not control.",
    k: ["Direct memory access versus byte-by-byte interrupts: direct memory access uses little processor time for large transfers, but needs buffer rules; byte interrupts suit short transfers and cost more per byte.", "Blocking transaction call versus asynchronous with completion: blocking is simple, but ties the task to the slowest device; asynchronous allows overlap with more state."],
    p: ["A stuck bus line with no timeout, hanging the task and everything waiting for the bus lock.", "A transfer shared between two tasks interleaving and corrupting each transaction."],
    v: "Unplug or hold a device line low during a transfer and confirm the driver times out within its limit, releases the lock and reports an error, and that normal transfers resume afterward.",
    dep: ["driver-model","dma-drivers","mutexes","timeouts-and-delay-lists"]
  },
  "gpio-and-pin-mux": {
    s: "Drivers for general-purpose input and output pins and for assigning each physical pin to a peripheral function, including edge-triggered interrupts and debouncing.",
    d: "Pin multiplexing chooses which peripheral drives each pin and its electrical mode. GPIO functions read and write pins atomically and configure interrupts on edges or levels. For inputs from switches, debouncing by timer or filter avoids false events. Outputs may need set-and-clear registers so tasks do not disturb each other's pins. It is hard because wiring conflicts are silent, and read-modify-write on shared port registers races between tasks and interrupts.",
    k: ["Atomic set and clear registers versus read-modify-write: atomic registers need no locking, but depend on hardware support; read-modify-write needs a critical section.", "Debounce in hardware filter versus in software timer: hardware filtering costs nothing in code but has fixed timing; software is flexible and uses a timer and tick."],
    p: ["Two tasks changing different bits of the same port with read-modify-write, losing one change.", "A pin left floating or in the wrong mode at startup, driving an actuator briefly."],
    v: "Toggle pins from two tasks and an interrupt at high rates and confirm on a logic analyzer that no change is lost, and check all outputs at their defined state during the first microseconds after reset.",
    dep: ["driver-model","interrupt-controller-and-priorities"]
  },
  "analog-and-timer-drivers": {
    s: "Drivers for analog-to-digital conversion, pulse-width generation and input capture, which turn the physical world into scheduled samples and precisely timed outputs.",
    d: "Conversions are triggered by a timer at a fixed rate so sampling jitter does not depend on software. Results move by direct memory access into buffers, and a task or interrupt is notified when a block is ready. Pulse-width outputs update on timer boundaries so a new value takes effect cleanly. Input capture timestamps edges in hardware. It is hard because correctness depends on hardware timing: a software-triggered sample has jitter equal to the task's response, which control algorithms treat as noise.",
    k: ["Hardware-triggered sampling versus software-triggered: hardware gives exact sample times and needs peripheral linking; software is simple and adds jitter equal to scheduling delay.", "Single sample interrupts versus block transfer: blocks reduce interrupts and add latency equal to the block time."],
    p: ["Updating an output value in the middle of a timer period and producing a glitch.", "A buffer that is read while direct memory access is still writing it."],
    v: "Feed a known waveform to the input and measure the sample timestamp jitter against a reference clock; apply a changing duty cycle and confirm on a scope that updates only occur at period boundaries.",
    dep: ["dma-drivers","hardware-timer-source","driver-model"]
  },
  "dma-drivers": {
    s: "Drivers for the direct memory access controller, which moves data between peripherals and memory without the processor, with channel allocation, buffer ownership and completion signaling.",
    d: "A driver configures a channel with source, destination, length and trigger, starts it, and receives a completion or error interrupt. Peripheral drivers use it for bulk transfers: serial, analog conversion, display. Chains of descriptors let transfers run back to back. The controller competes with the processor for the bus, so heavy transfers slow down tasks. It is hard because buffer ownership is tricky: memory belongs to the hardware during the transfer and to software before and after, and cache and alignment rules apply.",
    k: ["Circular buffer with half and full interrupts versus one-shot transfers: circular keeps data flowing with no gap and needs processing within the half period; one-shot is simple and can leave gaps.", "Priority for real-time channels versus fair sharing: priority guarantees urgent transfers and can starve others, while fair sharing bounds each one's delay."],
    p: ["Reading a buffer the controller is still writing, mixing old and new data.", "Bus contention from a large transfer stretching a high-priority task's execution time."],
    v: "Run maximum-rate transfers on all channels while a timing-critical task runs, and confirm no data is lost, completion interrupts come at the right times, and the task's execution time stays within its bound.",
    dep: ["cache-and-dma-buffers","interrupt-controller-and-priorities","driver-model"]
  },
  "flash-and-nvm-driver": {
    s: "The driver that reads, programs and erases on-chip or external flash and other non-volatile memory, handling timing, locking and the stall when code runs from the same flash.",
    d: "Flash can only be programmed from one to zero and must be erased in large blocks, taking milliseconds. During erase or program, reading the same flash bank may stall or fail, so the driver runs critical code from RAM or from another bank, and it may disable interrupts whose handlers live in that flash. Writes are checked by read-back, and the driver reports errors and wear. It is hard because a long erase can stop the whole processor, which breaks every deadline unless planned for.",
    k: ["Erase from RAM-resident code versus dual-bank flash: RAM code works on any chip and holds interrupts off for the duration; dual bank lets code run during erase and needs chip support.", "Blocking erase versus erase suspend: suspend lets urgent reads happen mid-erase, and needs the chip feature and careful resumption."],
    p: ["Taking an interrupt whose handler is in the flash being erased, hanging the system.", "Writing the same page repeatedly until it wears out."],
    v: "Erase and program a block while a high-priority task runs from flash, and confirm the maximum stall seen by that task matches the documented figure and no deadline is missed.",
    dep: ["driver-model","linker-placement","interrupt-masking"]
  },
  "can-and-ethernet-drivers": {
    s: "Drivers for the bus controller and network controller that move frames to and from memory with descriptor rings or mailboxes, hardware timestamps and error-state tracking.",
    d: "Receive and transmit use rings of descriptors pointing at buffers; the controller fills received frames and signals by interrupt. Priority and filter settings select which frames the device handles and in what order they are sent. Error counters and bus-off states are reported to upper layers. Hardware timestamping marks frames on the wire. It is hard because traffic arrives at rates set by others, so buffers must absorb bursts and drops must be counted, and handlers must stay short at high frame rates.",
    k: ["Interrupt per frame versus batching with a timer: per frame gives minimum latency, but at high rates consumes the processor; batching cuts load and adds delay.", "Hardware filtering versus software filtering: hardware discards unwanted frames without processor time, but has limited filter slots."],
    p: ["A receive ring too small for a burst, dropping the frame that carried a critical command.", "Treating bus-off recovery as automatic when the controller needs a manual restart."],
    v: "Send frames at the maximum bus rate with injected errors and confirm every accepted frame arrives intact, the drop counter matches known losses, and recovery from bus-off completes within the specified time.",
    dep: ["driver-model","dma-drivers","deferred-interrupt-handling"]
  }
});
