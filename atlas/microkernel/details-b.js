// Details for the microkernel plate, part 2: scheduling, initialization, pagers, resource managers, component frameworks.
ATLAS.details("microkernel", {
  "thread-scheduler": {
    s: "The kernel code that picks the next thread to run on a core, using fixed priorities and, with scheduling contexts, a time budget that decides whether a thread may run.",
    d: "On every event that changes who is runnable (a wakeup, a block, a budget exhaustion, a timer tick) the scheduler selects the highest-priority runnable thread that has budget left. It is deliberately simple: no load balancing, no fairness heuristics, no priority aging. Anything smarter is a user-level policy that adjusts priorities and budgets through capabilities. Simplicity keeps the worst-case time of the scheduler bounded and its behavior analyzable. The hard part is that user-level policy then carries the responsibility for fairness and starvation.",
    k: ["Fixed-priority preemptive scheduling versus time-sharing with dynamic priorities: fixed priority is predictable and analyzable, but starvation of low priorities is the designer's problem.", "Scheduler in the kernel versus in user space: in-kernel is fast and provable, but forces a single policy for all workloads."],
    p: ["A high-priority thread in an unbounded loop starves everything below it, with no kernel mechanism to stop it except its budget.", "Assigning priorities by guess instead of analysis invites priority inversion."],
    v: "Run three compute threads at distinct priorities on one core and confirm only the highest consumes time while it is runnable, and the others progress as soon as it blocks.",
    dep: ["priority-ready-queues","scheduling-context","kernel-entry-exit"]
  },
  "priority-ready-queues": {
    s: "The per-core array of queues, one per priority level, plus a bitmap that lets the kernel find the highest nonempty level in constant time.",
    d: "Runnable threads sit in the queue for their priority, in the order they became ready. A bitmap with one bit per level lets selection find the top level with a few instructions, regardless of how many threads exist. Within a level, threads share the processor round-robin as budgets expire. Queue operations are constant time and need no allocation, because links live in the thread control blocks. The hard part is queue maintenance under thread deletion, priority change and migration, all of which must unlink a thread in whatever queue it occupies.",
    k: ["Bitmap over per-priority queues versus a sorted list: a bitmap gives constant-time selection, but needs a fixed number of levels chosen up front.", "FIFO within a level versus shortest-remaining: FIFO is predictable and cheap, but offers no help for latency-sensitive threads at the same level."],
    p: ["A thread unlinked from the wrong queue after a priority change corrupts the queue and loses threads.", "Too few priority levels forces unrelated tasks into the same level and into round-robin."],
    v: "Create threads at every priority level, block and unblock them in random order for a long run, and confirm the thread selected always has the highest level among those runnable at that instant.",
    dep: ["thread-control-block"]
  },
  "scheduling-context": {
    s: "A kernel object holding a processor time budget, a period and accumulated usage, which a thread must be bound to in order to run.",
    d: "A scheduling context is a capability to a quantity of processor time: a budget available every period, split into replenishments. A thread runs only while bound to a context that has budget, and the kernel charges the time actually used. Contexts can be created, configured and delegated by user level, so CPU time is allocated by granting capabilities instead of setting priorities alone. A context can be bound to a thread, or lent to another thread during a call. The difficulty is choosing budgets that are sufficient, and handling a thread that cannot run when its context is empty.",
    k: ["Time as a capability versus time as a priority only: capabilities allow enforced budgets and delegation, but every runnable thread needs a context supplied by someone.", "Per-thread contexts versus per-server contexts: per-thread binding is simple, but a server then spends its own time on clients' work."],
    p: ["A thread with no bound context never runs, and the failure looks identical to a deadlock.", "Budgets set from average load rather than worst case cause deadline misses under bursts."],
    v: "Bind a spinning thread to a context with a 10 percent budget and measure its processor share over a second; confirm it does not exceed that share while a lower-priority thread gets the rest.",
    dep: ["kernel-object-model","budget-replenishment"]
  },
  "budget-replenishment": {
    s: "The rule for returning consumed time to a scheduling context: a sporadic server style queue of refills, each restoring a portion of budget at a set time after use.",
    d: "A context holds a queue of replenishment records, each an amount and a time at which it becomes available. When a thread runs, the kernel deducts from the head record, and when that is consumed the thread stops until the next one is due. Using time at a refill, not at period boundaries, prevents a thread from running back to back across a boundary and exceeding its rate. The kernel sets a timer for the next refill. The hard part is bounding the number of records, since each preemption splits one, and a limit forces merging them.",
    k: ["Sporadic replenishment versus periodic reset: sporadic bounds usage in any window and lets a thread run later, but costs a record queue and timer reprogramming.", "A large versus small record limit: more records track usage precisely, but memory and bookkeeping cost grows per context."],
    p: ["Too few refill records under frequent preemption makes a context lose budget it was owed.", "A budget below the kernel's timer granularity can never be enforced."],
    v: "Run a thread with budget 2 ms every 10 ms, and plot cumulative CPU time in 10 ms windows with the sliding window method; confirm no window exceeds the budget, including across preemptions.",
    dep: ["scheduling-context","timer-source"]
  },
  "context-donation": {
    s: "The mechanism by which a client lends its scheduling context to a server for the duration of a call, so the server's work is charged to, and runs at the priority of, that client.",
    d: "A server thread can be passive: it has no scheduling context of its own and consumes none while idle. When a client calls, the kernel moves the client's context to the server, which runs on it until it replies, and then returns the context. The time the server spends is deducted from the client's budget. This prevents a server from being a hole in the budget system, and bounds priority inversion since the server runs at the client's priority. The hard part is servers that need to block on another resource or call a third party.",
    k: ["Passive servers on donated time versus servers with their own budget: donation gives accurate accounting and inheritance, but a server cannot do background work without a context of its own.", "Donation across a chain of calls versus one hop: chains keep charging the original client, but lengthen the unwinding when one link fails."],
    p: ["A client whose context runs out mid-call leaves the server stopped holding a lock that others need.", "A passive server given no context for its initialization never starts."],
    v: "Have a low-budget client call a passive server that loops; confirm the server stops when the client's budget expires and is charged to that client in the usage report, not to its own.",
    dep: ["scheduling-context","synchronous-call"]
  },
  "timer-source": {
    s: "The hardware timer the kernel programs to interrupt at the next time any event is due, such as a budget expiry or a replenishment, rather than at a fixed tick.",
    d: "A tickless kernel sets the timer for the earliest of the next replenishment, the current budget's end and any user-requested wakeup. The interrupt handler updates time, makes threads whose time arrived runnable and picks a new thread. A timer capability can also be given to a user-level time server so that sleeping and timeouts are services built on notification. The hard parts are precision: timer reprogramming costs time on each switch, hardware counters wrap, and several cores may each hold different expiry times.",
    k: ["Tickless one-shot timer versus periodic tick: one-shot saves power and gives precise budgets, but reprogramming adds cost to every switch.", "Time exposed through kernel call versus a mapped counter: a mapped counter makes reads cheap, but gives no kernel-validated source."],
    p: ["Programming a deadline already in the past after a slow operation misses the interrupt and sleeps indefinitely.", "Clock drift between cores makes timeouts differ depending on where a thread ran."],
    v: "Schedule wakeups at 100 microsecond intervals for ten seconds and compare actual arrival times against the requested ones, confirming jitter stays within the platform's documented bound.",
    dep: ["interrupt-delivery"]
  },
  "multicore-scheduling": {
    s: "How threads are assigned to cores: each is pinned to one core by its control block, and a user-level policy moves threads by reconfiguring them.",
    d: "Each core has its own ready queues and scheduling state, and the kernel never migrates a thread by itself. A thread's affinity is a field in its control block, changed by a call that user-level load balancers use. Scheduling contexts also have a core. Cross-core IPC causes a thread to be woken on its own core through an inter-processor signal. The hard part is deciding who owns balancing: fixed partitioning is predictable but wastes capacity, and a user-level balancer must observe load through whatever tracing the kernel gives.",
    k: ["Kernel-pinned threads with user-level migration versus kernel load balancing: pinning keeps kernel state per core and analyzable, but good balance is the policy author's job.", "Partitioned versus global scheduling for real-time work: partitioned is easier to analyze, but cannot use idle capacity on other cores."],
    p: ["All service threads left on the boot core leave the others idle while one core saturates.", "Cross-core calls to a server pinned elsewhere add inter-processor latency to every request."],
    v: "Pin eight busy threads across four cores, move one thread by changing its affinity, and confirm per-core utilization shifts as expected without the thread losing state.",
    dep: ["thread-scheduler","cross-core-signals"]
  },
  "bootloader-handoff": {
    s: "The point at which firmware or a boot loader places the kernel and a first user image in memory, and passes a description of memory and devices.",
    d: "The loader places the kernel image and the initial user-level image, called the system image, in physical memory, and enters the kernel with a pointer to a description of memory regions, reserved ranges and device information. The kernel builds its own tables, enables translation, turns on its timer and interrupt controller, then creates the first thread. Anything the loader got wrong about memory is found here. The hard part is trust: a measured chain from firmware to kernel to the root task must be established here if attestation is required.",
    k: ["Loader passes a generic memory map versus the kernel probing hardware: a passed map keeps the kernel small, but ties it to what the loader reports.", "Kernel and image loaded together versus kernel loading the image: loading both together avoids a filesystem or loader in the kernel, but makes the image static."],
    p: ["A loader that reports a region as free when it holds the system image lets the kernel overwrite its own root task.", "A memory map missing device regions leaves the root task unable to give drivers their registers."],
    v: "Boot with a deliberately overlapping reserved region and confirm the kernel reports the conflict and halts, rather than silently handing the root task memory that overlaps the image.",
    dep: []
  },
  "boot-info": {
    s: "The structure the kernel hands the root task describing every initial capability: which slots hold which untyped regions, device regions, frames, and the bounds of free slots.",
    d: "At the end of kernel initialization, the kernel creates the root task's capability space and fills it with capabilities for everything it knows: all untyped memory with sizes and whether each is device memory, the root task's own thread, address space and frames, interrupt control, and a range of empty slots. A boot-info page lists, for each, the slot number and attributes. The root task reads this table to learn its world. The difficulty is that the layout is the root of trust, and any error in it means a missing or duplicated authority.",
    k: ["One structure listing everything versus a query call for each item: one structure is simple and needs no call interface, but fixes the layout the root task must understand.", "Untypeds sorted by size or by address: sorting by size helps allocators, but loses the physical address relationship unless listed."],
    p: ["A root task that indexes boot information with stale layout assumptions treats a device region as ordinary memory.", "Free slot range exhausted early leaves no room for initial setup."],
    v: "Dump the boot-info table, sum the untyped sizes and compare against the memory map reported by the loader, confirming the totals match and no region appears twice.",
    dep: ["bootloader-handoff","untyped-memory","capability-space"]
  },
  "root-task": {
    s: "The first user-level thread, holding all authority at boot, which creates the rest of the system and then gives away or retains capabilities according to policy.",
    d: "The root task starts with every capability the kernel created. It splits untyped memory into pools, starts the resource managers and a name server, loads or starts each service with only the capabilities it needs, and then should drop what it no longer needs. After initialization it often remains as the memory and process manager, or exits. It is the single most trusted program in the system, since a bug in it can hand out too much. The difficulty is keeping it small and correct while it has to understand every capability layout.",
    k: ["Root task that stays resident as a manager versus one that exits after setup: staying lets it serve later requests, but keeps total authority alive and exposed.", "Static system built by the root task versus a dynamic one: a static layout can be checked before boot, but cannot adapt to hardware or load."],
    p: ["A root task that retains the interrupt control and all untyped memory after setup turns any bug in it into total compromise.", "Passing a service more untyped memory than needed because splitting is tedious defeats quotas."],
    v: "After initialization, list the root task's remaining capabilities with the capability inspector and confirm they match the documented minimum, with no untyped memory beyond the manager pool.",
    dep: ["boot-info","initial-capability-set","untyped-allocator"]
  },
  "initial-capability-set": {
    s: "The specific capabilities the root task gives each starting component, constructed from the system description so each holds only the authority its role requires.",
    d: "For every component the root task creates a capability space, then copies in capabilities: its own endpoints, send capabilities to services it uses, frames for shared buffers, interrupt handlers for devices it drives, and a scheduling context. Rights are reduced and badges are added at this point. The result is a graph where any permitted flow is visible. Building these sets by hand is error-prone, so they are generated from a declared description. The hard part is making sure the description is the only source: ad hoc grants later erode the audited graph.",
    k: ["Everything granted at startup versus authority acquired later through brokers: startup grants are auditable as one graph, but cannot express dynamic relationships.", "Minimal sets with more IPC versus broader sets for speed: minimal sets limit damage, but each missing capability becomes a brokered call."],
    p: ["Copying a capability with full rights because reducing it required another step gives the component more than its role.", "A component given the capability for another's endpoint with receive rights can impersonate that service."],
    v: "For each component, diff the capabilities it holds at start against its declared requirements, and confirm there is no capability that the description does not list.",
    dep: ["root-task","capability-rights","delegation"]
  },
  "system-image-loader": {
    s: "The code, usually in the root task or a process server, that reads executable images from the boot image, creates address spaces and maps segments for each component.",
    d: "The system image holds the executables of the initial servers. The loader creates an address space and capability space for each, retypes frames, copies or maps the segments with the right permissions, sets up a stack and the IPC buffer, installs the initial capability set, and starts the thread at its entry point. It must handle relocation if images are position independent. Later, a file server provides the same image-loading service for programs on disk. The hard parts are doing this with only user-level mechanisms and bounded memory, and without trusting the image's headers.",
    k: ["Loader in the root task versus a separate loader server: in the root task is the smallest early system, but makes the trusted component larger.", "Mapping segments directly versus copying: mapping avoids using memory twice, but shares the writable data unless copy-on-write is provided."],
    p: ["Trusting segment sizes in an image header lets a malformed program map over the loader's own memory.", "Leaving a code segment writable during loading and never fixing permissions makes the program injectable."],
    v: "Load an image with a segment that overlaps another and confirm the loader refuses it; load a valid one and confirm the code segment is not writable and the data segment is not executable.",
    dep: ["root-task","frame-objects","address-space-object"]
  },
  "startup-ordering": {
    s: "The sequence in which services are started, so that each finds the services it depends on already running, and a failure during startup is detected rather than hung on.",
    d: "Servers depend on each other: a filesystem needs a block driver, which needs the interrupt capability, which needs the memory manager. The root task or an init service starts them in dependency order, waits for each to register with the name server or signal ready, and applies a timeout. The order is derived from the assembly description. After start, the same graph is used to restart a failed server and anything that held state from it. The hard part is circular dependency and a late failure that cascades through clients.",
    k: ["Explicit ordered startup versus on-demand start at first use: explicit order is predictable and catches failure early, but starts services that may never be needed.", "Readiness signaled by the service versus by the starter probing: self-signal is accurate, but a hung service never signals and needs a timeout."],
    p: ["A service waiting on a peer that waits on it back deadlocks the boot with no visible fault.", "A timeout too short on slow hardware aborts boot even though the system would have come up."],
    v: "Boot with one driver deliberately stalled and confirm the starter reports which dependency timed out, and that services not depending on it still start.",
    dep: ["root-task","service-registry"]
  },
  "user-level-pager": {
    s: "A user-level thread that receives page fault messages for another thread and resolves each by mapping a frame or deciding that the access is an error.",
    d: "The kernel does not manage paging policy. Each thread has a fault handler endpoint. On a page fault the kernel suspends the thread and sends a message with the faulting address, access type and instruction pointer. The pager decides: allocate and map a frame, fill it from a file, share an existing page, or kill the thread. It replies to resume the thread. All policy lives here: demand paging, lazy allocation, shared libraries, stack growth. The difficulty is that the pager must itself never fault on a path that depends on itself.",
    k: ["Per-thread fault handlers versus one global pager: per-thread handlers let each application or server choose its policy, but multiply the number of pagers to keep correct.", "Pager that maps a frame in the reply versus mapping through its own call: mapping in its own call is flexible, but needs a capability to the faulting space."],
    p: ["A pager that touches unmapped memory while handling a fault recurses, and the system hangs.", "A pager that is itself paged by a service waiting on it deadlocks."],
    v: "Run a thread that touches 1000 unmapped pages, confirm the pager receives 1000 fault messages with the right addresses, maps each, and the thread finishes with the correct contents.",
    dep: ["fault-protocol","frame-objects","page-table-objects"]
  },
  "fault-protocol": {
    s: "The message format the kernel uses to report a fault: type, faulting address, instruction pointer and access flags, sent on the thread's fault endpoint in the thread's name.",
    d: "On a fault the kernel builds a message with a label identifying the fault type (virtual memory, undefined instruction, unknown system call, capability fault, timeout) and words carrying the details. It sends it to the handler as if the faulting thread had called the endpoint, using a badge assigned when the handler was set up to identify the thread. The handler's reply either restarts the thread, optionally with changed registers, or leaves it blocked. The protocol is part of the kernel interface, so changing it affects every pager and handler.",
    k: ["Faults as IPC messages versus as upcalls or signals: messages reuse existing endpoint and scheduling machinery, but require a thread to be waiting to handle them.", "Reply that resumes with register changes versus resume only: changing registers allows emulation and recovery, but gives the handler control of thread state."],
    p: ["A fault endpoint with no receiver leaves the faulting thread silently blocked.", "Handlers that treat every fault type as a page fault misinterpret capability faults."],
    v: "Trigger one fault of each type from a test thread and confirm the handler receives the documented label, address and instruction pointer, and that replying resumes execution as specified.",
    dep: ["synchronous-call","thread-control-block"]
  },
  "exception-handlers": {
    s: "User-level handlers for non-memory faults such as invalid instructions, arithmetic errors, breakpoints and unknown system calls, reached through the same fault endpoint mechanism.",
    d: "A thread's fault endpoint also receives exceptions. A supervisor, debugger or runtime holds the endpoint's receive capability and decides what to do: kill the thread, emulate the instruction, translate a system call into a message to a server, or report a crash. This is how a single thread can run a legacy program whose system calls are turned into IPC, and how debuggers implement breakpoints. The hard parts are that registers must be read and set safely and that handler failure leaves threads blocked.",
    k: ["Handler per thread group versus per thread: a group handler reduces resources and simplifies supervision, but serializes handling for all its threads.", "Emulating in the handler versus killing the thread: emulation allows compatibility, but the handler becomes a large and trusted translation layer."],
    p: ["A breakpoint handler that does not restore the replaced instruction before resume re-faults forever.", "A supervisor crash leaves every thread it handled blocked with no one to report them."],
    v: "Execute an undefined instruction, an unknown system call and a breakpoint in a test thread, and confirm the supervisor receives each with registers intact and can resume after altering them.",
    dep: ["fault-protocol"]
  },
  "demand-paging-server": {
    s: "A pager built as a server that backs address spaces with files or swap, allocating frames on first touch and evicting under memory pressure.",
    d: "Demand paging is implemented entirely at user level: the pager keeps a table of virtual ranges and their backing, allocates frames from its quota, reads the data in from a file server or block driver, and maps them. Under pressure it chooses victims and unmaps their pages. Because it is just a server, different applications can use different policies, such as eager pinning for real-time tasks. The difficulty is cycles: the file server it depends on may itself be paged by this pager, so the dependency chain must be cut with pinned memory.",
    k: ["Swap and demand paging in a server versus omitted entirely: a server offers memory overcommit and file-backed mappings, but adds latency and a dependency cycle to manage.", "One shared pager versus per-application pagers: sharing gives global replacement decisions, but couples unrelated applications' latency."],
    p: ["Paging out the pages of the file server needed to page them back in deadlocks the whole system.", "Eviction with no feedback to applications causes thrashing that looks like a slow driver."],
    v: "Map a file larger than the available frame quota, read it sequentially, and confirm contents are correct, the resident set stays under the quota, and evicted pages are re-fetched on re-touch.",
    dep: ["user-level-pager","file-server","quota-accounting"]
  },
  "user-level-vmm": {
    s: "A user-level process that runs a guest operating system by handling its virtualization exits, emulating devices and mapping guest memory through ordinary capabilities.",
    d: "The kernel exposes virtual CPU objects and nested translation as capabilities. A virtual machine monitor creates a virtual CPU, supplies the guest memory as frames, and receives a fault message whenever the guest does something that exits: touching a device register, executing a privileged instruction or faulting on unmapped guest memory. It emulates the effect and resumes the guest. Guest drivers can be connected to native driver servers over shared rings. The difficulty is the amount of emulation code and its trust.",
    k: ["VMM as a user process per guest versus inside the kernel: a user process keeps the kernel small and contains a monitor bug to one guest, but costs an IPC on every exit.", "Emulated devices versus paravirtualized rings to driver servers: rings are far faster, but need guest-side drivers."],
    p: ["A VMM given direct access to host device memory for convenience lets a guest escape its box.", "Guest memory over-committed to the VMM without a pager makes the guest hang on a missing page."],
    v: "Boot a guest, have it read a device register not emulated, and confirm the VMM receives the exit with the right address, injects a defined value, and the guest continues without crashing the host.",
    dep: ["fault-protocol","frame-objects","virtual-device-rings"]
  },
  "untyped-allocator": {
    s: "The user-level service that tracks untyped memory capabilities, splits them by size and alignment, and hands out pieces to components against their quotas.",
    d: "Held by the root task or a memory manager, the allocator keeps untyped capabilities in size-sorted pools, splitting a larger one into halves on demand. It retypes pieces into objects on behalf of clients, or gives a client a sub-untyped to manage itself. It tracks which untyped each client was given, so it can revoke the lot when a client exits. Policy decisions are here: how much to reserve, whether device memory is segregated, and whether to scrub memory before reuse. The hard parts are fragmentation and keeping its own bookkeeping out of kernel memory.",
    k: ["Buddy-style splitting versus a fixed set of pool sizes: splitting adapts to any workload, but fragments over time; fixed pools are predictable and may waste memory.", "Allocator retypes for clients versus clients retype themselves: central retyping is auditable, but turns the allocator into a bottleneck."],
    p: ["Returning memory to a pool without zeroing it lets the next owner read the previous owner's data.", "Allocating from the largest piece first fragments the pool so that large objects fail later."],
    v: "Allocate and free a randomized mix of sizes for a million operations, then confirm a single large request of the original total size succeeds, showing memory coalesced back.",
    dep: ["untyped-memory","retype-operation","revocation"]
  },
  "cspace-slot-allocator": {
    s: "A user-level allocator that manages free slots in a capability space, handing out slot indices and expanding the space by adding nodes when it runs out.",
    d: "Every capability a component receives or creates must go into an empty slot, and the kernel will not choose one. A slot allocator tracks which indices are free in each component's space, and grows the space, by retyping a new node and linking it, when needed. Servers use it constantly, to hold reply capabilities, received capabilities and objects they create. It must also make slots reusable after deletion. The difficulty is that growth needs untyped memory, and that a server that runs out of slots stops being able to accept requests.",
    k: ["Preallocated large space versus growing on demand: preallocation is simple and cannot fail mid-request, but costs memory for every component.", "Slot indices managed by a shared library versus a central service: a library has no IPC cost, but cannot enforce limits against its own process."],
    p: ["A server that leaks received capability slots eventually refuses all requests with no memory error to blame.", "Growing the capability space inside a request path introduces an allocation that can fail unpredictably."],
    v: "Have a server accept and delete a million capabilities in a loop and confirm the count of occupied slots returns to baseline each time and the allocator never grows past its cap.",
    dep: ["capability-space","untyped-allocator"]
  },
  "address-space-allocator": {
    s: "The user-level bookkeeping of which virtual address ranges in a process are in use, and for what, so mappings, stacks and shared regions do not overlap.",
    d: "Since the kernel maps only what it is told to, each process needs a record of its virtual layout: code and data from the image, heap, thread stacks with guard pages, IPC buffers, and shared-memory regions. A library or the process server maintains it, usually as a tree of ranges, and also tracks which page tables were installed for them. It decides placement, such as keeping a gap around stacks. It is hard because the layout must stay consistent with the kernel's table state, which it cannot query cheaply.",
    k: ["Layout tracked inside each process versus in the process server: inside the process is fast and local, but a compromised process can lie about it.", "Fixed layout per component type versus dynamic placement: fixed layouts make each address predictable and checkable, but waste address space."],
    p: ["No guard page below a thread stack lets an overflow silently corrupt the neighboring mapping.", "Dropping a mapping record without unmapping leaves a frame mapped that the allocator believes free."],
    v: "Create 10,000 mappings and stacks with random sizes, unmap half, and confirm that no two live ranges overlap and each guard page faults when touched.",
    dep: ["page-table-objects","frame-objects"]
  },
  "quota-accounting": {
    s: "Tracking and limiting how much untyped memory, capability slots, CPU budget and address space each component may consume, through the capabilities it has been granted.",
    d: "The kernel keeps no per-process counters. A quota is enforced by what was handed over: a component given a fixed amount of untyped memory cannot use more, and a component given a scheduling context with a budget cannot exceed it. A resource manager records what each client holds, so it can report usage, refuse further requests and reclaim everything on exit. Policy servers set the numbers. The difficulty is covering indirect use: a client can make a server allocate on its behalf, so servers must charge back to the client's own pool.",
    k: ["Quota by granting finite resources versus by counters in a manager: granting is enforced by the kernel and cannot be bypassed, but is coarse and hard to adjust.", "Servers allocate from the client's memory versus their own: client-funded allocation prevents exhaustion attacks, but requires clients to supply memory with each request."],
    p: ["A server that allocates per-client state from its own pool lets any client exhaust it by opening many connections.", "Quotas set at design time and never revisited are wrong after workloads change."],
    v: "Start a client with a 10 MB quota, have it request a service that allocates, and confirm the 10 MB limit is hit first on the client's pool while the server's own pool is unchanged.",
    dep: ["untyped-allocator","cpu-budget-allocator","scheduling-context"]
  },
  "cpu-budget-allocator": {
    s: "The user-level service that divides processor time among components by creating scheduling contexts with budgets and periods, and checking the total does not exceed capacity.",
    d: "Holding the capability that creates scheduling contexts, this service admits each component by testing that the sum of budget over period across all contexts on a core stays under what the real-time analysis allows. It then gives the component a context sized accordingly. It can adjust budgets as workloads change and reclaim them when a component exits. It is the policy half of scheduling: the kernel enforces the budget, and this decides what the budgets are. The hard part is deciding sufficient budgets from measured worst-case times that may be unreliable.",
    k: ["Strict admission control versus best-effort assignment: strict admission guarantees deadlines for admitted tasks, but rejects work that might have fit.", "Static budgets from an offline analysis versus dynamic adjustment: static budgets are analyzable, but cannot follow changing demand."],
    p: ["Admitting by average execution time lets one burst cause deadline misses across other components.", "Overcommitted utilization above the schedulable bound makes every deadline guarantee void."],
    v: "Request budgets that sum above the admissible limit and confirm the allocator refuses the last request; with admitted tasks running, confirm each meets its deadline over an hour.",
    dep: ["scheduling-context","budget-replenishment","quota-accounting"]
  },
  "process-server": {
    s: "The service that creates and destroys processes on behalf of clients: allocating address and capability spaces, loading an image, starting threads and cleaning up on exit.",
    d: "A kernel has no process concept, only address spaces, capability spaces and threads. A process server composes them: given an image and a resource budget, it requests memory from the allocator, builds the spaces, loads the image, installs the initial capability set and a fault handler, and starts the thread. It records what it created so that on exit it can revoke everything. It also answers wait and kill requests. The difficulty is correct cleanup when a process dies mid-operation, and ensuring a child gets only authority the parent could give.",
    k: ["Process server as a trusted single service versus library code in each parent: a server centralizes cleanup and policy, but is a trusted bottleneck.", "Parent funds the child versus a system pool: parent funding ties lifetime and quota to the parent, but makes orphan handling necessary."],
    p: ["A crashed process whose resources were not tracked leaves memory permanently stranded.", "A parent that passes its own full-rights capability to a child gives away more than it meant to."],
    v: "Spawn and kill a process 10,000 times and confirm the untyped memory and slot counts return to the starting values, with no capability for the dead process remaining in the inspector.",
    dep: ["untyped-allocator","cspace-slot-allocator","system-image-loader","revocation"]
  },
  "component-model": {
    s: "The abstraction in which a system is described as components with typed interfaces and explicit dependencies, each running in its own protection domain or sharing one.",
    d: "A component declares the interfaces it provides, the ones it requires, the shared memory it takes, and the events it emits or consumes. The framework maps each component to a thread or group of threads and an address space, and wires them according to the assembly. Because dependencies are explicit, the capability set of each component follows from its declared needs. The model also fixes concurrency rules, such as whether an interface is called by one thread at a time. The difficulty is the pull between abstract components and the performance of the generated mechanism.",
    k: ["Component per protection domain versus several components sharing one: separate domains maximize isolation, but pay IPC for every call.", "Declared dependencies versus runtime discovery: declared dependencies allow static checking, but cannot express dynamic composition."],
    p: ["A component that reaches outside its declared interfaces through a shared global defeats the audited dependency graph.", "Model that hides threading rules causes races when two callers use one non-reentrant provider."],
    v: "Generate a system from a description, then list capabilities held by each component and confirm every one traces to a declared dependency and nothing more.",
    dep: ["assembly-description","initial-capability-set"]
  },
  "interface-compiler": {
    s: "A tool that reads interface definitions and generates the client and server stubs that marshal arguments into message registers and buffers and dispatch requests.",
    d: "From a definition of operations, types and directions, the compiler emits client code that packs arguments into a message, calls the endpoint and unpacks the reply, and server code that receives, decodes, calls the implementation and replies. It handles capability arguments, shared-buffer references and error codes. Generated code is where most marshaling bugs would otherwise live. It must bound all lengths and validate every field the server receives, since the client is untrusted. The difficulty is generating code that is fast enough to keep the IPC fast path and small enough to review.",
    k: ["Generated stubs versus hand-written marshaling: generation removes a whole class of mismatches, but the generator becomes part of the trusted build.", "Strict typed interfaces versus raw message words: typing catches misuse at build time, but makes evolving an interface a breaking change."],
    p: ["Generated server code that trusts a client-supplied length reads past its buffer.", "Client and server stubs built from different versions of the definition disagree on layout and fail unpredictably."],
    v: "Fuzz the generated server stubs with malformed messages of every length and type, and confirm each is rejected with an error code and none crashes the server.",
    dep: ["interface-definition","message-registers"]
  },
  "connectors": {
    s: "The generated mechanisms that link component interfaces, such as a synchronous call, an event signal or a shared-memory dataport, chosen per connection.",
    d: "Each link in the assembly names a connector type. A call connector becomes an endpoint with client and server stubs. An event connector becomes a notification. A dataport becomes a shared frame mapped into both components with the agreed rights. The framework instantiates each connector's kernel objects, places capabilities and generates glue on both ends. Connector choice sets latency, memory use and isolation properties. The difficulty is that two connectors that look equivalent in the description can differ in ordering, blocking and trust.",
    k: ["Many specialized connector types versus a few general ones: specialization allows each link to be optimal, but each added type needs implementation and review.", "Connector chosen by the designer versus inferred by the tool: designer choice is explicit, but is easy to get wrong without analysis."],
    p: ["A writable dataport given to a consumer that should only read lets it corrupt the producer's data.", "Using an event connector where a call was expected loses the ordering the code assumed."],
    v: "Instantiate a call, an event and a dataport connector between two components, and confirm the frame is mapped with read-only rights in the consumer and that the notification is delivered once per signal batch.",
    dep: ["component-model","endpoint-object","notification-object","shared-memory-channels"]
  },
  "assembly-description": {
    s: "The declarative file listing the components, their instances, connections, memory and scheduling attributes, from which the whole initial system and its capability graph are generated.",
    d: "The description names each component instance, its interfaces, its connections, thread priorities, budgets, memory sizes and device access. A tool reads it to produce the root task's initialization code: it will create every object and capability, with exact rights, and start the components. Because the entire initial authority graph is derivable from it, it can be checked or even proven against a security policy before the system boots. The difficulty is that it must be maintained alongside code, and changes that are small in the file can alter a lot in the generated system.",
    k: ["Static description of the whole system versus dynamic creation by code: static can be checked and proven before boot, but cannot create components at runtime.", "One flat description versus hierarchical composition: flat is easy to analyze, but becomes unmanageable for large systems."],
    p: ["Editing the generated initializer by hand to fix a problem breaks the link between description and system.", "Description and policy drift apart, so the check passes against a policy nobody enforces."],
    v: "Generate the root task from a description, boot it, dump the capability graph, and confirm it equals the graph the tool predicted, edge for edge.",
    dep: ["component-model","initial-capability-set"]
  },
  "component-scheduling-glue": {
    s: "The generated code that creates threads for components, assigns priorities, scheduling contexts and cores, and arranges that passive servers run on callers' donated time.",
    d: "For each component the framework creates threads according to its declared concurrency: an active component with its own loop, or a passive one that runs only when called. It binds contexts from the budget allocator, sets priorities from the description, and places threads on cores. For passive servers it sets up the receive loop so that it runs on the client's context. The result must match the timing analysis used to choose the numbers. The difficulty is that glue defaults can silently differ from what the analysis assumed.",
    k: ["Active versus passive component threading: passive servers account time to callers and use no budget when idle, but cannot run background work.", "Priorities assigned by the tool from rate or by hand: tool assignment is consistent, but cannot encode special cases."],
    p: ["A passive component given a default context of its own gets double-charged and breaks the budget analysis.", "Two components assigned the same core and priority round-robin unexpectedly."],
    v: "Generate a system with one active and one passive component, run it under load, and confirm in the usage report that the passive component's CPU time is charged to its callers.",
    dep: ["scheduling-context","context-donation","cpu-budget-allocator","assembly-description"]
  },
});
