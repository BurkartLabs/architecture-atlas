// Details for the WebAssembly runtime plate, part 2: component model and system interface.
ATLAS.details("wasm-runtime", {
  "interface-definitions": {
    s: "A language for declaring typed interfaces: functions, records, variants, enums, lists, options and resources, grouped into worlds that state what a component imports and exports.",
    d: "An interface file names types and functions without saying how they are implemented. A world lists the interfaces a component needs from its host and those it provides. Tools read these files to check that two components fit and to generate code on both sides. Versioning is part of the name, so a consumer can ask for a specific revision. The hard part is evolution: adding a variant case or a function must not break existing consumers, yet strict structural types make many compatible changes look like breaks.",
    k: ["Nominal worlds with versions vs purely structural matching: versions make intent explicit, but force every producer to update when an interface moves.", "A small fixed set of built-in types vs user-extensible types: a fixed set maps cleanly onto every language, but cannot express everything a library wants."],
    p: ["Adding a field to a record is treated as a break for existing callers, forcing needless coordinated upgrades.", "Two interfaces with the same name and different versions are both imported, and the host wires only one."],
    v: "Define an interface with a record and a function, build a component exporting it, and confirm a second component importing the same definition links, while one importing a changed record is rejected.",
    dep: ["component-binary-format", "canonical-abi"]
  },
  "canonical-abi": {
    s: "The fixed rules for lowering rich types into core values and linear memory, and lifting them back, so components in different languages agree on the layout of strings, lists and records.",
    d: "Lowering takes a high-level value and writes it into the callee's memory using a defined layout: strings with an encoding and length, lists as pointer and count, records field by field, variants with a tag. The callee supplies a realloc function so the caller can place data in its memory. Lifting reads values back out. Both sides validate every range and encoding. It is hard because every copy crosses an isolation boundary, so strings may be transcoded, and a bad pointer from one side must never become a trap in the other's trusted code.",
    k: ["Copying values across component boundaries vs sharing memory: copying preserves isolation, but costs bandwidth on large payloads.", "A single canonical layout vs per-language layouts: one layout lets any language interoperate, but forces conversion in languages whose native layout differs."],
    p: ["A callee realloc that returns an overlapping region lets the caller read the callee's other data.", "Transcoding a string with an invalid sequence traps in the middle of a call instead of failing cleanly."],
    v: "Pass a string with multi-byte characters from a component using one encoding to one using another, and confirm the received string equals the sent one and that an invalid encoding produces a defined error.",
    dep: ["linear-memory", "bounds-checking", "interface-definitions"]
  },
  "component-binary-format": {
    s: "The container format that wraps core modules together with type, import, export, alias and canonical-function sections to describe one component.",
    d: "A component is a binary with its own section set. It embeds core modules, declares component-level types and instances, lists how core functions are lifted and lowered to those types, and names imports and exports. Decoding follows the same discipline as a core module: bounded sizes, validated indices and a strict section order. It nests, so a component may contain components. Hard parts are the larger index spaces (types, instances, components, core items) and keeping validation as strict as for core code.",
    k: ["A new container around unchanged core modules vs extending the core format: wrapping leaves existing engines and tools working, but adds a second decoder and validator.", "Nested components vs flat lists: nesting expresses encapsulation, but makes index resolution and error reporting harder."],
    p: ["A decoder for the component layer reuses a limit meant for core modules and accepts an enormous nesting depth.", "Tools that only understand core modules mistake a component for a corrupt file."],
    v: "Decode a component containing two nested core modules and confirm the tool lists both modules, the types, and the exports; truncating any section must yield a decode error naming the section.",
    dep: ["binary-decoder", "section-structure", "validation-algorithm"]
  },
  "component-composition": {
    s: "Links separately built components by connecting one's exports to another's imports, producing a single component whose internal wiring is hidden.",
    d: "A composition tool reads a graph: which component's export satisfies which import, and what remains unresolved. It checks type compatibility structurally and emits a new component embedding the originals. Because components share nothing but typed values, a component can be replaced by another with the same interface. The result can be flattened to one binary for deployment or linked live by the host. The difficulty is diamond dependencies, where two parts need the same instance, and identifying when two interface versions are compatible.",
    k: ["Static composition at build time vs linking at instantiation: static output is one self-contained artifact, but loses the ability to swap parts per deployment.", "Sharing one instance of a dependency vs instantiating it per consumer: sharing saves memory, but couples state between consumers."],
    p: ["Two consumers unknowingly share a stateful component and see each other's data.", "A composed component works in tests but fails to link on a host that supplies a different version of an import."],
    v: "Compose a component importing a logger with one exporting a logger, run the result with no host logging import, and confirm output appears; leaving one import unresolved must fail composition.",
    dep: ["component-binary-format", "interface-definitions", "component-instantiation"]
  },
  "resource-handles": {
    s: "Typed, owned or borrowed references to host or component objects, such as an open file or a connection, passed as small integers the holder cannot forge.",
    d: "A resource type declares a constructor, methods and a destructor. Values crossing a boundary are table indices in the holder's own handle table, not pointers. An owned handle transfers responsibility to drop; a borrowed handle is valid only during the call. The runtime checks the handle's type and liveness on every use and runs the destructor when the last owner drops it. The hard parts are rules for lending, preventing a borrow from escaping its call, and cleaning up handles when an instance traps.",
    k: ["Indices in per-component tables vs raw pointers: indices cannot be forged or dangle, but every use costs a table lookup and type check.", "Owned versus borrowed handles in the type system vs convention: types let the runtime enforce lifetimes, but complicate bindings for languages without matching ownership."],
    p: ["A handle table that never drops entries after a trap leaks every resource the guest held.", "A borrowed handle stored by the callee is used after the call, and the runtime reports a use of freed state."],
    v: "Open a resource, pass it as a borrow, try to retain it past the call, and confirm the second use traps; dropping the owner must run the destructor exactly once.",
    dep: ["canonical-abi", "capability-based-access", "tables"]
  },
  "component-instantiation": {
    s: "Builds a running component by instantiating its embedded core modules in dependency order, wiring lowered and lifted functions between them, and satisfying imports from the host.",
    d: "Instantiation walks the component's declared instances: it instantiates each core module with imports that are either host functions, lowered component functions or other instances' exports. Adapter functions implementing the canonical ABI are generated and placed between modules. The order matters because start functions and initializers run as soon as an instance exists. Failure partway leaves partially built instances that must be torn down. Cost grows with adapters and nested components, so large compositions instantiate slowly.",
    k: ["Eager instantiation of every nested part vs lazy instantiation on first call: eager fails early and runs predictably, but pays for parts never used.", "Generated adapters compiled at instantiation vs precompiled with the component: precompiled adapters start fast, but must match the host's exact ABI choices."],
    p: ["A cyclic dependency between instances is reported only when a start function calls into the one not yet built.", "An import satisfied by the wrong host function type is caught late, after other instances have run initializers."],
    v: "Instantiate a component of three nested modules with logging in each start function and confirm initialization order matches dependencies; remove one import and confirm nothing runs.",
    dep: ["instantiation-and-start", "linker", "canonical-abi", "component-composition"]
  },
  "async-streams-and-futures": {
    s: "Typed streams and futures that let components wait on and pass values asynchronously, without blocking a host thread for each waiting task.",
    d: "A future delivers one value later; a stream delivers a sequence with back-pressure. A component that awaits suspends and returns control to a scheduler, which resumes it when the value is ready. The runtime tracks pending tasks, their handles and cancellation. Built on stack switching or a callback style, it lets one thread run thousands of tasks. Difficulty includes cancellation semantics, back-pressure so a fast producer cannot fill memory, and keeping borrowed resources valid while a task is suspended.",
    k: ["Callback-style async vs stack-switching coroutines: callbacks need no new engine support, but force every language to restructure its control flow.", "Bounded streams with back-pressure vs unbounded buffers: bounded streams protect memory, but let a slow reader stall every producer upstream."],
    p: ["A task dropped while suspended leaves its streams open, and the writer waits forever.", "A borrowed resource is held across a suspension point and invalidated by the caller returning."],
    v: "Run a producer and consumer over a stream with a small buffer, make the consumer slow, and confirm the producer pauses at the buffer limit and memory use stays flat.",
    dep: ["resource-handles", "stack-switching", "io-streams-and-polling"]
  },
  "bindings-generators": {
    s: "Tools that read interface definitions and generate guest and host code, so each side calls typed functions instead of handling raw lowering by hand.",
    d: "A generator takes a world and emits, for each language, types matching the definition plus glue that performs lifting and lowering, allocation and handle management. Host-side generators emit trait or class definitions an embedder implements. Guest-side generators emit the exports and import stubs. Both rely on the canonical ABI, so they interoperate. Hard parts include mapping variants, options and ownership onto languages that lack them, naming collisions, and keeping generated code in step with interface versions.",
    k: ["Generating at build time vs reflecting at runtime: build-time code is fast and typed, but requires a toolchain step for every interface change.", "One generator with plugins per language vs separate per-language tools: shared parsing keeps behavior consistent, but languages with unusual idioms fit poorly."],
    p: ["Generated host and guest code come from different interface versions and disagree on a record's layout.", "A generated binding frees a returned list that the caller still references."],
    v: "Generate bindings from one interface for two languages, build a component in each, and confirm each calls the other's exports and receives equal values for records and lists.",
    dep: ["interface-definitions", "canonical-abi", "host-embedding-api"]
  },
  "system-interface-worlds": {
    s: "A standard set of host interfaces, grouped into worlds such as a command-line program or an HTTP handler, that a module imports to reach files, clocks, sockets and other services.",
    d: "A world defines the exact imports and exports for a kind of program: a command world needs standard streams, arguments and environment; a server world needs an incoming request handler. A host implements the world and grants the parts it chooses. Interfaces are small and versioned, so a module imports only what it needs and a host can refuse the rest. The challenge is keeping every interface implementable on many operating systems while still being useful, and agreeing on which services each world guarantees.",
    k: ["Small composable interfaces vs one large system API: small interfaces let hosts grant narrowly, but a program may need many imports to do ordinary work.", "A portable common subset vs host-specific extensions: a common subset keeps modules portable, but leaves out features such as advanced file locking."],
    p: ["A module built for a rich world is deployed to a host implementing a smaller one and fails at link time.", "Hosts implement the same call differently, so portable modules show different behavior."],
    v: "Run one command-world module on two different hosts and confirm identical output for arguments, environment and exit code, and that an unsupported import fails at link time with its name.",
    dep: ["interface-definitions", "capability-based-access", "imports-and-exports"]
  },
  "filesystem-interface": {
    s: "File and directory operations expressed on handles to directories, so a module opens names relative to a handle it was given rather than anywhere on disk.",
    d: "The interface offers open, read, write, seek, stat, readdir, rename and similar calls, all taking a directory handle plus a relative path. The host resolves the path inside the granted subtree, refusing any attempt to escape through parent segments or links. Handles carry rights such as read-only or no-create. Hard parts are semantic gaps between operating systems (case sensitivity, permissions, symbolic links), atomic path resolution to avoid races, and performance, since each call crosses the host boundary.",
    k: ["Relative-to-handle paths vs absolute paths: handle-relative paths make escape structurally impossible, but port badly from programs that assume a global namespace.", "Per-handle rights vs all-or-nothing access: rights allow read-only mounts, but add a second set of checks to every call."],
    p: ["A symbolic link inside a granted directory points outside it, and a naive resolver follows it.", "Check-then-open races let a path change between validation and use."],
    v: "Grant a read-only directory, attempt to write, to open a parent-relative path, and to follow a link pointing outside; confirm all three are refused and a normal read succeeds.",
    dep: ["preopened-directories", "capability-based-access", "io-streams-and-polling"]
  },
  "preopened-directories": {
    s: "Directories the host opens before the module starts and passes in as named handles, which are the only roots from which the module can reach files.",
    d: "At instantiation the host maps chosen host paths to guest-visible names and rights, such as a data directory read-only and a scratch directory writable. The module discovers these by enumerating them and opens everything relative to one. If nothing is preopened the module cannot open any file. This replaces ambient authority with explicit grants. It is hard because programs written for a global filesystem need a tool or library to translate absolute paths, and mapping many directories makes access control harder to audit.",
    k: ["Explicit preopens vs a virtual root filesystem: explicit grants are minimal and auditable, but programs must be told where to look.", "Granting a whole directory tree vs a list of files: a tree is convenient, but exposes everything later added beneath it."],
    p: ["A host preopens a parent directory for convenience, giving the module access to unrelated project files and secrets.", "A module hardcodes an absolute path that no preopen covers and fails only in production."],
    v: "Start a module with one preopened directory and confirm it can list and read there, while opening a sibling path of the same parent returns a permission error.",
    dep: ["capability-based-access", "filesystem-interface"]
  },
  "clocks-and-random": {
    s: "Interfaces that give a module wall-clock time, monotonic time and random bytes, each supplied by the host and each a place where precision and determinism are decided.",
    d: "A wall clock reports calendar time; a monotonic clock gives elapsed time that never moves backward; a random source supplies bytes, optionally insecure but fast. Because the host provides them, a sandbox can reduce precision or fix their values. Timing resolution matters for side-channel attacks, and randomness quality for cryptography. The difficulty is policy: a record-and-replay or deterministic runtime must virtualize all three, while a production host must keep random bytes unpredictable and clocks accurate.",
    k: ["Coarsened clock resolution vs full resolution: coarse time reduces timing attacks, but breaks benchmarks and fine-grained scheduling.", "Host-supplied entropy vs a seeded generator in the module: host entropy is secure, but a seeded one makes runs reproducible."],
    p: ["A deterministic test harness forgets to virtualize one clock and produces flaky results.", "A host returns weak random bytes to every instance, so keys generated in different modules collide."],
    v: "Read the monotonic clock twice around a known sleep and confirm the difference is at least the sleep. Request random bytes twice and confirm the outputs differ.",
    dep: ["system-interface-worlds", "side-channel-mitigation"]
  },
  "sockets-interface": {
    s: "Network operations such as connect, bind, listen, accept, send and receive, exposed as handles the host grants individually to specific addresses and ports.",
    d: "Instead of an open network, the host supplies a network capability and the module creates socket handles from it. The host checks every connect or bind against a policy of allowed addresses, ports and protocols, and can run name resolution itself. I/O is expressed with streams and pollables, so the module waits on many sockets at once. Hard parts include blocking behavior, differences in how operating systems report errors, and limiting resource use such as the number of open connections.",
    k: ["Allow-listed address and port policy vs full network access: allow-lists limit damage from a compromised module, but need configuration for every deployment.", "Host-side name resolution vs resolution inside the module: host resolution can be filtered, but the module sees only what the host reveals."],
    p: ["A module resolves a name to a private address and reaches internal services the allow-list did not intend.", "Unbounded accept calls let one module exhaust the host's file descriptors."],
    v: "Grant connections to a single address and port, connect to it, then try a different port and a different address; confirm only the first succeeds.",
    dep: ["capability-based-access", "io-streams-and-polling", "memory-and-table-quotas"]
  },
  "environment-args-stdio": {
    s: "Calls that give a module its command-line arguments, environment variables and the three standard streams, each chosen and filtered by the host.",
    d: "At startup the host decides the arguments and variables to expose. Most hosts pass a minimal or empty environment rather than copying their own, because variables often hold secrets. Standard input, output and error are streams the host can connect to terminals, files, pipes or capture buffers. A module reads and writes them like any other stream. It is hard mainly for policy: environment variables leak credentials, and unbounded writes to a captured stream can exhaust host memory.",
    k: ["Explicit environment allow-list vs inheriting the host environment: an allow-list leaks nothing, but breaks programs that expect common variables.", "Captured output in memory vs streamed to a sink: capture is easy to inspect, but unbounded without a size limit."],
    p: ["The host forwards its full environment, including access tokens, to an untrusted module.", "A noisy module writes gigabytes to a captured stream and exhausts memory."],
    v: "Run a module that prints its environment with only two variables allowed, and confirm exactly those two appear and nothing from the host's own environment.",
    dep: ["system-interface-worlds", "io-streams-and-polling"]
  },
  "io-streams-and-polling": {
    s: "Input and output streams plus pollable handles that let one module wait for any of many sources to become ready, without blocking on each in turn.",
    d: "A stream offers read and write operations returning what is available and an indication of readiness. A pollable represents a future event: data arrived, a timer fired, a connection completed. The module passes a list of pollables to a wait call and gets back which are ready. Hosts back these with their event loop. The hard parts are back-pressure when a writer is faster than a reader, partial reads and writes, and ensuring closing a stream releases the underlying host resource promptly.",
    k: ["Readiness-based polling vs completion-based async calls: polling maps to the host event loop easily, but needs a retry loop in the guest.", "Blocking calls on streams vs only non-blocking: blocking is simplest to port to, but one slow stream holds the instance's thread."],
    p: ["Ignoring a partial write drops data silently when the host buffer is full.", "A pollable is waited on after its stream closed, and the wait never returns."],
    v: "Wait on a socket and a timer together, send data after the timer should fire, and confirm the wait returns the timer first and the socket only after data arrives.",
    dep: ["resource-handles", "system-interface-worlds", "clocks-and-random"]
  },
  "http-interface": {
    s: "Interfaces for sending outgoing HTTP requests and for handling incoming ones, with headers, bodies and trailers expressed as typed resources and streams.",
    d: "Outgoing calls build a request resource with method, URL, headers and a body stream, and return a future for the response. Incoming handlers export a function that receives a request and fills a response. Bodies are streams, so large uploads and downloads do not need to fit in memory. The host enforces policy: which hosts may be called, header filtering, size limits and timeouts. It is hard because HTTP semantics are large, and the host must still bound everything a module can send or receive.",
    k: ["Streaming bodies vs fully buffered bodies: streaming handles large payloads, but needs the guest to cooperate with back-pressure.", "Host-enforced outbound allow-list vs trusting the module: an allow-list prevents unauthorized calls, but must handle redirects to other hosts."],
    p: ["A redirect sends a request to a host the allow-list never approved.", "A handler reads a body with no size limit and exhausts memory on one large request."],
    v: "Deploy a handler that echoes the request path, send requests with large and small bodies, and confirm correct responses and that an oversized body is rejected at the configured limit.",
    dep: ["sockets-interface", "io-streams-and-polling", "resource-handles", "async-streams-and-futures"]
  },
});
