// Details for the microkernel plate, part 1: kernel objects, capabilities, untyped memory, IPC, interrupts.
ATLAS.details("microkernel", {
  "kernel-object-model": {
    s: "The small fixed set of typed kernel objects, such as threads, endpoints, notifications, capability spaces and page tables, each manipulated only through a capability that names it.",
    d: "Every kernel resource is an instance of one of a handful of object types, each with a defined set of invocations. A system call names a capability, the kernel finds the object and its type, and dispatches to that type's operation. Objects are created only by retyping untyped memory, and are destroyed when the last capability to them goes away. The hard part is keeping the set small: each added type multiplies the cases that must be correct, tested and, where proven, re-proven.",
    k: ["Few generic object types versus many specialized ones: a small set keeps the trusted code small, but pushes composition work into user-level servers.", "Typed objects versus untyped handles: types let the kernel check every invocation against the capability, at the price of a type tag and dispatch on every call."],
    p: ["Adding a convenience object type for one server's benefit permanently enlarges the trusted kernel and its proof burden.", "Object sizes chosen casually leak into the memory accounting that user-level allocators depend on."],
    v: "Enumerate the object types from the kernel's API definition, then confirm that every system call in the test suite names a capability and that none operates on a global identifier.",
    dep: ["retype-operation","capability-slots"]
  },
  "thread-control-block": {
    s: "The kernel object holding one thread's saved registers, priority, scheduling context binding, fault handler, capability space and address space bindings, and its blocking state.",
    d: "A thread is configured by invoking its control block: set the root of its capability space, its address space, its fault endpoint, its priority and its scheduling context, then resume it. The block also stores the register file while the thread is not running, and queue links for whichever wait queue it sits in. The kernel never starts a thread that lacks an address space and capability space. Hard problems include safe teardown while the thread is blocked in the middle of an IPC.",
    k: ["Thread as a bare execution context versus thread as a full process: separating address space and capability space from the thread lets many threads share them, but every configuration step becomes a separate call.", "Registers stored in the object versus on a kernel stack: object storage lets one kernel stack serve all threads, but forces explicit restart rather than continuation of a kernel call."],
    p: ["Destroying a thread that is blocked on an endpoint leaves a dangling queue entry unless the queue link is removed first.", "A thread resumed with an invalid fault handler capability faults silently and cannot be diagnosed."],
    v: "Create a thread through the raw interface with a deliberately unset fault endpoint, run it into a bad instruction, and confirm the kernel reports a fault delivery failure instead of running it.",
    dep: ["kernel-object-model","capability-space","address-space-object"]
  },
  "capability-slots": {
    s: "A single entry in a capability space: a reference to one kernel object plus the rights and badge held, along with links that place it in the derivation tree.",
    d: "A slot holds an object pointer, the object type, a rights mask, a badge or guard where relevant, and two links into the derivation database. Slots are the unit that is copied, moved, minted and deleted. They live in memory that is itself a kernel object, so the kernel's own storage for authority comes from user-supplied untyped memory. Hard parts: moving a slot while keeping the tree links consistent, and keeping slots small since every object has several.",
    k: ["Fixed-size slots versus variable-size capabilities: uniform slots make indexing and storage trivial, but all capability types must fit the largest layout.", "Storing derivation links in the slot versus a separate table: in-slot links make revocation traversal cheap, but enlarge every capability."],
    p: ["Treating a slot as empty because the object was destroyed, when a stale copy elsewhere still points to it, breaks the invariant that no dangling capability exists.", "Slot size growth multiplies across thousands of capabilities and consumes memory unexpectedly."],
    v: "Copy a capability to a second slot, mint a reduced-rights version, move one, and dump the slots to confirm object, rights, badge and parent links are consistent after each step.",
    dep: ["kernel-object-model"]
  },
  "capability-space": {
    s: "A tree of tables of capability slots belonging to one or more threads, defining every object those threads can name or invoke.",
    d: "A capability space is a graph of capability-node objects, each an array of slots, where a slot may itself reference another node. A thread holds the root and addresses a slot by a path of bits resolved level by level. Because a space is just objects, user-level code builds, shares or replaces spaces freely. Nothing exists outside it: a thread that lacks a capability cannot name the object, not even to ask. Sizing is the hard part, since nodes are fixed in size and sparse use wastes memory.",
    k: ["Per-process capability space versus one shared by many threads: sharing saves memory and simplifies thread creation, but erases isolation between those threads.", "Multi-level guarded tables versus a flat array: levels support sparse spaces and large numbers, but add lookup steps to every system call."],
    p: ["Sharing a capability space across components for convenience hands each one the others' authority.", "A flat space sized for peak load wastes untyped memory in every small process."],
    v: "From inside a test thread, attempt to invoke a slot index that was never populated and confirm it fails with a lookup error, while a populated slot at the same depth succeeds.",
    dep: ["capability-slots","capability-lookup"]
  },
  "capability-lookup": {
    s: "The kernel's walk from a caller-supplied slot address through the capability space to a slot, bounded by the bits of the address and any guard values.",
    d: "On each system call the kernel takes a capability address and a depth, then repeatedly strips guard bits, indexes a node, and descends until all bits are consumed or an empty or non-node slot is found. It fails with the number of bits left unresolved, which lets user-level code find the missing level. Lookup is on the critical path of every invocation, so it is written to need no locks or allocation. The difficulty is preserving correctness for malformed addresses, and guarding against stale pointers while a node is being deleted.",
    k: ["Guard bits in nodes versus plain indexing: guards compress long paths and allow sparse layouts, but make address construction and verification harder to reason about.", "Caller-specified depth versus kernel-inferred: explicit depth removes ambiguity, but each call must carry extra information."],
    p: ["An address with leftover bits is silently accepted by a naive walk and resolves to the wrong slot.", "Lookup that allocates or locks makes the fast path unbounded and unprovable."],
    v: "Craft addresses with too many, too few and misaligned bits against a two-level space, and confirm each gets the documented error and resolved-bit count, never a different slot.",
    dep: ["capability-slots"]
  },
  "capability-rights": {
    s: "The permission bits and type-specific attributes carried by a capability, which can be reduced when it is copied or minted but never increased.",
    d: "A capability carries rights such as read, write, grant and grant-reply, interpreted per object type. When a slot is copied or minted, the new capability gets the intersection of requested and held rights, so authority only narrows down a chain. Rights are checked at invocation time, in the kernel, before any operation runs. The subtle part is deciding what each right permits, particularly the right to transfer capabilities, which can break a confinement argument if it leaks through a channel unnoticed.",
    k: ["Few coarse rights versus fine-grained per-operation rights: coarse sets are easy to check and reason about, but force servers to wrap objects for finer control.", "Grant as a separate right versus implied by write: a separate right makes confinement analyzable, but is easy to forget when constructing capabilities."],
    p: ["Handing a client a send capability with the grant right lets it pass the server's own capabilities onward.", "Rights read as universal permissions are misread, since the same bit means different things for frames and endpoints."],
    v: "Mint a read-only frame capability, attempt to map it writable, and confirm the kernel refuses; then mint from it again asking for write and confirm the result is still read-only.",
    dep: ["capability-slots"]
  },
  "derivation-tree": {
    s: "The kernel's record of which capability was derived from which, forming a tree per object that revocation walks to find every descendant.",
    d: "Each capability is linked to its parent, so copies and minted variants form a tree rooted at the original capability that came from retyping. The tree is stored as an ordered list threaded through the slots. It answers two questions: which capabilities depend on this one, and whether a given untyped region has live children. Both are needed for safe revocation and for refusing to retype memory that is in use. The difficulty is maintaining the ordering when slots are moved and keeping updates constant time.",
    k: ["Explicit derivation links versus reference counts: links allow revoking all descendants without knowing them, but cost two pointers per slot and care on every move.", "A single global ordering versus a tree per object: ordered lists give simple traversal, but concentrate invariants that each operation must restore exactly."],
    p: ["A bug that leaves one slot detached from its tree makes revocation skip it, leaving authority that cannot be removed.", "Very long sibling lists make deleting a widely copied capability slow."],
    v: "Delegate one capability through three intermediate holders, revoke the root copy, and confirm all three descendants are gone from the capability inspector while an unrelated capability to the same object survives.",
    dep: ["capability-slots","kernel-object-model"]
  },
  "delegation": {
    s: "Passing authority to another component by copying or minting a capability into its capability space, usually through an IPC message that carries it.",
    d: "A holder can give away a capability only by being able to write into the receiver's space or by sending it across an endpoint where the grant right is held. Delegation can be of the full capability or a weaker one, with a badge added to mark which client it came from. The kernel copies the slot and links it as a child. Delegation is the only way authority spreads, so every path in the system graph can be audited. The hard part is chains: an intermediary that further delegates widens access beyond what the original owner intended.",
    k: ["Delegate by copying versus by moving: copying keeps the sender's access for later revocation, while moving gives a clean handover but loses the sender's ability to withdraw.", "Delegation only through a trusted introducer versus any holder with grant: a single introducer is auditable, but becomes a bottleneck and a trusted component."],
    p: ["Servers that accept capabilities from clients without checking type or rights can be handed a capability that changes their behavior.", "A client given grant on its reply path re-delegates a server's resource to a third party."],
    v: "Send a capability over IPC from A to B without the grant right and confirm B receives nothing; repeat with grant and confirm B holds a slot whose parent is A's slot in the inspector.",
    dep: ["capability-rights","derivation-tree","ipc-capability-transfer"]
  },
  "revocation": {
    s: "The kernel operation that deletes all capabilities derived from a given capability, leaving the original in place, so authority granted earlier can be withdrawn.",
    d: "Revoking a capability walks its subtree in the derivation tree and deletes every descendant. Deleting a capability that is the last reference to an object destroys the object, which can unblock or fault threads waiting on it. On an untyped capability, revocation destroys all objects retyped from it and returns the region to unused. Revocation must be preemptible, since a large tree takes long, and the kernel restarts the operation at the next call. The hard part is making this incremental walk safe while other threads modify the tree.",
    k: ["Immediate revocation versus time-limited or lazy revocation: immediate guarantees no access afterward, but may take unbounded time; lazy is cheap but leaves a window.", "Revoking by capability versus by principal: capability revocation is precise and local, but cannot cut off a client who holds several copies via unrelated paths."],
    p: ["Revoking a parent when children were minted by an unrelated intermediary removes the intermediary's grants too, breaking a service that was working.", "A non-preemptible revoke over a large tree stalls the whole kernel, hurting real-time guarantees."],
    v: "Grant a server a frame capability, let it map the page, revoke the capability from the root, and confirm the server's next access to that address faults while the kernel reports no live children.",
    dep: ["derivation-tree","object-finalization"]
  },
  "object-finalization": {
    s: "The cleanup the kernel performs when the last capability to an object is deleted: unlinking it from queues, unmapping it, and marking its memory reusable.",
    d: "Deleting the final capability triggers type-specific teardown. A thread is removed from scheduling and wait queues, an endpoint wakes or cancels blocked senders, a page table clears mappings that point into it, a capability node recursively deletes its slots. Memory returns to the untyped parent only after teardown completes. Because teardown can cascade through many objects, it is made restartable and preemptible. The hard part is ordering: an object being destroyed while others hold pointers to it needs strict invariants.",
    k: ["Recursive teardown on delete versus deferred cleanup: immediate teardown frees memory at once and keeps invariants simple, but can create long non-preemptible chains.", "Destroying on last capability versus on explicit destroy call: automatic teardown prevents leaks, but one deletion has far-reaching effects the caller may not expect."],
    p: ["A page table destroyed while frames remain mapped through it leaves threads running against freed translation memory.", "Cascading deletes through deeply nested capability nodes overrun the kernel stack unless made iterative."],
    v: "Delete the only capability to a thread blocked on an endpoint and confirm it vanishes from scheduler queues, the endpoint's wait list is empty, and the memory can be retyped immediately.",
    dep: ["derivation-tree","untyped-memory"]
  },
  "untyped-memory": {
    s: "A capability for a region of physical memory that has no type yet, from which kernel objects and frames of any kind can be carved.",
    d: "At boot, the kernel gives the root task an untyped capability for each region of free physical memory and each device region. An untyped region tracks a watermark: retyping allocates upward from it, and the region can be reused only after every child is revoked. User-level code splits an untyped into smaller untypeds and retypes the pieces. Because physical memory is divided this way, no component can consume memory it was not given. The hard part is fragmentation: aligned, power-of-two sizes mean the allocator must plan splits carefully.",
    k: ["Watermark allocation versus free lists inside the kernel: a watermark needs no kernel allocator and is easy to verify, but the region cannot be partially reclaimed until all children go.", "Power-of-two sized untypeds versus arbitrary sizes: alignment simplifies bookkeeping and page tables, but wastes memory on odd-sized objects."],
    p: ["Splitting untypeds in arrival order fragments memory so that a later large object cannot be placed.", "Forgetting to keep the parent untyped capability makes memory impossible to reclaim."],
    v: "Retype two objects from one untyped, delete both, and confirm a new retype can begin at the region's start; then retype once more with one child alive and confirm the kernel refuses to reset.",
    dep: ["kernel-object-model"]
  },
  "retype-operation": {
    s: "The call that turns part of an untyped region into one or more new typed kernel objects and places capabilities to them in chosen capability space slots.",
    d: "The caller names an untyped capability, an object type, a size, a number, and the destination slots. The kernel checks alignment, that the region has room beyond the watermark, and that the slots are empty, then initializes the objects in place and installs capabilities. The new capabilities become children of the untyped in the derivation tree. Retype is the only way objects come into existence, and it is atomic: it fully succeeds or leaves nothing. The hard parts are validating all arguments without allocation and ensuring objects never overlap.",
    k: ["Creation only through retype versus a kernel allocator: retype keeps all memory decisions in user space and avoids kernel out-of-memory, but makes object creation a multi-step user-level job.", "Batch retype of many objects versus one at a time: batching amortizes call cost, but a failure part way must be fully undone."],
    p: ["Retyping into slots that are checked once and then raced by another thread overwrites a live capability.", "Initializing a large object in one call without preemption points delays interrupts."],
    v: "Retype an untyped region into a thread, a frame and an endpoint, then attempt a second retype overlapping the first; confirm only the non-overlapping request succeeds.",
    dep: ["untyped-memory","capability-slots","derivation-tree"]
  },
  "frame-objects": {
    s: "Capabilities for fixed-size pages of physical memory that can be mapped into address spaces, with rights that decide whether mapping is readable, writable or executable.",
    d: "A frame is the retyped form of untyped memory meant to hold data. It can be mapped into one or more address spaces at chosen virtual addresses, subject to the rights on the frame capability and the mapping call. The kernel records where each frame is mapped so it can remove those mappings on delete. Frames come in several sizes matching hardware page sizes. Frames with device memory behind them use the same type, with attributes set for uncached access. The hard part is cache and alias handling when the same page is mapped twice.",
    k: ["One frame type for ordinary and device memory versus separate types: one type simplifies the interface, but makes it easy to map device registers cached by mistake.", "Multiple page sizes versus one: large frames reduce translation misses, but constrain alignment and fragment memory."],
    p: ["Mapping a frame writable in two components makes shared memory unintended and unsynchronized.", "A frame cap with write rights passed to a client lets it alter data the server believes is private."],
    v: "Map one frame into two address spaces, write through the first, and read the value through the second; then delete the frame capability and confirm both mappings fault.",
    dep: ["retype-operation","page-table-objects","capability-rights"]
  },
  "page-table-objects": {
    s: "Kernel objects representing each level of the hardware translation tree, which user-level code retypes, links into an address space and populates with frame mappings.",
    d: "The kernel exposes translation tables as objects rather than hiding them. To map a frame, a manager must first supply every intermediate table, retyped from untyped memory and installed in order. Mapping a frame into a missing level fails and tells the caller which level to add. This gives user level full control and accounting of translation memory, and keeps the kernel from allocating at fault time. The hard part for managers is tracking which tables exist, and cleaning up when an address space is torn down.",
    k: ["User-supplied translation tables versus kernel-allocated: user supply removes kernel allocation and out-of-memory cases, but every address space manager must implement table bookkeeping.", "Exposing each hardware level versus an abstract mapping call: exposing levels is exact and efficient, but ties user code to the hardware's table structure."],
    p: ["A manager that forgets which tables it installed leaks translation memory when the address space dies.", "Mapping fails with a missing-level error that clients treat as fatal rather than prompting a table install."],
    v: "Map a frame at an address whose intermediate tables do not exist, confirm the error identifies the missing level, install the table, repeat, and read the data back from the mapped address.",
    dep: ["retype-operation","address-space-object"]
  },
  "address-space-object": {
    s: "The kernel object that identifies one virtual address space, to which threads are bound and in which frames are mapped by capability.",
    d: "An address space is created by retyping the root translation table and then registering it with an identifier pool so the hardware can distinguish it. A thread is bound to one by its control block. Mapping, unmapping and permission changes are invocations on frame and table capabilities that name this space. Because there is no per-process kernel state beyond the root and its identifier, a process is simply a space, a capability space and one or more threads. The difficulty is identifier exhaustion and flushing stale translations safely.",
    k: ["Address space as a separate object from process versus a combined process object: separation permits sharing and unusual compositions, but means higher-level servers must define what a process is.", "Hardware identifiers tagged per space versus full flush on switch: tags make switches fast, but a finite pool needs a recycling policy."],
    p: ["Reusing an identifier before stale translations are flushed lets one process read another's memory.", "Binding a thread to a space whose root table is freed leaves it executing on garbage."],
    v: "Create two spaces mapping different frames at the same virtual address, switch between threads in each repeatedly, and confirm each reads only its own data.",
    dep: ["page-table-objects","retype-operation"]
  },
  "kernel-memory-model": {
    s: "The rule that the kernel has no general heap: every byte it uses for objects comes from untyped memory supplied by user level, apart from a small static region.",
    d: "At boot the kernel reserves a fixed area for its own image, stacks, and a few global tables. All other storage, including thread blocks, capability nodes, endpoints and translation tables, is carved from untyped memory that user level controls. This removes kernel out-of-memory failures and allows exact accounting, since a component's memory use is the sum of what it retyped. The tradeoff falls on user level: it must size and supply every kernel structure ahead of time, including any storage that scales with the number of cores or threads.",
    k: ["No kernel heap versus a kernel allocator with quotas: no heap removes a whole class of failures and proof obligations, but pushes sizing mistakes into early boot.", "Static boot-time kernel region versus growing: static is simple to verify, but must be sized for the largest supported configuration."],
    p: ["Hidden per-object bookkeeping that the kernel allocates from its static region exhausts it under many objects.", "A manager that retypes all memory early leaves nothing for dynamic components later."],
    v: "Exhaust all untyped memory with endpoints, then confirm the kernel keeps running, retype fails with a clean error, and deleting some endpoints makes retype succeed again.",
    dep: ["untyped-memory"]
  },
  "endpoint-object": {
    s: "A kernel object acting as a rendezvous point for synchronous message passing: senders and receivers queue on it until a pair is matched.",
    d: "An endpoint holds at most one queue at a time, either blocked senders or blocked receivers. When a send meets a waiting receiver, or the reverse, the kernel transfers the message directly between the two threads and wakes or runs the receiver. An endpoint has no buffer, so no memory is used for messages in flight. A server creates an endpoint, keeps the receive capability, and hands out send capabilities, usually badged. The hard part is cancelling cleanly when threads are deleted or capabilities revoked while queued.",
    k: ["Unbuffered rendezvous versus buffered message queues: rendezvous needs no kernel buffer memory and gives natural flow control, but forces the sender to wait for the receiver.", "One endpoint per service versus per client: a shared endpoint scales to many clients, but needs badges to tell them apart."],
    p: ["A server that dies leaves clients blocked forever on its endpoint unless something cancels the sends.", "Threads of unequal priority queued on one endpoint can starve the lower ones."],
    v: "Block three senders on an endpoint, have one receiver take them, and confirm they are served in queue order with messages intact; then delete the endpoint and confirm any waiting sender is woken with an error.",
    dep: ["kernel-object-model","thread-control-block"]
  },
  "synchronous-call": {
    s: "The call-and-reply operation that sends a request, blocks the caller, and resumes it with the server's answer, built so that a request costs two kernel entries.",
    d: "A call sends a message on an endpoint and atomically begins waiting for the reply. The kernel gives the server a one-shot reply capability bound to that caller, which the server uses once to answer and then waits for the next request. The caller cannot be woken by anyone else, so no one can forge a reply. A server loop of reply-and-wait does the reply and the next receive in a single kernel entry. The hard part is the protocol above: clients that abandon a call, and servers that must not block on a misbehaving client.",
    k: ["One-shot reply capability versus a reply endpoint: a one-shot capability ties the answer to exactly one caller and needs no slot allocation, but cannot be stored for later without being saved.", "Synchronous call versus asynchronous request queues: synchronous is simple to reason about, but one slow server stalls its callers."],
    p: ["A server that blocks while serving one client without timeouts lets that client freeze everyone behind it.", "Treating the reply as optional leaves the caller waiting forever when the server crashes mid-request."],
    v: "Have a client call a server that replies with a computed value, measure round trip cycles over a million calls, and confirm results are correct and the number is stable across runs.",
    dep: ["endpoint-object","message-registers"]
  },
  "ipc-fast-path": {
    s: "A hand-optimized kernel path for the common case of a call or reply with a short message and no capability transfer, avoiding the general scheduler and queues.",
    d: "When a call finds a receiver already waiting, the message fits in registers, the lookups succeed and the receiver has higher or equal priority, the kernel skips generic code. It switches directly to the receiver's thread and address space with minimal register saving. Anything unusual falls back to the slow path, which handles every case correctly. The fast path exists because the cost of IPC is the cost of splitting the system into servers. The difficulty is keeping it equivalent to the slow path under all conditions.",
    k: ["Special-casing the common path versus one general path: the fast path cuts latency several-fold, but doubles the code that must be correct and verified.", "Direct switch to receiver versus a trip through the scheduler: a direct switch is faster, but bypasses scheduling policy unless carefully conditioned."],
    p: ["A fast path that quietly skips a check the slow path performs creates a security hole visible only on the common case.", "Tuning for micro-benchmarks makes the path brittle across hardware generations."],
    v: "Run the same call workload with the fast path enabled and disabled, confirm identical results and states, and confirm round-trip time is substantially lower with it enabled.",
    dep: ["synchronous-call","thread-scheduler","kernel-entry-exit"]
  },
  "message-registers": {
    s: "The scheme that carries short messages in machine registers and longer ones through a per-thread buffer shared with the kernel, with a length and capability count in the label.",
    d: "A message has a label word, a small number of data words kept in registers, and optionally more words and capability slots in the caller's IPC buffer, a page registered with the thread. The kernel copies the words to the receiver's buffer or registers without interpreting them. The label names the operation and the lengths. Messages are bounded in size, so large data moves through shared memory instead. The hard part is trust: the kernel reads a user buffer that can fault or be changed while the call is under way.",
    k: ["Register-resident short messages versus always buffered: registers avoid memory traffic and are fast, but cap message size at what fits in unused registers.", "Kernel copy versus shared buffer: copy keeps sender and receiver isolated, but costs time per word."],
    p: ["A sender that edits its buffer during the call may confuse a receiver that assumes it is stable.", "A buffer not registered or misaligned causes an immediate fault in the middle of the transfer."],
    v: "Send messages of zero, one, maximum register count and maximum buffer length, and confirm each arrives byte for byte; then send one word more than the maximum and confirm it is truncated or refused as documented.",
    dep: ["thread-control-block"]
  },
  "ipc-capability-transfer": {
    s: "The mechanism by which a message carries capabilities, which the kernel copies into slots the receiver has designated, subject to the grant right on the endpoint.",
    d: "A sender lists capability addresses in its message. If its endpoint capability has the grant right, the kernel looks each up, then copies it into slots the receiver reserved in its receive path. The receiver learns how many arrived. Transfers are atomic with the message and recorded in the derivation tree as children of the sender's capabilities. This is how a name server hands out service access. It is hard because the receiver must have empty slots ready, and because granting widens authority in ways that must match policy.",
    k: ["Capability transfer in the same message as data versus a separate step: bundling is atomic and cheap, but requires receivers to prepare slots for every receive.", "Transfer allowed per endpoint right versus per message: a per-endpoint right is simple to audit, but cannot vary by operation."],
    p: ["A receiver with no free slot cannot accept the capability, and the call fails in ways clients do not expect.", "A server that receives capabilities and does not delete them slowly leaks its slots."],
    v: "Send a frame capability with an endpoint that has grant, confirm it appears in the receiver's designated slot as a child of the sender's; repeat without grant and confirm nothing arrives.",
    dep: ["delegation","synchronous-call","capability-lookup"]
  },
  "badged-endpoints": {
    s: "Send capabilities to one endpoint, each stamped with a different badge value that the server sees on every received message, identifying which client it came from.",
    d: "A server mints several send capabilities from its endpoint, each with a unique badge, and gives one to each client. The kernel delivers the badge to the receiver together with the message, and the client cannot change or forge it. The server uses it as a client identifier or an index into its state, avoiding a separate endpoint per client. The badge can also mark notification sources. The hard part is the server's own bookkeeping: allocating unique badges, freeing them, and not reusing a badge while a stale capability still exists.",
    k: ["Badge as client identity versus passing an identifier in the message: a badge cannot be forged and costs nothing in the message, but the server must manage a badge namespace.", "One endpoint with badges versus an endpoint per client: one endpoint keeps the server loop simple, but the server's single queue becomes a shared bottleneck."],
    p: ["Reusing a badge for a new client while the old client's capability still exists lets the old client act as the new one.", "Badge values treated as pointers let a confused server crash from a bad index."],
    v: "Give two clients differently badged capabilities to one endpoint, have each call, and confirm the server logs distinct badges that match the minting record and cannot be altered by the client.",
    dep: ["endpoint-object","capability-rights"]
  },
  "notification-object": {
    s: "A kernel object holding a word of signal bits, set asynchronously by senders and read or waited on by a receiver, used for events that must not block the sender.",
    d: "A signal ors the sender's badge into the notification word and wakes a waiting thread if there is one. A waiting thread receives and clears the accumulated word, or polls it. Nothing queues beyond the word, so signals can coalesce, and the sender never blocks. Notifications carry interrupts to drivers, completion events from shared-memory rings, and wakeups. A thread can also bind a notification to itself so a single wait covers both IPC and signals. The hard part is that multiple events merge into one, so the receiver must not use the count of wakeups as a count of events.",
    k: ["Coalescing bit word versus a counted or queued signal: a word never allocates and never blocks the sender, but loses the number of events.", "Binding a notification to a thread versus waiting on two objects: binding avoids a multi-wait mechanism in the kernel, but fixes the pairing."],
    p: ["Treating each wakeup as exactly one event loses work when two signals merge into one.", "Forgetting to rearm or acknowledge after handling leaves a driver waiting for an event already delivered."],
    v: "Signal a notification from three senders with different badges before a waiter runs, then wait once and confirm the returned word has all three bits set and a second poll returns zero.",
    dep: ["kernel-object-model","thread-control-block"]
  },
  "shared-memory-channels": {
    s: "A region of frames mapped into two address spaces, with a ring of descriptors and notifications for signaling, used to move bulk data without kernel copying.",
    d: "Two components agree to map the same frames and lay out one or more single-producer single-consumer rings in them. Data and descriptors move through memory, while notifications wake the peer when a ring changes from empty or full. The kernel is involved only in setup and wakeups. This is how high-throughput drivers, network stacks and file servers avoid per-byte IPC cost. It is hard to get right: the peer is untrusted, so every index and descriptor read from shared memory must be validated, and memory ordering must be correct.",
    k: ["Shared ring with notifications versus message passing for bulk data: rings give high throughput and batching, but trust and validation shift to both ends.", "Polling versus notification wakeups: polling gives lowest latency, but burns processor time, while notifications save power and add a system call."],
    p: ["Trusting a length or index read from shared memory lets a malicious peer cause out-of-range access in the server.", "Missing a wakeup when the ring goes from empty to nonempty leaves both sides waiting."],
    v: "Run a producer and consumer across two address spaces for a billion descriptors with a fault-injecting peer that writes invalid indices, and confirm no lost or duplicated entries and no server fault.",
    dep: ["frame-objects","notification-object"]
  },
  "irq-control": {
    s: "The single capability, held initially by the root task, that authorizes creating an interrupt handler capability for a specific hardware interrupt line.",
    d: "The kernel does not let any thread claim an interrupt freely. At boot the root task holds the interrupt control capability. To let a driver handle an interrupt, it invokes control to mint a handler capability for one line, placing it in a chosen slot and routing it to a notification. It can delegate the control capability or only the resulting handlers. Hardware detail, such as trigger mode and target core, is set at this point. The hard part is that interrupt numbers differ across controllers and buses, so a stable mapping from device to line must live in user level.",
    k: ["One control capability that mints handlers versus a capability per line: one control capability is easy to keep safe, but its holder can claim any line unless narrowed by policy.", "Setting trigger and routing at creation versus later: at creation is simple, but reconfiguring requires recreating the handler."],
    p: ["Giving a driver the control capability instead of one handler lets it take over lines belonging to other devices.", "Two handlers created for one shared line without coordination lose interrupts."],
    v: "Use the control capability to mint a handler for one line, then attempt to mint a second handler for the same line and confirm the kernel refuses it or reports sharing as documented.",
    dep: ["kernel-object-model","irq-handler-object"]
  },
  "irq-handler-object": {
    s: "A capability for one interrupt line, bound to a notification, whose operations acknowledge the interrupt and unmask the line so the next one can arrive.",
    d: "When the line fires, the kernel masks it, signals the bound notification with the handler's badge, and returns. The driver thread wakes, services the device, and invokes acknowledge on the handler capability, which unmasks the line. Between those two points the line stays masked, so a slow driver cannot be swamped. Keeping the handler as a capability means interrupt access can be delegated, revoked and badge-tagged like any other. The hard parts are level versus edge triggering, and interrupts that arrive while the driver is not yet waiting.",
    k: ["Mask until acknowledged versus leaving the line open: masking prevents interrupt storms and makes delivery serialized, but adds latency if the driver is slow to acknowledge.", "Notification delivery versus delivery by IPC message: a notification never blocks the kernel and merges, but carries no data about the device state."],
    p: ["A driver that forgets to acknowledge stops receiving interrupts and looks hung.", "A level-triggered device not quieted before acknowledge fires again immediately in a loop."],
    v: "Trigger a device interrupt, confirm the driver's notification fires with the right badge, check the line is masked, acknowledge, and confirm a second device interrupt then arrives.",
    dep: ["notification-object","irq-control"]
  },
  "interrupt-delivery": {
    s: "The path from a hardware interrupt to a user-space thread: kernel entry, controller handling, notification signal, and the scheduling decision that runs the waiting driver thread.",
    d: "An interrupt enters the kernel, which reads the controller to find the line, masks it, looks up the handler object, signals its notification and may preempt the running thread if the woken driver has higher priority. Latency to the driver is the sum of kernel entry, handler lookup, scheduling and a return to user mode. The timer interrupt takes a separate path into the scheduler. The hard part is that interrupts are disabled in the kernel except at preemption points, so long kernel operations directly add to interrupt latency.",
    k: ["Mostly interrupts-off kernel with explicit preemption points versus a fully preemptible kernel: interrupts-off is simple and verifiable, but long operations must be broken up by hand.", "Driver priority above or below the application: higher priority gives low latency, but a faulty driver can starve applications."],
    p: ["A long revoke or retype without preemption points makes worst-case interrupt latency unbounded.", "A driver thread priority set below a busy compute task never runs, so the device appears dead."],
    v: "Inject interrupts at a fixed rate while another thread runs long kernel operations, and measure the distribution to confirm the worst-case delivery time stays inside the documented bound.",
    dep: ["irq-handler-object","kernel-entry-exit","thread-scheduler"]
  },
  "kernel-entry-exit": {
    s: "The code that switches from user mode into the kernel on a system call, fault or interrupt, and back, saving only the state needed before dispatching.",
    d: "An entry stub saves the user register state into the current thread's control block, switches to the single kernel stack, and decodes the cause: system call, fault, or interrupt. It runs the handler to completion or to a preemption point, then picks the thread to return to and restores its registers. There is one kernel stack per core, so no blocking inside the kernel: a call that must wait is converted into a restartable state. The difficulty is making entry and exit short, since they are paid on every IPC.",
    k: ["Single kernel stack per core versus a stack per thread: a single stack saves memory and simplifies preemption, but forbids blocking mid-call, so operations must be restartable.", "Saving all registers versus a minimum: minimal saving speeds the fast path, but any slow path must save the rest first."],
    p: ["A system call path that sleeps in the kernel breaks the single-stack design and deadlocks the core.", "Leaving stale register contents across a switch leaks data between address spaces."],
    v: "Execute a null system call a million times and measure cycles, then compare to the documented target; also confirm registers not used by the call are zeroed or restored on return.",
    dep: ["thread-control-block"]
  },
  "cross-core-signals": {
    s: "The inter-processor messages a multicore kernel sends so one core can tell another to reschedule, flush translations or run a pending operation on a thread it owns.",
    d: "A multicore microkernel avoids a single big lock by giving each core its own scheduling state, or by using one lock for the whole kernel. Where an operation needs to touch a thread on another core, it sends an inter-processor interrupt and the target core performs the work. Cross-core IPC and notifications use the same mechanism to wake a remote thread. The cost is both latency and complexity: every kernel path must be correct when a thread can migrate while an operation on it is in flight.",
    k: ["One big kernel lock versus fine-grained locking: a big lock is simple and provable, but limits scaling; fine-grained locks scale but multiply the proof and bug surface.", "Core-affine objects versus free migration: affinity avoids cross-core traffic, but rigid placement makes load balancing a user-level job."],
    p: ["Under a single big lock, a core spinning for the lock while holding interrupts off adds latency to all others.", "Flushing translations on only the local core leaves stale mappings on another core that runs the same address space."],
    v: "Unmap a shared frame while threads on three other cores access it, and confirm each core faults promptly after the unmap call returns, and none reads old contents.",
    dep: ["kernel-entry-exit","multicore-scheduling"]
  },
});
