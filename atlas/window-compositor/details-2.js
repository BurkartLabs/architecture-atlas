// Details for the window system & compositor plate, part 2: client protocol, surfaces and buffers, legacy compatibility.
ATLAS.details("window-compositor", {
  "wire-protocol": {
    s: "The message format and object model on the local socket: numbered objects, typed requests from clients, events from the compositor, and file descriptors passed alongside.",
    d: "Messages are small binary frames giving an object id, an opcode and typed arguments such as integers, strings, arrays and object references. Objects are created by requests and live until destroyed, and each belongs to an interface with a version. Descriptors for shared memory or GPU buffers travel as ancillary data on the same socket. Both sides generate code from machine-readable interface descriptions. It is hard because object lifetimes are asynchronous: an event can arrive for an object the client has just destroyed.",
    k: ["Asynchronous requests with no replies versus synchronous calls: asynchronous keeps the pipeline full and avoids deadlock, but errors appear later and far from their cause.", "Descriptions generated into code versus hand-written parsing: generation keeps both sides consistent and versioned, at the cost of a build step and generated code to maintain."],
    p: ["A client destroys an object while an event for it is in flight and then treats the late event as an error.", "A malformed message length lets one client crash a parser that trusted its input."],
    v: "Send random and truncated messages and oversized descriptor counts from a fuzzing client; confirm the compositor disconnects that client with a protocol error and all other clients continue unaffected.",
    dep: ["connection-handling", "client-resource-limits"]
  },
  "global-registry": {
    s: "The list of interfaces the compositor offers, with versions, which a client reads at connect time to discover what it can bind to.",
    d: "On connecting, a client receives a registry object and a stream of events, one per global: an interface name, an id and the highest supported version. The client binds only those it needs, at a version no higher than it understands. Globals can appear and disappear at runtime, for example when an output is attached, so the client must handle both. Privileged globals can be hidden from unprivileged clients entirely. It is hard because clients must cope gracefully with missing features.",
    k: ["Advertising everything to every client versus filtering by privilege: filtering means restricted clients cannot even see sensitive interfaces, at the cost of per-client globals lists.", "Binding at the client's own version versus the maximum offered: client-chosen versions allow old clients to keep working, but the compositor must support every older behavior."],
    p: ["A client assumes an optional interface exists and crashes at startup on a minimal compositor.", "An output global is removed while a client holds objects bound to it, leaving dangling references."],
    v: "Connect as an unprivileged client and list globals; confirm capture and input injection interfaces are absent. Remove a monitor and confirm clients receive a removal event for its output.",
    dep: ["wire-protocol", "client-identity", "protocol-extensions"]
  },
  "connection-handling": {
    s: "Accepting local socket connections, managing each client's lifetime, flushing queued events, and disconnecting clients that misbehave or stop reading.",
    d: "The compositor listens on a socket in a per-user runtime directory and creates a client record for each connection, with its object table, send buffer and credentials from the socket. Events are queued per client and written when the socket is writable. A client that stops reading would let the queue grow without bound, so it is disconnected past a limit. Activation by socket lets the compositor start on demand and lets launchers hand out connections. Hard parts are fairness and the cleanup of everything owned by a client that vanishes.",
    k: ["Disconnecting slow readers versus buffering without limit: disconnecting protects the compositor, but a briefly stalled client such as one stopped in a debugger is dropped.", "A single socket per session versus several for different trust levels: separate sockets simplify permissions, but multiply setup and complicate sandboxed programs."],
    p: ["A paused client stops reading events, and queued input grows until the compositor runs out of memory.", "Client death leaves its windows, grabs and selections owned by nobody until a timer notices."],
    v: "Freeze a client with a pending event flood and confirm it is disconnected at the queue limit while memory stays bounded. Kill a client and confirm its windows disappear within a frame.",
    dep: ["compositor-event-loop", "client-identity", "client-crash-isolation"]
  },
  "protocol-extensions": {
    s: "The way new interfaces are added: stable core, staged experimental and compositor-specific extensions, with versions that let clients and compositors of different ages work together.",
    d: "Features beyond the core appear as separate interfaces in the registry with their own version numbers. Proposals move through stages: unstable, staging, stable, with names that signal the commitment. A client uses an extension only if present and falls back otherwise. Compositors differ in which they implement, so a common core set emerges and toolkits detect capabilities at runtime. It is hard to remove or change anything after release, so careful review precedes stabilization.",
    k: ["Many small optional interfaces versus one large versioned core: small ones evolve independently, but clients must handle many combinations of support.", "Experimental interfaces open to all versus prefixed to one compositor: open ones get faster adoption but are hard to change once clients depend on them."],
    p: ["A client requires an extension that only one compositor offers and breaks elsewhere.", "A stabilized interface turns out to have a flaw that cannot be fixed without a new interface running alongside the old."],
    v: "Run one client against two compositors that implement different extension sets and confirm it detects the difference, uses the available path, and never sends a request for a missing interface.",
    dep: ["global-registry", "wire-protocol"]
  },
  "request-dispatch": {
    s: "Reading requests from client sockets and running them against compositor state in a defined order, while queuing outgoing events so each client sees consistent sequences.",
    d: "The event loop wakes when a socket is readable, parses each complete message, finds its object, and calls the implementing handler. Handlers update pending state or reply with events. Events are batched and flushed at defined points, often once per loop iteration. Ordering within one client is strict, and across clients there is none. The difficulty is handlers that block, since a single slow request delays every other client on a single-threaded loop, and validating arguments against object state with no trust in the client.",
    k: ["Single dispatch thread versus per-client threads: one thread removes locking and makes ordering simple, but one slow handler stalls everyone.", "Flush after every request versus batching per iteration: batching reduces system calls and keeps events grouped, while immediate flush has lower latency for rare events."],
    p: ["A handler waiting for a GPU resource blocks the loop and every client's input freezes.", "A client sends a request referencing an object it has already destroyed, and the handler dereferences freed state."],
    v: "Flood the compositor from one client with thousands of requests per second and confirm input latency for another client's key press stays within one frame.",
    dep: ["wire-protocol", "compositor-event-loop", "client-resource-limits"]
  },
  "serials-and-ordering": {
    s: "Counters attached to input events and state changes so requests can prove which event they respond to, and stale or forged requests can be rejected.",
    d: "Each input event carries a serial number. Requests that need user authority, such as starting a move, setting the clipboard, or opening a popup, must quote the serial of the event that justified them. The compositor checks that the serial belongs to that client and is recent. Configure and acknowledge pairs use serials to match a client's drawing to the compositor's resize request. It is hard because serials are advisory unless every sensitive request actually validates them, and because races between input and requests produce legitimate old serials.",
    k: ["Strict serial checking versus accepting any serial from the client: strict stops background programs acting without user input, but rejects slightly late legitimate requests.", "One global counter versus per-object counters: global is simple and sortable, per-object scales better but cannot compare across objects."],
    p: ["A compositor never validates serials, so any background program can set the clipboard or raise itself.", "A resize acknowledgement matches the wrong configure after a fast second resize, and the window shows a mismatched frame."],
    v: "Send a clipboard-set request using an invented serial and one from an old event of another client; confirm both are refused and a request using a genuine recent serial succeeds.",
    dep: ["wire-protocol", "input-event-routing"]
  },
  "client-resource-limits": {
    s: "Quotas and defensive limits on what one client may allocate or send: objects, buffers, shared memory, message rate and queued events.",
    d: "A malicious or buggy client can try to exhaust memory with huge buffers, huge numbers of surfaces, or endless requests. The compositor caps the object count, buffer sizes and total shared memory per client, bounds the outgoing queue, and validates every dimension and offset in shared buffers to avoid reading beyond the mapped region. Exceeding a limit disconnects the client with an error. Hard parts are choosing limits that never hurt legitimate programs, and shared memory that the client can shrink after the compositor has mapped it.",
    k: ["Hard limits with disconnect versus soft limits with throttling: hard limits are simple and safe, throttling is gentler but keeps misbehaving clients alive.", "Mapping client memory directly versus copying on commit: mapping is faster, but a client truncating the file can fault the compositor."],
    p: ["A client truncates a shared memory file after commit and the compositor crashes on the next read of the mapping.", "Limits are set so low that a legitimate large canvas on a high-resolution display is rejected."],
    v: "Have a test client request buffers beyond the limit and truncate a mapped file while committed; confirm the compositor survives, disconnects only that client, and other clients keep rendering.",
    dep: ["connection-handling", "shared-memory-buffers", "wire-protocol"]
  },
  "client-identity": {
    s: "How the compositor knows which program is on the other end of a connection and what it is allowed to do, from socket credentials, sandbox metadata and launch-time tokens.",
    d: "The kernel supplies the process id and user id of the socket peer, which the compositor can map to an executable and, for sandboxed applications, to an application identifier and a restricted connection created by the sandbox launcher. Privileged interfaces are bound to allowed identities. Activation tokens passed from launcher to launched program let it request focus legitimately. It is hard because process ids can be reused, because forked children inherit sockets, and because a program cannot reliably name itself.",
    k: ["Trusting kernel-reported credentials versus client-declared names: credentials cannot be forged by the client, but identify a process, not the intent of the code in it.", "Per-sandbox sockets with a fixed identity versus one shared socket: separate sockets bind identity to the connection, at the cost of launcher cooperation."],
    p: ["A privileged client is started by a compromised helper and inherits its trust.", "A process id is reused after exit, and a stale permission applies to an unrelated program."],
    v: "Launch a sandboxed program and an unsandboxed one, ask each for a privileged interface, and confirm only the one with a matching identity is granted it, with the application identifier logged.",
    dep: ["connection-handling", "global-registry", "security-and-isolation"]
  },
  "surface-roles": {
    s: "The idea that a surface becomes useful only when given a role, such as application window, popup, cursor, drag icon or panel, each with its own rules for position, size and lifetime.",
    d: "A bare surface is only pixels. Assigning a role attaches behavior: a window role carries title, state and configure handshake; a popup is positioned relative to a parent and dismissed on outside click; a cursor role follows the pointer. A surface can have at most one role for its life, and a surface cannot be mapped until a role exists and a buffer is attached. Roles are defined by separate extension interfaces. The challenge is the initial handshake, where the compositor must configure a window before the client first draws.",
    k: ["One role per surface for life versus changeable roles: fixed roles keep lifecycle rules simple, but make reuse of a surface across a toolkit mode change awkward.", "Compositor-initiated configure handshake versus clients choosing geometry: handshake gives control over size, but needs a round trip before the first frame."],
    p: ["A client attaches a buffer before the first configure and is shown at the wrong size, then jumps.", "Role assignment is attempted twice and results in a protocol error that kills the connection."],
    v: "Create a window and watch the sequence: role assigned, configure sent, acknowledged, buffer attached, window shown. Confirm no frame appears before the first acknowledged configure.",
    dep: ["wire-protocol", "double-buffered-state", "scene-graph"]
  },
  "double-buffered-state": {
    s: "Surface changes such as new buffer, damage, scale and regions are staged, then applied together on commit so the compositor never shows a half-updated surface.",
    d: "Requests that change how a surface looks write into pending state. A commit request applies the whole set atomically to current state, so a new buffer, its size and its input region change on the same frame. Subsurfaces can be synchronized so the parent's commit also applies their staged state. The compositor may delay applying a commit until it can, for example waiting on a fence. It is hard because every new property must follow the rule, and because parents and children need clear commit rules.",
    k: ["Atomic commit of all pending state versus applying each request immediately: atomic avoids torn frames, but forces clients to commit even for simple property changes.", "Synchronized versus desynchronized subsurfaces: synchronized keeps video and frame consistent, desynchronized lets a video update at its own rate."],
    p: ["A new property is added that applies immediately, so a window briefly shows new geometry with old content.", "A parent never commits, and a synchronized child's update waits forever."],
    v: "Resize a window with rapidly changing content and capture each presented frame; confirm every frame has a buffer size matching its geometry, with no mixed old and new state.",
    dep: ["surface-roles", "explicit-sync", "subsurfaces"]
  },
  "shared-memory-buffers": {
    s: "Pixel buffers in memory shared between the client's CPU drawing and the compositor, mapped from a file descriptor and read when the surface is composed.",
    d: "The client creates an anonymous memory region, sends its descriptor, and describes a buffer within it by offset, width, height, stride and pixel format. The compositor maps the region once and uploads buffer contents to a GPU texture, or composes them on the CPU. It is simple and works everywhere, but costs a copy each frame and lets a client write while the compositor reads. Hard parts include format support, partial uploads limited to damaged rows, and the truncation hazard of shrinking mapped memory.",
    k: ["Shared memory versus GPU buffers for simple clients: shared memory needs no GPU and any toolkit can use it, but the copy to texture costs bandwidth for large or frequently changing windows.", "Uploading the whole buffer versus only damaged rectangles: partial uploads save bandwidth, but need correct client damage reports."],
    p: ["A client reuses a buffer while the compositor still reads it, and the screen shows torn or half-updated content.", "Wrong stride calculation reads past the end of the mapped region."],
    v: "Run a software-drawn client animating its full window and confirm presented frames contain no mixed old and new rows while the compositor's CPU and bandwidth use stays within budget.",
    dep: ["buffer-release", "texture-import-cache", "client-resource-limits", "damage-tracking"]
  },
  "gpu-buffer-sharing": {
    s: "Passing GPU memory between a client and the compositor as a handle with layout information, so accelerated clients are displayed without copies.",
    d: "A client allocates a buffer on the GPU, exports it as a file descriptor with its width, height, format, per-plane offsets, strides and a layout modifier, and sends it to the compositor, which imports it as a texture or hands it to the display hardware for direct scanout. No pixel data crosses the CPU. The importer must trust the descriptor describes real memory it can use. Hard parts are across different GPUs, where a buffer must be copied or rejected, and ensuring the producer finished writing before the consumer reads.",
    k: ["Zero-copy sharing versus portable shared memory: zero-copy gives the best performance but depends on matching drivers and formats, and fails on mixed-GPU systems.", "Importing into a texture versus using the buffer directly for scanout: texture import always works with effects, direct use skips the GPU but only when the display can accept it."],
    p: ["A buffer allocated on one GPU is imported on another and silently becomes very slow, or fails.", "The compositor reads a buffer before the client's GPU work has finished, producing a flicker of stale content."],
    v: "Run an accelerated client and confirm with GPU and memory counters that its frames reach the display with no CPU copy. Run it on a secondary GPU and confirm correct output with the cost visible.",
    dep: ["format-modifier-negotiation", "explicit-sync", "gpu-memory-allocator", "texture-import-cache"]
  },
  "format-modifier-negotiation": {
    s: "Agreement between client, compositor and display on which pixel formats and memory layouts, including tiling and compression, can be produced, imported and scanned out.",
    d: "The compositor tells clients which format and modifier pairs it can import, and it may also give a more specific list per surface for direct scanout. The client's driver picks a pair that it can render to from that list. The result must also work for the display's planes and for any capture or encoder consumers. Layout modifiers describe tiling and compression that vary by GPU generation. It is hard because the intersection can be empty, which forces a fallback to a plain linear layout and loses performance.",
    k: ["Compositor-supplied preferred formats versus client-chosen formats: preferred lists enable scanout and zero-copy, but need feedback that changes as surfaces move between outputs.", "Optimal tiled layouts versus linear ones: tiled is much faster for the GPU, while linear is accepted everywhere including by CPUs and other devices."],
    p: ["A surface moves to a monitor that cannot scan out its layout, and performance drops with no sign why.", "A client picks a compressed modifier that the compositor's importer cannot read, and the window renders black."],
    v: "Move a full-screen client between two different monitors and confirm the compositor updates the format feedback and the buffer layout changes to the one that can be scanned out directly.",
    dep: ["gpu-buffer-sharing", "overlay-planes", "direct-scanout", "hardware-variability"]
  },
  "buffer-release": {
    s: "The handshake that tells a client when the compositor has finished with a buffer and it may be drawn into again, as opposed to when it was merely attached.",
    d: "After a commit the compositor may read from the buffer until the next buffer replaces it and the new one has been presented. Only then is the old one released. Clients commonly rotate two or three buffers. The compositor must not release early, which lets the client overwrite what is still scanned out, and must not hold forever, which starves a client of buffers. Direct scanout extends hold time since the display reads the buffer continuously. Explicit fences refine release timing.",
    k: ["Release when the next frame is presented versus when copied to a texture: after-copy returns buffers quickly, but only works when the compositor really copies; zero-copy paths must hold them.", "Double versus triple buffering: more buffers absorb jitter, but cost memory and add latency."],
    p: ["A buffer is released while still being scanned out, and the screen shows partly redrawn content.", "A client that never receives its release stops drawing, and the window freezes."],
    v: "Enable direct scanout of an animating client and confirm via counters that each buffer is released only after the next one is visible, with no tearing and no starved client.",
    dep: ["explicit-sync", "direct-scanout", "shared-memory-buffers", "gpu-buffer-sharing"]
  },
  "explicit-sync": {
    s: "Synchronization objects passed with buffers, so the compositor waits exactly until the client's GPU work is done, and the client learns exactly when the compositor's reads finish.",
    d: "Each commit can carry an acquire point, a fence the compositor waits on before reading, and a release point, signaled when it is done. Implicit sync by contrast hides ordering inside the kernel's buffer tracking, which each driver implements differently and which cannot express fine ordering or partial work. With explicit sync, the compositor can schedule a frame without blocking its thread, by waiting on the fence descriptor in its event loop. Hard parts are timeline objects, errors from a timed-out client, and mixing with clients that do not provide fences.",
    k: ["Explicit fences versus implicit buffer tracking: explicit is predictable and portable across drivers, but every client and compositor must be updated to use it.", "Waiting on fences in the loop versus blocking in the GPU: loop waiting keeps the compositor responsive, but needs careful handling when many fences are pending."],
    p: ["A client signals its acquire point too early, and the compositor displays a half-rendered frame.", "A fence never signals because the client's GPU hung, and the compositor waits on it forever."],
    v: "Present frames from a client whose GPU work is deliberately slow and confirm none are shown before the fence signals and the compositor loop keeps serving input while it waits.",
    dep: ["sync-primitives", "buffer-release", "gpu-buffer-sharing", "double-buffered-state"]
  },
  "subsurfaces": {
    s: "Child surfaces positioned relative to a parent that let one window combine several independently updated pieces such as video, overlays and widgets.",
    d: "A subsurface has a position within its parent and a place in the parent's stacking order. It is either synchronized, applying its changes only when the parent commits, or desynchronized, updating on its own commit. Toolkits use them to put a video decoder's buffers in one child so the rest of the window need not be redrawn, and the compositor can then give the child a hardware plane. The difficulty is the nested state rules and keeping damage, scale and input regions right across the whole tree.",
    k: ["Subsurfaces for video and embedded content versus drawing everything in one buffer: subsurfaces allow independent update rates and overlay planes, at the cost of more commit coordination.", "Synchronized default versus desynchronized: synchronized avoids visible inconsistency, desynchronized allows lowest latency for the child."],
    p: ["A child updates at a different moment from the parent, so a video frame appears over the wrong chrome for a frame.", "Position changes apply on a parent commit that never arrives, and the child stays at its old place."],
    v: "Play video in a subsurface while resizing and scrolling the parent window; confirm the video remains aligned with its frame in every presented capture and gets promoted to a plane when possible.",
    dep: ["double-buffered-state", "scene-graph", "overlay-planes", "surface-roles"]
  },
  "cursor-surfaces": {
    s: "Pointer images supplied by clients as surfaces with a hotspot, drawn by the compositor, hardware cursor plane or software, and changed as the pointer moves between windows.",
    d: "Each client sets the cursor shape when the pointer enters its surface, either from a named theme cursor or from its own image. The compositor draws it at the pointer position, preferably on the hardware cursor plane, which keeps the pointer moving smoothly even when the scene is slow to update. Hotspot, scale and animation have to be handled. The cursor must be reset when focus leaves the client. A hard part is hardware planes with limited sizes and formats, and scaling the cursor image per monitor.",
    k: ["Hardware cursor plane versus drawing the cursor in the scene: hardware is independent of frame rate and low latency, but has size and format limits and does not appear in some captures.", "Client-supplied cursor images versus server-side themes: client images allow custom art, themes keep consistent size and scale."],
    p: ["A client sets a cursor and exits, and the pointer stays as an invisible or stale image on other windows.", "A very large cursor exceeds the hardware plane limit and the compositor silently falls back to software, adding latency."],
    v: "Move the pointer across windows with different cursor shapes and across monitors with different scales; confirm shape, size and hotspot are correct and the pointer stays smooth while a heavy window is redrawing.",
    dep: ["scaled-cursors", "overlay-planes", "pointer-hit-testing"]
  },
  "legacy-rootless-server": {
    s: "A translation layer that runs older windowing clients, each window shown as an ordinary surface in the compositor, without a separate full-screen display server.",
    d: "The layer is a server for the legacy protocol, started on demand, whose windows are mapped onto surfaces in the compositor. It acts as a client of the compositor, drawing each legacy window's contents into buffers. Window position and stacking requests from legacy clients are translated into compositor operations. Legacy clients expect global coordinates and the ability to see all windows, so the layer simulates a single root coordinate space for them. Hard parts are performance, input, and the many ways legacy clients move or reparent windows themselves.",
    k: ["Rootless windows integrated with the desktop versus one big rooted window: rootless feels native and works with scaling, but needs substantial translation of window semantics.", "Starting the layer on demand versus always running: on demand saves memory, but delays the first legacy window and complicates session setup."],
    p: ["A legacy client positions its own window at absolute coordinates that make no sense in a multi-monitor desktop.", "The layer crashes and takes every legacy window with it, losing unsaved work."],
    v: "Launch a legacy program and confirm it appears as a normal window, takes focus, moves between workspaces, and that closing the layer ends only the legacy windows, not native ones.",
    dep: ["surface-roles", "legacy-property-translation", "connection-handling"]
  },
  "legacy-property-translation": {
    s: "Mapping of the old protocol's window hints, such as titles, types, sizes, transient parents and state flags, to the roles and states the compositor understands.",
    d: "Older clients describe windows by setting properties: type (dialog, menu, tooltip), minimum and maximum size, the window they are a dialog for, and requests to go full-screen or stay on top. The compatibility layer reads these and creates the correct role and state, popups with a parent for menus, and so on. Override-redirect windows, which ask to be placed without any management, become popups with computed positions. It is hard because the hints are loosely specified, and each toolkit sets them differently.",
    k: ["Mapping hints strictly to modern roles versus guessing from behavior: strict mapping is predictable, but real clients break the rules and need heuristics.", "Honoring client-requested positions versus placing under compositor policy: honoring keeps menus and tooltips in place, but lets clients cover the screen."],
    p: ["A menu is treated as a normal window, so it gets a title bar and steals focus.", "A tooltip with no parent is placed at the screen origin because its owner cannot be determined."],
    v: "Open menus, tooltips, dialogs and full-screen requests from several legacy toolkits and confirm each is shown with the right role, parent, stacking and focus behavior.",
    dep: ["legacy-rootless-server", "surface-roles", "popups-and-transients", "window-management-policy"]
  },
  "legacy-grab-emulation": {
    s: "Emulating the old model in which any client may take over the keyboard or pointer globally, by granting such requests only within the legacy client's own windows or briefly.",
    d: "Legacy programs grab input for menus, drag operations and global hotkeys, and expect the grab to apply across the whole screen. The compatibility layer translates these into compositor grabs, but limited: a popup grab ends when the user clicks elsewhere, and global key grabs are refused or routed through the shortcut registry. Without this, a single misbehaving client could take all input from the desktop. The balance is hard, because some legitimate programs, like screen recorders and password managers, rely on the old behavior.",
    k: ["Refusing global grabs versus granting them: refusing keeps the desktop safe, but breaks programs that assumed global control.", "Time-limited grabs versus explicit user permission: time limits are invisible to the user, while permission prompts add friction to every affected program."],
    p: ["A legacy menu grab is never released after its client hangs, and the whole desktop stops responding to clicks.", "A global hotkey utility silently stops working because its key grab is refused."],
    v: "Freeze a legacy client holding a menu grab and confirm the grab is dropped on the next outside click or timeout and input returns to other windows.",
    dep: ["pointer-grabs-and-confinement", "legacy-rootless-server", "global-shortcut-registry", "security-and-isolation"]
  },
  "legacy-selection-bridge": {
    s: "A two-way bridge that keeps the clipboard and drag-and-drop consistent between legacy windows and native ones, converting formats and ownership models.",
    d: "The legacy and native systems both have clipboards, with different ownership and targets. The bridge mirrors an offer from one side into the other, translating formats such as text encodings and image types, and fetches the data only when a paste happens. It must also transfer large content in chunks, answer timestamps and target queries that legacy clients expect, and avoid loops, where each side re-announces what the other just mirrored. Drag and drop is bridged similarly, with a legacy protocol for the drag state.",
    k: ["Mirroring offers lazily versus copying eagerly: lazy handles large content, but fails when the source disappears; eager survives exit but costs memory.", "Converting formats in the bridge versus leaving them to clients: converting makes common cases work, but guesses wrong for unusual types."],
    p: ["Both sides keep announcing the other's selection in a loop, and the clipboard flickers or the process spins.", "Pasting a large image from a legacy client times out because it is sent in small pieces."],
    v: "Copy text, an image and a file list from a legacy client and a native client to each other; confirm content and encodings survive and no repeated ownership events occur in the log.",
    dep: ["clipboard-and-selections", "legacy-rootless-server", "drag-and-drop"]
  },
  "legacy-scaling": {
    s: "Making legacy clients that know nothing about per-monitor scale look acceptable on dense displays, by rendering at one size and either stretching or advertising a fake scale.",
    d: "Legacy clients draw in pixels with a single global scale and no notion of different monitors. The layer can render them at a native size and let the compositor stretch the result, which is blurry but correct in size, or tell toolkits a larger scale through settings, so that they draw sharply on the primary monitor and are scaled on others. Coordinates for input and size requests must be converted between the client's pixel space and the compositor's logical space, which gets confusing with a fractional factor.",
    k: ["Stretching legacy windows versus giving them a larger scale setting: stretching works for every program but looks soft; settings give sharp text on one monitor, but mismatch on others.", "A scale factor per client versus per window: per client is simple, per window follows the monitor it is on but needs the client to re-layout often."],
    p: ["Input coordinates are off by the scale factor, so clicks land away from the pointer.", "A window moved to a second monitor of a different density keeps the wrong size."],
    v: "Run a legacy program on mixed-density monitors and confirm window size is physically consistent when moved, clicks hit the intended controls, and text is as sharp as the chosen approach allows.",
    dep: ["fractional-scaling", "legacy-rootless-server", "output-scale-policy", "viewporter"]
  },
});
