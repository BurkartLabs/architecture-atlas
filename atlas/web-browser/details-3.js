// Web browser plate, details part 3: web platform APIs, media, process model, security.
(function () {
  var D = {};
  function E(id, s, d, k, p, v, dep) { D[id] = { s: s, d: d, k: k, p: p, v: v, dep: dep }; }

  // ---- Web platform APIs ----
  E("web-idl-bindings",
    "Generated glue that exposes native implementations to script as objects, with type conversion, exceptions and wrapper lifetime.",
    "Every web API is described in an interface definition language. A code generator turns each description into bindings: wrapper objects, argument conversion and validation, exception translation, attribute accessors and constructors. Wrappers link script objects to native ones and are traced by the garbage collector. Bindings are the boundary where untrusted values first meet native code, so conversion bugs are security bugs. Generation keeps thousands of members consistent and fast.",
    ["Generate bindings from the same IDL the standards use: behavior matches specs and new APIs are cheap, but generator complexity becomes a build-time cost.",
     "Convert and validate every argument at the boundary: native code receives well-typed values, but conversions can call back into script and re-enter."],
    ["Argument conversion that runs user script can mutate objects mid-call and violate the native code's assumptions.",
     "Wrapper and native object lifetimes that disagree cause use-after-free when script holds a reference longer than the native side expects."],
    "Call an API with objects whose conversion methods mutate other arguments. The call behaves as specified and does not crash, and a wrapper kept alive by script still points at a valid native object after a collection.",
    ["garbage-collector", "dom-tree", "event-loop", "object-model-and-ics"]);

  E("fetch-api",
    "A promise-based API for network requests that applies CORS, credentials, cache and referrer policy before handing the request to the network service.",
    "A fetch call builds a request object with mode, credentials, cache and redirect policy, and passes it to the browser's resource loading, where the network service checks CORS, cookies and the HTTP cache. Responses stream as body readers with backpressure. Abort signals cancel in-flight work. Because every cross-origin request path funnels through one specification, security headers, mixed content blocking and service worker interception are applied consistently.",
    ["Funnel all requests through one specified algorithm: policy applies uniformly, but legacy request paths must be mapped onto it.",
     "Expose bodies as streams with backpressure: large downloads use bounded memory, but streaming and cloning rules complicate the API."],
    ["Treating an opaque cross-origin response as readable leaks data; its size and status must stay hidden.",
     "Not cancelling the underlying request when the abort signal fires wastes bandwidth and leaves connections tied up."],
    "Fetch a cross-origin resource without CORS headers. The call resolves opaque or rejects, the body is unreadable, and aborting a streaming fetch closes the connection and stops transfer.",
    ["resource-loader", "cors", "service-workers", "cookie-jar", "web-idl-bindings"]);

  E("web-workers",
    "Runs script on separate threads with their own event loops, communicating by message passing and shared memory where allowed.",
    "Dedicated workers serve one page, shared workers serve many same-origin pages, and worklets run constrained code inside rendering pipelines. Each has its own heap and event loop; messages are structured-cloned or transferred, and shared memory with atomics is available only to cross-origin isolated pages. Workers can fetch, use storage and run WebAssembly but cannot touch the DOM. The browser decides which process hosts them, usually the creator's renderer.",
    ["No shared DOM between threads: no data races on page state, but data must be cloned or transferred, which costs time for large objects.",
     "Offer shared memory only with isolation: real parallelism for compute, but pages must satisfy cross-origin isolation requirements."],
    ["Cloning large objects repeatedly between threads can cost more than the work moved off the main thread.",
     "Terminating a worker without releasing locks or open handles leaks resources until the document closes."],
    "Move a heavy computation to a worker and keep scrolling. The main thread frame rate stays steady, results arrive by message, and transferring a buffer leaves it detached in the sender.",
    ["event-loop", "webassembly-runtime", "cross-origin-isolation", "renderer-process", "web-idl-bindings"]);

  E("websocket-api",
    "A full-duplex message channel over a single long-lived connection, initiated by an HTTP upgrade.",
    "A socket begins as an HTTP request with an upgrade header, and after the handshake exchanges framed messages in either direction. The network service owns the connection and applies the same policies as other requests: proxy, certificate checks, cookies and mixed content blocking, while the renderer receives events. Backpressure through buffered amount, ping and pong keepalive and close codes need handling. Servers must check the origin header, since the same-origin policy does not apply to sockets.",
    ["Own sockets in the network service: policy and certificates are enforced centrally, but each message crosses a process boundary.",
     "Keep connections long-lived with keepalive: low-latency pushes, but idle connections consume server resources and can be killed by intermediaries."],
    ["Servers that skip origin validation allow any web page to talk to local or authenticated services on the user's behalf.",
     "Ignoring the buffered amount when sending lets a fast producer exhaust renderer memory."],
    "Open a socket from a cross-origin page. The origin header is sent and visible to the server, a failed certificate blocks the connection, and a producer that checks buffered amount keeps memory flat.",
    ["network-process", "tls-stack", "http1-codec", "cookie-jar", "proxy-and-pac"]);

  E("webrtc",
    "Real-time peer-to-peer audio, video and data channels with NAT traversal, congestion control and mandatory encryption.",
    "Peers exchange session descriptions through an application-defined signaling channel, discover network paths with ICE using STUN and TURN servers, secure media with DTLS and SRTP and carry arbitrary data in SCTP data channels. Capture, codec negotiation, jitter buffers, echo cancellation and bandwidth estimation run in a dedicated pipeline, often on utility threads. Exposing addresses and device access are privacy issues that need permission and mitigation.",
    ["Encrypt all media and data end to end between peers: privacy by default, but the browser cannot inspect traffic and signaling must be trusted separately.",
     "Adapt bitrate with congestion control: calls survive changing networks, but quality shifts, and estimation is tuned empirically."],
    ["Exposing local IP addresses through candidate gathering lets sites track users behind VPNs unless obfuscated.",
     "A jitter buffer tuned too low drops audio on bursty networks, too high adds noticeable delay."],
    "Open a call between two pages across a NAT with a relay. Both sides see media, throttling the link lowers resolution without dropping audio, and a page without permission cannot enumerate devices.",
    ["media-decoders", "audio-output", "permissions-model", "network-process", "tls-stack"]);

  E("canvas-2d",
    "An immediate-mode drawing API for paths, text, images and pixel manipulation onto a bitmap surface.",
    "A canvas element exposes a 2D context that records drawing commands into the same graphics library used for page painting. Commands are executed on the GPU when possible and deferred until a frame is needed or pixels are read back. Offscreen canvases move rendering into workers. Readback forces synchronization and is slow, and tainted canvases from cross-origin images must refuse to expose pixels, since pixel access would leak the image.",
    ["Batch and defer drawing commands: GPU execution is efficient, but pixel readback forces a stall and a copy.",
     "Taint canvases that touch cross-origin data: pixel reads are denied, protecting data, but sites must request CORS images to read them."],
    ["Calling getImageData every frame forces readbacks and drops frame rate.",
     "Reading pixels from a canvas drawn with a cross-origin image exfiltrates data if tainting is skipped."],
    "Draw a cross-origin image without CORS and call getImageData. It throws a security error. Drawing a same-origin image works, and an animation drawing 10,000 paths holds frame rate without readbacks.",
    ["paint", "rasterization", "web-workers", "same-origin-policy", "gpu-process"]);

  E("gpu-graphics-apis",
    "Low-level 3D and compute APIs for pages, translated safely to the platform's graphics API through the GPU process.",
    "Pages record commands against a context in the renderer; a command buffer carries them to the GPU process, where a validator checks every call, a translation layer converts them to the native API and shader code is parsed, validated and rewritten for the driver. The GPU process is sandboxed, though it talks to drivers. Newer APIs expose explicit resources, pipelines and compute. Driver differences and resource limits make validation and fallback paths necessary.",
    ["Validate everything in the GPU process before touching the driver: untrusted commands cannot reach privileged code unchecked, but validation costs CPU and complexity.",
     "Translate shaders to a safe intermediate language and back: portable behavior across drivers, but compile times and rewriting bugs affect users."],
    ["Drivers crash or hang on unusual commands; without a watchdog and context loss handling the whole page goes blank.",
     "Out-of-bounds buffer access without clamping leaks other processes' GPU memory."],
    "Run a conformance suite with out-of-range indices and invalid state. All calls produce defined errors, a forced GPU process crash triggers context loss and the page recreates its context.",
    ["gpu-process", "graphics-backend", "web-idl-bindings", "os-sandbox", "ipc-channel"]);

  E("device-apis",
    "Gated access to sensors, location, cameras, microphones, Bluetooth, USB and similar hardware, always behind permission prompts.",
    "Device APIs expose hardware to pages through promises and events. Each is defined by origin, secure-context and user-gesture requirements, a permission prompt and a long-lived indicator, such as a recording icon, while in use. The browser process mediates access, often via a utility process that talks to the operating system or driver. Policy features and frame permissions control embedding. Abuse prevention, such as fingerprinting and surveillance, shapes every design decision.",
    ["Require secure context, user gesture and a prompt: users know what is accessed, but prompts become fatigue and each API needs consistent patterns.",
     "Mediate hardware through a privileged process with a persistent indicator: renderers never hold device handles, but the indicator must be unspoofable."],
    ["Allowing cross-origin frames to inherit a permission lets third-party content use the camera granted to the embedding site.",
     "Sensor APIs at high frequency enable keystroke inference and fingerprinting."],
    "Request camera access from a cross-origin frame without delegation. It is denied, a granted request shows a persistent indicator, and revoking the permission stops capture immediately.",
    ["permissions-model", "browser-process", "utility-processes", "security-indicators"]);

  E("notifications-and-push",
    "Lets sites show system notifications and receive messages while closed, via a service worker woken by a push service.",
    "A page asks permission to show notifications, and a service worker can subscribe to a push endpoint managed by the browser vendor's push service or the platform. Servers send encrypted messages to the endpoint; the browser wakes the worker, which must show a notification. The browser coordinates delivery, quotas and the operating system's notification center. The design is constrained by abuse: spam and silent tracking push, so rules require visible notifications and allow users to block sites easily.",
    ["Wake a service worker for each message and require a visible notification: users see all activity, but sites cannot do silent background work.",
     "Encrypt payloads to the subscription key: the push service cannot read them, but servers must implement the encryption."],
    ["Prompting for permission on page load without user context trains users to block or accept blindly.",
     "Stale subscriptions after a profile clear or reinstall keep the server sending to nowhere."],
    "Subscribe, close the page and send a push. The worker wakes, a notification appears, clicking opens the page. Revoking permission stops delivery and a push without a notification triggers the penalty rule.",
    ["service-workers", "permissions-model", "tls-stack", "native-windowing"]);

  E("shadow-dom-components",
    "Encapsulated subtrees with scoped styles and custom elements that let pages define their own reusable widgets.",
    "A shadow root attaches a separate tree to an element, with style scoping and event retargeting. Custom elements register tag names with lifecycle callbacks, and slots project light DOM children into the shadow tree. The engine handles flattened tree traversal for style, layout, focus and accessibility. Open and closed modes control script access. The complexity is in all the features that must understand the composed tree, from selection to find to accessibility.",
    ["Scope styles by shadow boundary: widgets do not leak or receive CSS accidentally, but theming needs explicit hooks like custom properties and parts.",
     "Retarget events at shadow boundaries: internals stay hidden, but event paths and composed events must be understood by all consumers."],
    ["Features that walk the DOM and ignore the flat tree, like find or focus order, skip or double-visit shadow content.",
     "Custom element upgrade timing creates elements in half-initialized states when scripts load late."],
    "Create a component with slotted content and scoped styles. Page CSS does not affect internals, a click inside reports the host as target outside, and Tab and find handle the slotted text.",
    ["dom-tree", "css-and-style", "keyboard-navigation", "accessibility-tree", "find-in-page"]);

  // ---- Media ----
  E("media-demuxers",
    "Parse container formats and split a stream into timestamped audio, video and text packets.",
    "A demuxer reads a container such as an MP4 or WebM file or segment, extracts packets with timestamps, codec parameters and keyframe flags, and handles seeking via index tables or byte ranges. It works incrementally on data from the network and must tolerate truncated or malformed files. Because container parsing is complex and exposed to untrusted data, it is a common target for fuzzing and often runs in a sandboxed utility process.",
    ["Parse incrementally from byte streams: playback starts before download finishes, but seeking needs indexes that may be at the end of the file.",
     "Run demuxing in a sandboxed process: malformed files cannot compromise the renderer, but packets cross a process boundary."],
    ["Trusting sizes and offsets from the file leads to out-of-bounds reads or huge allocations from a crafted header.",
     "Timestamp discontinuities across segments cause audio and video to drift or stall."],
    "Open truncated and fuzzed container files. The demuxer reports an error without crashing, and a well-formed file with the index at the end still seeks accurately using range requests.",
    ["media-decoders", "playback-pipeline", "utility-processes", "resource-loader"]);

  E("media-decoders",
    "Convert compressed audio and video packets into raw frames and samples, using hardware decoders when possible.",
    "Decoders implement codecs in software or use platform hardware decoders reached through the GPU process. They manage reference frames, reordering and output formats, and report resolution and format changes. Hardware decoding saves power but may be limited in formats, concurrent streams and robustness. A software fallback ensures playback. Decoded frames are kept as GPU textures to avoid copying. Decoders face untrusted data, so they sit in sandboxed processes.",
    ["Prefer hardware decoders with a software fallback: low power and CPU, but hardware limits and driver bugs need detection and graceful fallback.",
     "Keep decoded video on the GPU: no copies per frame, but frame access for scripts or capture requires explicit readback."],
    ["Driver decoder crashes or hangs freeze playback unless the pipeline detects them and switches to software decode.",
     "Memory for frame buffers multiplies with high resolution and many decoded streams."],
    "Play a high-bitrate stream with hardware decode on, then disable the decoder in a test. Playback continues in software, CPU rises and frames remain in sync with audio.",
    ["media-demuxers", "playback-pipeline", "gpu-process", "utility-processes", "drm-module"]);

  E("playback-pipeline",
    "Coordinates demux, decode, render and clock so audio and video stay in sync, buffering enough to ride out network jitter.",
    "The pipeline connects demuxer, decoders and renderers. The audio device usually acts as the master clock; video frames are presented when their timestamps match it, dropping or repeating frames to stay aligned. Buffer thresholds determine when to start, stall or resume. Seeking flushes and re-primes the pipeline from a keyframe. State transitions, errors and track switches are asynchronous, so the state machine must handle races. The element's API reports these states to script.",
    ["Use the audio clock as master: sound never glitches, but video must adapt by dropping or duplicating frames.",
     "Buffer ahead by a few seconds: playback survives network hiccups, but memory use and startup delay grow."],
    ["Seeking during a stall can leave audio and video resuming from different positions.",
     "Presenting frames based on wall time rather than the audio clock lets lip sync drift over long playback."],
    "Play a long video, throttle the network, seek twice quickly. Playback stalls and recovers without drift, audio never cuts out and video stays within a frame or two of audio.",
    ["media-demuxers", "media-decoders", "audio-output", "frame-scheduler", "compositing"]);

  E("media-source-extensions",
    "Lets a page feed media segments into a player from script, enabling adaptive streaming, ad insertion and custom buffering.",
    "A page creates a media source, adds source buffers per track and appends segments it fetched. The browser demuxes and decodes them as if from a file, managing buffered ranges and eviction under memory limits. Adaptive streaming players measure throughput and switch quality by choosing which segments to append. Codec compatibility, timestamp offsets and quota exceeded errors are common failure modes. Encrypted segments connect to the DRM module.",
    ["Move quality adaptation into page script: services can tune algorithms, but each site reimplements buffering and error handling.",
     "Evict buffered ranges when memory is short: playback proceeds on constrained devices, but players must handle missing data and rebuffer."],
    ["Appending segments with overlapping or inconsistent timestamps leaves gaps that stall playback.",
     "Not handling quota errors by evicting played data causes playback to stop after a while."],
    "Stream adaptive segments while throttling bandwidth. The player drops to a lower quality without stalling, an out-of-quota append triggers eviction, and seeking into a missing range triggers fetch.",
    ["media-demuxers", "playback-pipeline", "drm-module", "fetch-api"]);

  E("drm-module",
    "Decrypts protected media inside a separately sandboxed module and renders it without exposing clear content to page code.",
    "Encrypted Media Extensions let a page exchange license messages with a license server through a key system. The decryption module runs in its own sandboxed process, receives keys, and decrypts samples, in software or in hardware-protected paths, passing frames to the renderer without exposing them to script. Robustness levels control hardware requirements, and persistent licenses need storage. The browser mediates but does not see keys or clear content.",
    ["Isolate the decryption module in its own sandbox: content owners get stronger guarantees, but it is closed code and platform-specific.",
     "Tie output protection to the license policy: higher resolutions require hardware paths, at the cost of unavailable playback on some devices."],
    ["Letting the page read decrypted frames defeats the content protection and breaks license terms.",
     "Persistent license storage that is not partitioned by origin lets sites link users."],
    "Play protected content, then try to capture the video element's frames with script. Playback works, capture returns black or is blocked, and a license request is visible to the page only as opaque messages.",
    ["media-decoders", "media-source-extensions", "os-sandbox", "utility-processes", "storage-partitioning"]);

  E("audio-output",
    "Mixes streams from all pages into the device's audio service with low latency, volume control and routing.",
    "Renderers produce audio through an audio service in a utility process that owns the device, mixes streams, applies volume, resamples, and handles device changes. Output runs on a real-time thread with strict deadlines, so no locks or allocation. Latency modes trade glitch risk for responsiveness. The same service supports capture, echo cancellation and per-tab muting, and signals the UI which tab is playing audio, which also feeds tab discarding decisions.",
    ["Own the audio device in one service: mixing and policy are central and consistent, but a hang there silences every tab.",
     "Offer latency modes: interactive apps get low latency, but smaller buffers raise glitch risk on busy systems."],
    ["Doing allocation, locks or logging on the real-time thread causes dropouts under load.",
     "Not handling device removal or sample rate changes leaves playback silent after plugging in headphones."],
    "Play audio in two tabs and mute one. Mixing works and the indicator shows correctly. Unplug headphones mid-playback: audio moves to speakers without restarting the tab.",
    ["playback-pipeline", "task-scheduler", "platform-abstraction", "page-lifecycle", "utility-processes"]);

  // ---- Process model & IPC ----
  E("browser-process",
    "The single privileged process that owns the UI, profile, permissions and policy, and coordinates every other process.",
    "The browser process runs the UI thread, the navigation controller, tab and window model, profile services, permission and download management, and launches and supervises child processes. It is trusted: everything else is treated as potentially compromised. It must stay responsive, so file and network work moves to background sequences and it never waits synchronously on a renderer. It is the single place to enforce policy for requests from sandboxed code.",
    ["Concentrate privilege in one process: policy has one enforcement point, but a bug here is the most serious kind and must be kept small.",
     "Never block the UI thread on child processes: the browser stays usable if pages hang, but every interaction becomes an asynchronous protocol."],
    ["Trusting any value sent by a renderer, such as an origin or file path, lets a compromised renderer act with browser privileges.",
     "Adding blocking disk or network calls on the UI thread causes the whole browser to freeze."],
    "Kill or hang a renderer. The browser UI stays responsive, other tabs run, and a message from the renderer claiming a different origin is rejected by browser-side validation.",
    ["renderer-process", "ipc-channel", "tab-and-window-manager", "task-scheduler", "permissions-model"]);

  E("renderer-process",
    "A sandboxed process that parses, styles, lays out and runs script for pages, with no direct access to the system.",
    "A renderer hosts one or more frames for a site, with its own main thread (DOM, script, style, layout), compositor thread, worker threads and a script heap. It has no file, network or device access; to do anything it sends requests to the browser or service processes. Because it parses untrusted content with complex code, it is expected to be compromised eventually, so its privilege is minimal. Crashes affect only the pages it hosts.",
    ["Remove all ambient privilege: a compromised renderer yields little, but each capability must be a mediated request with latency and an interface.",
     "Run several frames and tabs of one site per process: less memory, but one slow page can affect others sharing the main thread."],
    ["Giving the renderer a direct handle to files or sockets for convenience undermines the sandbox.",
     "Memory-heavy tabs sharing a process pressure and kill the others on out-of-memory."],
    "Attempt a file open and a socket connect from inside a renderer in a test harness. Both fail at the OS level, and a crash in a renderer shows a sad-tab page without affecting other sites.",
    ["os-sandbox", "ipc-channel", "browser-process", "event-loop", "frame-tree"]);

  E("gpu-process",
    "A process that owns the graphics driver, executing command buffers from renderers and composing the final frames on screen.",
    "The GPU process loads graphics drivers, which are large and historically buggy, so they are kept out of renderers and the browser. It receives command buffers from renderers for canvas, 3D and raster work, runs the display compositor to aggregate surfaces, decodes video with hardware, and presents to the window. A watchdog detects hangs, and a crash triggers context loss and restart. Sandbox is tighter than the browser but looser than renderers because it must talk to drivers.",
    ["Isolate drivers in their own process: driver crashes do not take the browser down, but every graphics call crosses a boundary.",
     "Share one GPU process among all renderers: memory and driver context are shared, but a malicious or buggy client can affect everyone's rendering."],
    ["Without a hang watchdog, a stuck driver call freezes every tab's display.",
     "After a GPU process crash, contexts that are not restored leave blank canvases and video."],
    "Kill the GPU process while several tabs animate. The screen recovers after a brief flash, 3D contexts report context loss and restore, and the browser itself keeps running.",
    ["graphics-backend", "ipc-channel", "compositing", "os-sandbox", "rasterization"]);

  E("network-process",
    "A service process that owns sockets, the cache and cookies, making all network requests on behalf of other processes.",
    "The network service runs the HTTP stack, DNS, TLS, cache and cookie store, and exposes request interfaces to renderers and the browser through factories bound to a specific origin and policy. It is isolated from renderers and sandboxed. Running out of process contains parsing bugs in protocol code and lets the browser restart it after a crash. A request is allowed only through a factory configured with the caller's identity, so a renderer cannot forge another site's requests.",
    ["Run networking out of process: protocol parser bugs are contained and the service can be restarted, but data crosses a boundary and shared memory is needed for speed.",
     "Bind request factories to a caller identity: the service can enforce cookie and CORS rules, but identity propagation must be right on every path."],
    ["A factory created with the wrong origin or too-permissive options lets a renderer read data from other sites.",
     "A crash of the network service that is not handled leaves every in-flight request hanging."],
    "Kill the network process during a download and page load. Requests fail or retry, the service restarts, and a renderer asking for a different site's cookies through its factory gets none.",
    ["resource-loader", "ipc-channel", "os-sandbox", "cookie-jar", "cors"]);

  E("utility-processes",
    "Short-lived or on-demand sandboxed processes for risky or heavy work: decoding, parsing, printing, audio and device access.",
    "Rather than do risky work in the privileged process, the browser launches a utility process per service with a tailored sandbox: media demuxing, archive and file parsing, PDF rendering, printing, audio, device access, proxy script evaluation. Each exposes a narrow interface over IPC. Crashes are contained and restartable. The design principle is to move any code that parses untrusted data out of the browser process, at a cost in memory and startup time.",
    ["One process per risky service with a tailored sandbox: tight privileges and contained crashes, but extra processes cost memory and startup latency.",
     "Keep interfaces narrow and typed: less attack surface on the privileged side, but each new feature needs a new interface."],
    ["Launching a utility process with the default broad sandbox when it needs only one capability weakens containment.",
     "Process startup cost on a hot path, such as per-file parsing, makes the feature slow."],
    "Import a malformed bookmarks file. The parsing process crashes or fails with an error, the browser continues, and the process's sandbox policy allows only the files and calls the task needs.",
    ["ipc-channel", "os-sandbox", "browser-process"]);

  E("site-isolation",
    "Ensures documents from different sites never share a process, so a renderer compromise cannot read another site's data.",
    "Each process is restricted to content from one site (scheme plus registrable domain), enforced by the browser: it only grants a process the data, cookies and storage of its site and refuses requests that claim otherwise. Cross-site iframes become out-of-process frames. Responses that must not enter the wrong process, such as sensitive documents, are blocked from loading into it. This defends against both renderer exploits and speculative-execution side channels, at a cost in memory and complexity.",
    ["Process per site rather than per tab: contains cross-site attacks and CPU side channels, but costs memory and needs out-of-process iframes.",
     "Block sensitive cross-site responses before they reach the renderer: data never enters memory to be leaked, but content type detection must be accurate."],
    ["Allowing a renderer to claim any origin when requesting cookies or storage nullifies the whole model; the browser must verify.",
     "Features written assuming same-process frames, such as synchronous frame access, break when frames move out of process."],
    "Load a cross-site iframe and check the task manager: it runs in a separate renderer process. Reading its memory or document from the parent fails, and the browser rejects its cookie requests for other sites.",
    ["frame-tree", "process-allocation", "renderer-process", "same-origin-policy", "cross-origin-isolation"]);

  E("process-allocation",
    "Chooses which process hosts each frame or tab, balancing isolation against memory limits.",
    "The policy decides, for each navigation or new frame, whether to reuse an existing process or start one: by site, by browsing context group and by a process count limit. On constrained devices it reuses processes beyond the limit, with exceptions for sensitive sites that always get dedicated processes. Prelaunching a spare process speeds up the next navigation. Policy must respect isolation promises while avoiding runaway process counts.",
    ["Limit process count and share beyond it: memory stays bounded, but unrelated sites may share a process and lose isolation benefits.",
     "Keep a warm spare process: new navigation starts faster, but costs memory when idle."],
    ["Sharing processes between a logged-in sensitive site and arbitrary web content weakens isolation precisely where it matters.",
     "Letting process count grow with tabs exhausts memory on small devices."],
    "Open hundreds of tabs on a memory-limited setup. The process count caps at the limit, sensitive sites keep dedicated processes, and a new tab navigation uses the prelaunched spare.",
    ["site-isolation", "renderer-process", "memory-pressure", "navigation-controller"]);

  E("ipc-channel",
    "Typed message pipes and interfaces between processes, with capabilities passed as handles and every message treated as untrusted.",
    "Processes communicate through message pipes carried by operating system channels. Interfaces are defined in an IDL that generates typed proxies and stubs; handles to other interfaces, shared memory and files can be sent in messages, which makes access capability-based. Receivers validate every field since the sender may be compromised. Messages are asynchronous with optional ordering guarantees; synchronous calls are avoided or banned because they cause deadlocks and hang propagation.",
    ["Use typed, capability-passing interfaces: access follows handles so least privilege is natural, but the ownership of every interface must be designed.",
     "Prefer asynchronous messages: no cross-process deadlocks or hang propagation, but code is written as state machines and callbacks."],
    ["Trusting message contents from a renderer without validation turns each interface into a privilege escalation.",
     "Synchronous calls between processes can deadlock or freeze the UI when the peer hangs."],
    "Send a malformed or out-of-range message from a test renderer to each browser-side interface. Each is rejected, the renderer is terminated as misbehaving, and the browser keeps running.",
    ["task-scheduler", "platform-abstraction", "browser-process"]);

  // ---- Security & sandboxing ----
  E("same-origin-policy",
    "The core rule that scripts from one origin cannot read data from another, defined by scheme, host and port.",
    "An origin is a scheme, host and port tuple. Documents can freely embed or send requests to other origins, but cannot read responses, DOM or storage across origins unless the target opts in via CORS, postMessage or document domain relaxations. The policy is enforced at many points: DOM access, network responses, storage keys, canvas tainting, and in modern browsers by process separation. Every web API that touches cross-origin data defines how it interacts with it.",
    ["Allow cross-origin embedding and writes but block reads: the web's linking model survives, but side channels such as timing remain and need extra defenses.",
     "Enforce by process boundary as well as by checks: bugs in a check do not leak data, but this requires site isolation."],
    ["Treating each new API as exempt from the origin model creates a new cross-origin leak.",
     "Opaque responses that still expose size or timing leak information about cross-origin content."],
    "From one origin, try reading another origin's iframe, storage and fetch response. All fail, while embedding the image and submitting a form to it still work.",
    ["site-isolation", "cors", "cross-origin-isolation", "url-and-scheme-handling"]);

  E("cors",
    "A header-based protocol letting a server opt in to cross-origin reads, with preflight checks for non-simple requests.",
    "For cross-origin requests, the browser attaches an Origin header and checks the response's access-control headers before exposing it to script. Non-simple requests send a preflight OPTIONS first, whose result is cached. Credentials require explicit opt-in and no wildcard. The check happens in the network service so a renderer cannot skip it. Preflight can be bypassed by simple requests, so servers must still protect state-changing endpoints, and misconfigured wildcard or reflected origins are common vulnerabilities.",
    ["Preflight non-simple requests: servers can refuse before any side effect, but each preflight adds a round trip unless cached.",
     "Require explicit origin for credentialed requests: wildcard cannot expose authenticated data, but servers must manage allowed origin lists."],
    ["Servers that reflect any Origin header with credentials allowed expose logged-in data to every site.",
     "Assuming CORS protects the server from cross-site requests; it only controls what the page can read."],
    "Send a fetch with a custom header to a server that lacks CORS headers. The preflight fails, the actual request is never sent, and a response with matching headers is readable.",
    ["network-process", "same-origin-policy", "fetch-api", "http-cache"]);

  E("content-security-policy",
    "A response header restricting which sources scripts, styles, frames and connections may use, limiting the damage from injected content.",
    "A page's CSP lists allowed sources per resource type, with nonces or hashes for inline code. The browser checks every load and script execution against the policy in the renderer and navigation, reporting violations to an endpoint. Related mechanisms include trusted types, sandboxing frames and frame-ancestors for clickjacking defense. Strict policies are hard to adopt on sites with inline script and third-party widgets, so report-only mode allows testing before enforcement.",
    ["Use nonce or hash-based allowlists: injected script is blocked, but every legitimate inline script needs a per-response nonce.",
     "Deploy in report-only mode first: broken pages are found without outages, but attackers are not stopped during the trial period."],
    ["Allowing unsafe-inline or broad wildcard hosts gives the appearance of a policy without blocking injection.",
     "Policies that are applied on the main page but not on workers or frames leave gaps."],
    "Serve a page with a strict nonce policy and inject a script element without the nonce. It does not run, a violation report is sent, and the nonce-bearing script still executes.",
    ["navigation-throttles", "dom-tree", "web-workers", "frame-tree"]);

  E("permissions-model",
    "Decides which origins may use powerful features, prompting the user, remembering choices and delegating to frames.",
    "Powerful features such as location, camera, notifications or clipboard are gated by a permission state per origin and feature: ask, granted or denied. The browser process shows prompts, stores decisions, enforces policy overrides and applies frame delegation through permissions policy. Quiet UI and auto-revocation reduce abuse. Requests need a secure context and often a user gesture. Prompt design matters as much as storage, because users often accept without reading.",
    ["Prompt in context on user gesture: informed choices, but each prompt is a distraction and abuse can still train users to accept.",
     "Revoke permissions of unused sites automatically: reduces standing exposure, but surprises sites that expect permission to persist."],
    ["Letting an embedded frame prompt as the top-level origin confuses users about who is asking.",
     "Persisting permissions across profile clears or private sessions leaks the user's identity."],
    "Request location from the page, then from a cross-origin iframe. The first prompts with the correct origin, the second is denied unless delegated, and reset-site-settings returns both to ask.",
    ["browser-process", "profile-data-store", "device-apis", "security-indicators", "settings-and-policies"]);

  E("safe-browsing",
    "Checks URLs and downloads against reputation data to warn about phishing, malware and unwanted software.",
    "The browser keeps a local, regularly updated list of hashed URL prefixes for known bad sites. A prefix match triggers a full-hash lookup, designed so the service learns little about the user's browsing. Navigations and downloads are checked before commit or save, with real-time lookups and file analysis as options. Hits show a full-page warning. False positives hurt sites and misses hurt users, so freshness and the privacy of lookups drive the design.",
    ["Match local hash prefixes before asking the server: most lookups stay private and fast, but the list must update frequently and uses storage.",
     "Check before commit with a time budget: users are protected on the first visit, but each check can delay navigation."],
    ["A stale local list misses newly created phishing sites that live for hours.",
     "Sending full URLs to the service for every navigation exposes browsing history."],
    "Visit a test URL on the known-bad list. A warning interstitial replaces the page before any content renders, the lookup carries only a hash prefix, and proceeding is possible only by explicit user action.",
    ["navigation-throttles", "download-manager", "network-process", "security-indicators"]);

  E("certificate-validation",
    "Verifies a server's certificate chain, name, revocation state and transparency before a secure connection is trusted.",
    "During the TLS handshake the browser builds a chain from the server certificate to a trusted root, checks validity periods, name match, key usage and constraints, and consults revocation data and certificate transparency logs. Trust roots come from the platform or a browser-managed store. Failures lead to an interstitial that blocks by default; pinned or HSTS hosts cannot be bypassed. Verification runs in the network service, while enterprise roots and local interception complicate trust.",
    ["Build trust from a curated root store with transparency requirements: misissued certificates are discoverable, but logs and policies need constant maintenance.",
     "Make errors hard to bypass on sites with HSTS: users cannot be tricked into accepting forged certificates, but misconfigured servers are fully broken."],
    ["Skipping hostname verification, or matching on the wrong field, accepts a valid certificate for the wrong site.",
     "Revocation checks that fail open when the responder is unreachable give attackers an easy bypass."],
    "Connect to test hosts with expired, wrong-name and untrusted-root certificates. Each shows a blocking interstitial, an HSTS host offers no bypass, and a valid chain loads with a secure indicator.",
    ["tls-stack", "network-process", "security-indicators", "platform-abstraction"]);

  E("os-sandbox",
    "Operating system mechanisms that strip a process of file, network and system access after startup, containing a compromise.",
    "Each child process starts with minimal privileges: restricted tokens, namespaces, system call filters or capability profiles depending on the platform. Renderers lose access to files, sockets and most system calls; other processes get exactly what their job needs. Required resources are opened before the sandbox is engaged or requested through brokers. Defense in depth means an attacker needs a renderer exploit and a sandbox escape. Maintaining per-platform policies and allowed call lists is continuous work.",
    ["Engage the sandbox after initialization and route privileged needs through brokers: strong containment, but every legitimate need becomes a broker interface.",
     "Use a distinct policy per process type: least privilege, but policy drift and bugs multiply across platforms."],
    ["A new feature quietly adds an allowed system call or file path to the renderer policy, widening escape routes.",
     "Starting work before the sandbox is applied leaves handles open that an attacker can reuse."],
    "From within a renderer test harness, attempt to open a file, create a socket and spawn a process. All are denied by the OS, while the same operations succeed when requested through the browser broker.",
    ["renderer-process", "utility-processes", "browser-process", "platform-abstraction", "ipc-channel"]);

  E("cross-origin-isolation",
    "Header-based opt-in that isolates a page from cross-origin windows and resources, enabling powerful features safely.",
    "A page can send headers that sever its relationship with cross-origin windows (opener policy) and require every subresource to explicitly opt in to being embedded (embedder policy). Together they put the page in its own process group and make side-channel attacks across origins infeasible, which unlocks features such as shared memory and high-resolution timers. Third-party resources must send compatible headers or be blocked, so adoption is a coordination problem.",
    ["Require every embedded resource to opt in: side channels are closed, but third-party content without headers breaks the page.",
     "Sever the window reference to cross-origin popups: isolation holds, but payment and login popups that relied on opener communication need alternatives."],
    ["Enabling embedder restrictions without auditing third-party scripts, images and frames blocks parts of the page silently.",
     "Granting high-resolution timers or shared memory without isolation reopens speculative-execution attacks."],
    "Serve a page with both isolation headers and embed a cross-origin image without opt-in. The image is blocked, shared memory becomes available, and the cross-origin opener reference is null.",
    ["site-isolation", "same-origin-policy", "web-workers", "webassembly-runtime"]);

  E("security-indicators",
    "The browser UI that tells users what origin they are on, whether the connection is secure, and when to be warned.",
    "Indicators show connection state, the origin or its simplified form and warnings for broken certificates, insecure forms and dangerous sites. Interstitials are full-page warnings drawn by the browser, with friction before proceeding. Permission and capture indicators show active camera or location use. Indicators must be unspoofable by page content: pages cannot draw over browser chrome, fullscreen shows overlays, and popups are positioned so they cannot imitate the address bar.",
    ["Reserve a chrome area pages can never draw into: indicators can be trusted, but fullscreen and kiosk features need transient overlays.",
     "Warn only when it matters and make the safe choice the easy one: warnings keep meaning, but a missing indicator on safe pages can be misread as danger."],
    ["Letting a page style a window, popup or fullscreen view that mimics browser chrome enables convincing spoofing.",
     "Showing a positive lock for ordinary HTTPS trains users to trust it as proof of legitimacy."],
    "Open a page in fullscreen that draws a fake address bar. The real overlay with the true origin appears, exiting is available by key, and a popup cannot position itself over the real chrome.",
    ["browser-ui-toolkit", "certificate-validation", "safe-browsing", "permissions-model", "omnibox"]);

  ATLAS.details("web-browser", D);
})();
