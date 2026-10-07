// Details for the microkernel plate, part 4: verification, debugging and tracing, cross-cutting concerns.
ATLAS.details("microkernel", {
  "abstract-specification": {
    s: "A precise mathematical model of what each kernel call does, written without implementation detail, against which the code is checked and from which security properties are derived.",
    d: "The specification describes kernel state as abstract sets and maps, such as objects, capabilities and the derivation tree, and each system call as a transition on that state, including every error case. It is small enough to read and review, and it is the statement of what users can rely on. Higher-level properties, such as integrity and confidentiality, are proven against it, so they need not be reproven for the code. The hard part is capturing real behavior: anything the model leaves out, such as timing or device effects, is simply not covered.",
    k: ["Abstract model close to the implementation versus far from it: a close model makes the refinement proof easier, but leaks implementation choices into what users rely on.", "Specifying error cases fully versus leaving them undefined: full specification makes every outcome predictable, but enlarges the model and proof."],
    p: ["An abstract model that omits a failure case lets code behave in ways the proofs never examined.", "A specification written after the code tends to describe the code's accidents as intent."],
    v: "Pick ten system calls, execute each with edge-case arguments on a running kernel, and check that the observed result and resulting state match what the specification predicts for the same inputs.",
    dep: ["kernel-object-model"]
  },
  "refinement-proof": {
    s: "A machine-checked proof that the kernel's implementation behaves exactly as the abstract specification says, in every state and for every input.",
    d: "The proof is built in stages, relating the abstract model to an executable model, and that to the implementation, showing each step of the code corresponds to a step of the specification and preserves a set of invariants. It is checked by a theorem prover, so the claim is not a matter of review. Assumptions at the boundary, such as correct hardware and initialization, are stated. The cost is large: the proof is many times the size of the code. The difficulty is invariants, which must hold between every pair of operations.",
    k: ["Full functional correctness versus proving selected properties only: full correctness rules out whole bug classes, but costs far more effort to establish and to maintain.", "Proof at source level versus also at the compiled binary: source-level proof is feasible, but trusts the compiler unless the binary is also checked."],
    p: ["A proof under assumptions that the deployed hardware violates says nothing about the running system.", "Adding a feature by changing code first and the proof later leaves unproven changes on the main branch."],
    v: "Run the theorem prover over the whole proof from a clean checkout with no skipped goals or unproven assumptions beyond the documented list, and confirm it completes successfully on the exact kernel source being built.",
    dep: ["abstract-specification","trusted-base-assumptions"]
  },
  "binary-verification": {
    s: "Checking that the compiled kernel binary implements the verified source, so the compiler and assembler are removed from the trusted base.",
    d: "The proof relates the source semantics to the instructions the compiler produced. Either the compiler is verified, or each build is translation-validated: a tool compares the source to the binary function by function and shows they are equivalent, with hand-written assembly proven separately. This closes the gap between the proof and what actually executes. It requires the build to be deterministic and the tool to run on every change. The difficulty is optimizations that restructure code, which make equivalence harder to show.",
    k: ["Translation validation per build versus a verified compiler: validation works with an ordinary compiler and detects any error, but must succeed on every build.", "Restricting compiler optimizations versus validating all of them: restricting makes validation tractable, but gives up some performance."],
    p: ["Updating the compiler without rerunning validation reopens the gap the proof was meant to close.", "A validation tool that times out on a function gets bypassed, and that function ships unchecked."],
    v: "Build the kernel, run the equivalence checker over all functions, and confirm it reports every function equivalent, then alter one compiler flag and confirm the checker either still succeeds or flags the specific differences.",
    dep: ["refinement-proof"]
  },
  "isolation-proofs": {
    s: "Proofs, on top of the specification, that authority cannot grow beyond what the capability graph allows and that information cannot flow between domains except through permitted channels.",
    d: "Integrity: a component cannot modify an object unless some chain of capabilities permits it. Authority confinement: the set of capabilities a component can ever obtain is bounded by the initial graph and the rules of delegation. Information flow: what one domain can observe is unaffected by another's secret data, in the model. These hold for any system built correctly on top, so a developer need only check the initial graph. The hard part is the model's edge: timing, caches and hardware effects are outside it unless explicitly modeled.",
    k: ["Proving properties about the abstract model versus about each system: model proofs are done once for all systems, but only apply if the system uses the kernel as modeled.", "Including timing channels in the model versus excluding them: including them gives a stronger claim, but is much harder and hardware dependent."],
    p: ["Reading a confidentiality theorem as covering timing channels the model does not include.", "A system that gives a component the right to create capabilities widely invalidates the bound the theorem computed."],
    v: "Take a concrete assembly, compute the authority bound with the analysis tool, and then test: every operation attempted by a component outside that bound fails on the running system.",
    dep: ["abstract-specification","derivation-tree","capability-rights"]
  },
  "timing-analysis": {
    s: "Computing, for each kernel operation, an upper bound on execution time, so interrupt latency and the cost of a system call can be guaranteed for real-time systems.",
    d: "Static analysis of the compiled kernel finds the longest path through each operation, with loop bounds and cache and pipeline models for the hardware. Long operations are cut with preemption points so no single stretch exceeds the bound on interrupt latency. The result is a number per operation, and a bound on how long interrupts stay disabled. Real-time analysis of the whole system uses these as inputs. The difficulty is hardware: modern processors have caches and speculation that make safe bounds very conservative.",
    k: ["Static worst-case bounds versus measured maxima: static bounds are guaranteed, but are pessimistic; measurements are realistic but may miss the worst case.", "Adding preemption points to cut long paths versus leaving them: more points reduce latency, but add code and state that must remain correct."],
    p: ["Using a measured maximum from a quiet system as a worst case misses cache-cold behavior in production.", "Bounds computed for one hardware model silently do not hold on another."],
    v: "Run each kernel operation with adversarial cache states on target hardware and confirm every measurement stays below the computed bound, with the highest observed value reported next to it.",
    dep: ["kernel-entry-exit","interrupt-delivery"]
  },
  "proof-maintenance": {
    s: "The ongoing work of keeping proofs valid as the kernel changes: classifying each change, repairing broken proofs, and avoiding changes whose proof cost outweighs their value.",
    d: "Every code change is checked against the proof in continuous integration. Small local changes often need little repair, while changes to a shared invariant break many proofs. Teams track proof effort, keep proofs modular, and require a proof-affecting change to include its repair. Features are weighed by how much they add to what must be proven. Porting to a new platform needs part of the proof redone for the platform-specific code. The difficulty is that the proof grows with the code, and the knowledge of why each invariant is needed leaves with the people.",
    k: ["Proof updated in the same change versus afterwards: same change keeps main verified, but slows feature work.", "Keeping an unverified configuration option versus proving it: an unverified option is cheap to add, but sits outside the guarantee."],
    p: ["Merging code with a failing proof on the promise to fix it later leaves the verified claim void for that version.", "Proof scripts that depend on tactic details break on every prover upgrade."],
    v: "Change an internal data structure in the kernel, run the proof checker in continuous integration, and measure how many proofs break and how long the repair takes, recorded against the previous changes.",
    dep: ["refinement-proof","abstract-specification"]
  },
  "trusted-base-assumptions": {
    s: "The explicit list of things a verified system still takes on trust: hardware behavior, boot code, the verification tools, and anything the proofs do not cover.",
    d: "A proof is relative to its assumptions. They include that the processor and memory management unit behave as modeled, that initialization produced the state the proof starts from, that device and cache effects outside the model do not matter, that the proof checker itself is sound, and that certain assembly stubs are correct. A system builder adds their own: the root task, the policy and the drivers that are not verified. Making the list explicit lets a reader weigh the claim. The difficulty is that assumptions drift as hardware and software change.",
    k: ["Small kernel so the trusted base is small versus more in the kernel for speed: a small base is easy to enumerate, but pushes functions and their risk into servers.", "Stating assumptions formally versus in prose: formal assumptions can be checked by tools, but are harder to read."],
    p: ["An assumption left implicit becomes a surprise failure when hardware changes.", "Counting only the kernel as the trusted base ignores the root task and the policy server."],
    v: "Produce the list for a concrete build and verify each item has an owner and a check, such as a boot-time hardware test, and that every component granted broad authority appears in it.",
    dep: ["root-task","kernel-memory-model"]
  },
  "kernel-trace-buffer": {
    s: "A fixed-size in-kernel buffer recording events such as system calls, context switches, interrupts and IPC, which a user-level tool reads out for analysis.",
    d: "Events are written with a timestamp, core and identifiers into a ring buffer that the kernel owns, with no allocation and a small, bounded cost. A tracing server maps the buffer, or reads it by call, and writes it out or analyzes it. Events can be filtered by type to limit cost, and the buffer can be compiled out of production builds. It is the only view of what happened between servers. The difficulty is overhead on the fast path, and that tracing must not change the timing it measures.",
    k: ["Always-on lightweight tracing versus enabled on demand: always-on catches rare faults after the fact, but costs a bit on every operation.", "Large buffer versus small: a large buffer holds more history, but takes kernel memory that is statically allocated."],
    p: ["Tracing enabled in the fast path moves IPC timing enough to hide the race being chased.", "A ring that wraps before the reader runs loses exactly the interesting events."],
    v: "Run a known sequence of calls between two threads and confirm the trace buffer shows the corresponding events in order with plausible timestamps, and that disabling tracing removes them with no change in results.",
    dep: ["kernel-entry-exit","timer-source"]
  },
  "cross-server-tracing": {
    s: "Following a single request as it passes through several servers, by carrying an identifier in messages and correlating the timestamped records each server and the kernel emit.",
    d: "A request carries a trace identifier in a reserved message field, and each server copies it into the requests it makes in turn. Servers write events with that identifier to shared logs or to the kernel buffer, and a collector merges them by identifier and time across processes and cores. This reconstructs a path such as application, file server, block cache, driver. The difficulty is that identifiers must pass through shared-memory rings and notifications where no message exists, and clocks across cores must agree.",
    k: ["Identifier propagated in every message versus reconstructed from IPC records: propagation is exact, but each server and interface must cooperate.", "Per-server local logs merged later versus one central sink: local logs avoid contention, but need clock alignment to merge."],
    p: ["A server that forgets to forward the identifier breaks the chain at that point and hides everything after.", "Tracing through a shared ring loses the identifier unless it is written into the descriptor."],
    v: "Issue one file read from an application and confirm the collected trace shows ordered events at the file server, block cache and driver, all with the same identifier, with timestamps increasing along the path.",
    dep: ["kernel-trace-buffer","synchronous-call","shared-memory-channels"]
  },
  "capability-inspector": {
    s: "A debug tool that dumps a component's capability space, showing each slot's object type, rights, badge and parent in the derivation tree, to diagnose missing or excess authority.",
    d: "In debug configurations the kernel provides a call that prints or returns slot contents, and a tool walks a component's spaces to draw its capability graph. The same view, built from the assembly description, shows what the component should hold, and a diff shows the mismatch. It is the first tool used when a call fails with a lookup error, and for reviewing a system's authority. It exists mainly in debug builds, since it breaks encapsulation. The difficulty is that the full graph of a running system is large.",
    k: ["Inspection call in the kernel versus reconstruction from the root task's records: a kernel call shows the real state, but adds code that must be excluded from verified builds.", "Whole system graph view versus per-component view: the whole graph shows flows, but is unreadable at scale."],
    p: ["Shipping the inspection call in a production kernel lets any component read the others' authority.", "Relying on the records of the root task misses capabilities created or moved later."],
    v: "Dump a component's capability space and compare each entry with its declared requirements; delete one capability and confirm that the dump and the diff both show the missing entry.",
    dep: ["capability-space","derivation-tree"]
  },
  "fault-reporting": {
    s: "A supervisor service that receives fault messages from components, records the registers, fault address and a stack trace, and decides whether to restart, kill or suspend.",
    d: "Every component's fault endpoint leads to a supervisor, which receives a message when a thread faults. It reads the faulting thread's registers, and with a capability to its address space can read memory to unwind the stack. It writes a crash record with component, thread and cause, and applies the restart policy. Because the supervisor sees only what its capabilities permit, it needs deliberate access to each component's memory. The difficulty is crash loops and cascades: restarting a server that many depend on affects all its clients.",
    k: ["Central supervisor versus one per subsystem: central gives one place for policy and crash records, but is a single point of trust and failure.", "Capture memory at crash versus only registers: memory capture helps diagnosis, but needs capability to read the component's data."],
    p: ["A supervisor that restarts immediately and without limit turns a bug into a busy loop.", "A fault in the supervisor itself leaves no one to report it unless a second level exists."],
    v: "Make a test component dereference a null pointer and confirm the supervisor receives one record with correct address, program counter and component name, and applies the configured restart or stop.",
    dep: ["fault-protocol","exception-handlers"]
  },
  "user-level-debugger": {
    s: "A debugger running as a user process that controls another component's threads through its fault endpoint and capabilities, reading and writing registers and memory and placing breakpoints.",
    d: "The debugger becomes the fault handler of the target threads, so breakpoints and single steps arrive as fault messages. With capabilities to the target's control block it reads registers, and with those to its address space it maps its memory. It can stop threads, which also stops their scheduling context charges. No kernel debugger is required. Debugging a server involves its clients too, which keep waiting. The difficulty is that stopping one component leaves peers timing out, and multi-component bugs need coordinated stops.",
    k: ["Debugger as a separate process with delegated capabilities versus a kernel debugger: a process needs no kernel code and respects isolation, but must be granted authority over the target.", "Stopping one component versus the whole system: one component keeps the rest running but breaks timeouts, while stopping all keeps state consistent."],
    p: ["Attaching to a driver stops it responding to its device, and the device times out and resets.", "Granting a debugger broad authority in production leaves a backdoor to all components."],
    v: "Attach the debugger to a server, set a breakpoint on a handler, send a request, and confirm the debugger stops at the breakpoint with correct registers and can resume and the request completes.",
    dep: ["exception-handlers","thread-control-block","address-space-object"]
  },
  "capability-discipline": {
    s: "The rule that every authority is a capability held explicitly, passed deliberately and narrowed whenever possible, which every layer must follow for the guarantees to hold.",
    d: "If any component acquires authority through a path that is not a capability, such as a global identifier, an ambient root user or a shared name, the audit of the capability graph no longer shows what it can do. Discipline means servers take capabilities as arguments, never fetch them by name with their own broader rights, and drop what they no longer need. It also governs how clients hand over resources: lend, do not give, when possible. The difficulty is that convenience pulls against it, and one exception can undo the whole analysis.",
    k: ["Strict capability-only authority versus convenience shortcuts for common cases: strict discipline keeps the graph the complete truth, but makes simple programs need more setup.", "Narrowing capabilities before every pass versus passing what you hold: narrowing limits damage, but each narrowing is another step to forget."],
    p: ["A server using its own authority on a client's behalf, the confused deputy, grants clients more than they hold.", "Capabilities kept after their job is done accumulate into broad authority."],
    v: "Pick a component and list its capabilities, then list what it can reach through each server it calls; the totals should equal the declared authority, with no path via ambient identifiers or global names.",
    dep: []
  },
  "isolation-granularity": {
    s: "The choice of how finely the system is split into protection domains, trading containment of faults against the number of IPC crossings and the memory each domain costs.",
    d: "Splitting a filesystem from its block driver contains a bug in one but adds a crossing to every operation. Combining them runs faster but widens what a fault can reach. The choice is made per boundary: security-critical or untrusted code gets its own domain, tightly coupled code shares one. IPC speed and shared memory change the break-even point. Component frameworks let the same code run split or joined. The difficulty is that the wrong choice is found late, after the interfaces have hardened.",
    k: ["Fine-grained domains versus coarse ones: fine domains contain failures and limit authority, but multiply IPC and memory overhead.", "Deciding boundaries at design time versus by measurement: design-time boundaries follow trust, while measurement follows cost, and the two often conflict."],
    p: ["Splitting along a hot path makes the system slow enough that people merge it back and lose the isolation.", "Merging two servers to save IPC gives the weaker one the authority of the stronger."],
    v: "Run the same workload with a boundary split and merged, measure throughput and latency in both, and then inject a fault in one side and record what else fails in each configuration.",
    dep: []
  },
  "mechanism-and-policy": {
    s: "The principle that the kernel supplies mechanisms to enforce and carry out decisions, while policy decides what to do and lives in replaceable user-level servers.",
    d: "The kernel can map a page, but which page and from where is a pager's decision. It enforces a time budget, but does not decide the budgets. It checks a capability, but does not decide who gets it. Keeping policy out lets different systems use different policies on one kernel and keeps the kernel small enough to verify. The cost is that every policy needs a server, and mechanism must be general enough for all of them. The difficulty is knowing when a mechanism is too weak, so policy cannot be built on it efficiently.",
    k: ["Mechanism only in the kernel versus a default policy built in: mechanism-only maximizes flexibility, but every system must supply policy before it works.", "General mechanism versus special-case for common policies: special cases are fast for the usual case, but enlarge the kernel and bias it."],
    p: ["A mechanism that cannot express a needed policy gets worked around with an extra IPC on every operation.", "Moving a policy into the kernel for speed removes the ability to change it."],
    v: "Run two different pagers, or two different budget allocators, on the same unmodified kernel and confirm the system behaves differently under the same load, as each policy specifies.",
    dep: []
  },
  "timing-and-predictability": {
    s: "The set of decisions that make execution time bounded: budgeted scheduling, preemption points, bounded kernel operations, and no unbounded blocking across servers.",
    d: "Real-time guarantees need every part to be bounded: the kernel's longest operation, the scheduler's choice, the budget a thread can use, and the time a server takes on behalf of a caller. Priority inversion across a server is avoided by running the server on the caller's context. Shared resources, such as caches and memory buses, can break the bound across cores. The hard part is composition: a bound for each piece does not give one for the whole unless blocking and sharing are accounted for.",
    k: ["Strict partitioned time budgets versus best-effort scheduling: partitioning gives guarantees for critical tasks, but wastes capacity.", "Bounded blocking by design versus detecting overruns afterward: bounding by design is analyzable, but constrains how servers may be written."],
    p: ["A server that makes an unbounded call to another server breaks every bound upstream of it.", "Analysis ignoring cache and bus sharing across cores reports bounds that cannot be met."],
    v: "Run the critical tasks with maximum interference from every other component and confirm each meets its deadline over a long run, with the observed worst case below the analyzed bound.",
    dep: ["scheduling-context","timing-analysis"]
  },
  "failure-containment": {
    s: "The aim that a fault in one server stops at its boundary: bounded by its capabilities, memory and budget, detected quickly, and recovered by restart without taking others down.",
    d: "A crashed or misbehaving server can harm only what its capabilities reach, use only the memory and time it was given, and fail only the requests that need it. Containment depends on every layer: capabilities for authority, quotas for resources, IOMMU for devices, budgets for time, and supervisors for recovery. Clients must tolerate a server disappearing, with timeouts and retries. The difficulty is state: a restarted server loses what it held, and clients that depended on it must rebuild or be told.",
    k: ["Restart and recover versus fail the whole system: restart gives availability, but needs servers and clients written to tolerate it.", "Keeping server state in a separate persistent store versus in the server: separate state survives restart, but adds a dependency and a trust boundary."],
    p: ["A shared server that every client depends on makes its failure a total failure despite the isolation.", "Clients without timeouts hang forever when a server dies mid-call."],
    v: "Kill each server in turn under load and record which other components fail; every failure beyond the clients of that server is a containment gap to fix.",
    dep: ["driver-restart","quota-accounting"]
  },
  "verification-boundary": {
    s: "The decision about which parts of the system are proven, which are tested, and which are trusted, so that every claim of assurance is stated with its scope.",
    d: "A kernel may be proven while its drivers and servers are not, or a proof may cover functional behavior but not timing. Assurance argues from the proven kernel's isolation guarantees that an unverified component cannot exceed its capabilities, so the unverified code need not be trusted for those properties. The boundary should be chosen so the largest risk sits inside the proof. The difficulty is that the boundary moves: every new feature added to the kernel or to a trusted server expands what must be verified or argued.",
    k: ["A small verified kernel with an unverified periphery versus verifying more servers: a small kernel is feasible to prove, but the system's assurance depends on correct architecture around it.", "Proving one property fully versus many weakly: one strong property gives a clear claim, but leaves others unaddressed."],
    p: ["Describing the system as verified when only the kernel is, hiding the unproven servers that hold the authority.", "A feature added outside the proof boundary that later gets moved inside leaves a gap."],
    v: "Write down each claim of the system with the evidence behind it, proof, test or review, and confirm that no claim relies on an unverified component for a property the kernel does not enforce.",
    dep: ["refinement-proof","trusted-base-assumptions"]
  },
});
