// Details for the notebook plate, part 5: remote compute, security, cross-cutting concerns.
ATLAS.details("notebook", {
  "remote-kernel-gateway": {
    s: "A service that launches and proxies kernels on other machines, so the editor server stays small while kernels run where the data and hardware are.",
    d: "The gateway exposes the same HTTP and socket interface a local server would, but forwards each kernel start to a launcher on a remote host or cluster and relays channel traffic. The editor server then needs no kernel specifications of its own. Connection information must be rewritten so ports are reachable across the network, and signing keys must be shared securely. Network latency adds to every interaction, and the extra hop is a new place for connections to be dropped.",
    k: ["Gateway in front of remote kernels vs running the whole server remotely: a gateway keeps the editor local and puts compute elsewhere, but adds a hop and a second service to secure; a remote server is simple and keeps files and editing remote too.", "Relaying all channel traffic vs direct connections from the browser: relaying hides the network layout and bottlenecks on the gateway; direct is faster and exposes kernel ports."],
    p: ["Kernel ports not reachable from the gateway leave the kernel running but unusable, with a timeout as the only symptom.", "The gateway holds long-lived connections for every kernel and exhausts its connection limit during peak use."],
    v: "Point an editor at a gateway, start a kernel, run a cell that prints the host name, and confirm it reports the remote host while outputs return to the page and the local machine runs no kernel process.",
    dep: ["kernel-manager", "websocket-gateway", "kernel-provisioners"]
  },
  "kernel-provisioners": {
    s: "Pluggable launchers that decide where and how a kernel process starts: a local process, a container, a batch job or a cluster pod, and how it is tracked and stopped.",
    d: "A provisioner implements launch, poll, send-signal, kill and cleanup for one platform. The kernel manager calls it instead of spawning a process directly. A cluster provisioner submits a job, waits for the scheduler to place it, discovers the address, and polls its state. Queueing means a kernel may take seconds or minutes to start, and the front end must show that. Failure modes multiply: pending forever, preempted, node lost, image pull failing, each needing a distinct message.",
    k: ["Provisioner abstraction vs launch code in the manager: an abstraction lets one server drive many platforms, but its interface must fit the weakest one; embedded launch is simple and ties the server to one platform.", "Waiting synchronously for placement vs returning immediately with a pending state: waiting is simple and blocks and times out; pending states need UI and state tracking."],
    p: ["A pod stuck pending because of unavailable resources looks to users like a kernel that will not start.", "A preempted node kills the kernel and the server keeps showing it as running until the next poll."],
    v: "Launch kernels through a provisioner on a cluster, kill one's node, and confirm the server reports the loss within the poll interval and that the others keep running.",
    dep: ["kernel-manager", "kernelspec-discovery", "resource-limits"]
  },
  "resource-limits": {
    s: "Quotas on memory, processor time, accelerators, disk and run time for a kernel or user, enforced by the platform, so one notebook cannot take a shared machine down.",
    d: "Limits are set per user, per kernel specification or per profile, and enforced by the operating system or the container runtime. Memory limits kill processes that exceed them, which the notebook user sees as a dead kernel. Time limits stop idle or runaway sessions. Accelerators are allocated whole or in slices. Setting limits is a balance: too tight and legitimate work dies, too loose and neighbors suffer. Users need visibility of their own usage to stay inside the limits.",
    k: ["Hard limits that kill vs soft limits that warn: hard limits protect others and destroy state without warning; soft limits are friendly and can be ignored until the machine fails.", "Per-user quotas vs per-kernel quotas: per-user quotas cap the total and let the user divide it; per-kernel quotas are simple and waste capacity when users run one."],
    p: ["A memory limit kills the kernel mid-computation with no message, and the user assumes a bug in their code.", "Accelerators held by idle kernels block other users who are waiting for a slot."],
    v: "Allocate memory beyond the configured limit in a cell and confirm the platform terminates the kernel, the page reports a resource kill instead of a generic failure, and neighbors' kernels are unaffected.",
    dep: ["kernel-process"]
  },
  "data-access-mounts": {
    s: "How a remote kernel reaches data and files: mounted shared storage, object storage clients, database connections and per-user home directories.",
    d: "Kernels on shared hardware need the same files as the editor, so storage is mounted into both or accessed over the network. Large datasets stay near compute; copying them into each user's directory is slow and expensive. Credentials for databases and storage are injected by the platform instead of typed into cells. Latency and consistency of network file systems affect saving and loading. Paths valid in one environment break in another, so portable notebooks use configured locations, not absolute paths.",
    k: ["Mounting storage into the kernel vs fetching through a client library: mounts look like local files and hide network costs; clients are explicit and need code changes and credentials.", "Per-user home storage vs shared project storage: home storage is private and duplicates data; project storage shares data and needs permission rules."],
    p: ["A notebook with an absolute path to one user's directory fails for every other user.", "Network file system latency makes saving a large notebook freeze the editor."],
    v: "Run a cell reading a dataset from the configured location in two environments and confirm identical contents, and that a user without access to the location gets a permission error instead of silent empty data.",
    dep: ["kernel-provisioners", "secrets-handling", "contents-manager"]
  },
  "memory-pressure-kernel-death": {
    s: "What happens when a kernel runs out of memory: the operating system or platform kills it, the page loses all state, and users must tell this apart from an ordinary error.",
    d: "Data analysis loads large objects and keeps references in variables, history and outputs, so memory grows over a session. At the limit the process is killed without a chance to report. The server sees the process exit or a missed heartbeat and marks the kernel dead; the front end offers a restart. Detecting the cause needs the exit status or platform events. Mitigations include showing memory use, freeing references, limiting output retention and restarting stale kernels on a schedule.",
    k: ["Detecting kills from exit status vs inferring from missed heartbeats: exit status is precise and platform specific; inference is portable and cannot name the cause.", "Retaining all outputs and history in the kernel vs bounding them: retention supports recall of previous results, and memory use grows without limit."],
    p: ["Users see 'kernel died' and retry the same cell, repeating the crash instead of reducing the data.", "Output history keeps references to every previous result, so deleting variables frees nothing."],
    v: "Allocate memory until the limit is hit, and confirm the kernel is reported dead with a memory reason, the editor remains usable, and a restart gives a fresh kernel with memory back to baseline.",
    dep: ["resource-limits", "kernel-manager", "variable-inspector"]
  },
  "session-reconnection": {
    s: "Reattaching a browser to a kernel that kept running while the page was closed or the network dropped, and recovering the outputs that arrived in the meantime.",
    d: "The kernel keeps executing without a client; its broadcasts go nowhere. When a browser returns, it finds the session by notebook path and reconnects. Outputs produced while disconnected are lost unless the server buffered them or the document model was updated server-side. Long runs therefore either need a server that records outputs into the file as they arrive, or a design that writes results to storage. Without that, a closed laptop at the wrong moment leaves a finished cell with blank output.",
    k: ["Server-side output recording vs front-end-only recording: server recording survives page closes and makes the server the owner of outputs; front-end recording is simple and loses everything while no page is open.", "Replaying buffered messages vs showing a gap marker: replay restores the view and needs buffer limits; a marker is honest and leaves the user to rerun."],
    p: ["A cell finishes while the browser is asleep and shows no output when the page returns, though the kernel's variables hold the result.", "Reconnecting to a kernel that has since been culled shows the old notebook state with no warning."],
    v: "Start a ten-minute cell, close the tab, reopen after it has finished, and confirm the outputs are present in the notebook or the page states that output was missed.",
    dep: ["session-manager", "websocket-gateway", "autosave-checkpoints"]
  },
  "trust-model": {
    s: "The rule for which notebook content may run code or active output: notebooks are untrusted until a user explicitly trusts them, and trust is tied to the content that was reviewed.",
    d: "A notebook can contain executable output such as scripts in HTML, which would run when the file is merely opened. To prevent that, the editor treats unknown notebooks as untrusted and sanitizes active output. Trust is granted by an action, such as executing a cell or an explicit command, which records a signature of the content. Executing a cell yourself implies you wrote or reviewed it; trust covers saved outputs only, and never means that the code in cells is safe to run.",
    k: ["Untrusted by default with explicit opt-in vs trusted by default: default untrusted protects against file-borne attacks and surprises users whose charts lose interaction; default trusted is convenient and open to attacks.", "Trust a whole notebook vs per output: whole-notebook trust is simple and over-grants; per-output trust is precise and tedious."],
    p: ["Users trust a notebook to restore charts and thereby allow scripts from outputs they never reviewed.", "People assume trust covers code cells, and run untrusted code without reading it."],
    v: "Open a downloaded notebook with a script-bearing output, confirm it is untrusted and the script does not run, then trust it and confirm the script runs and the signature is recorded.",
    dep: ["trust-signatures", "output-sanitization"]
  },
  "output-sanitization": {
    s: "Cleaning HTML, styles and links in untrusted outputs: removing scripts, event handlers and dangerous URLs before the content reaches the page.",
    d: "A sanitizer parses output HTML and keeps only an allowlist of elements, attributes and URL schemes. Scripts, inline handlers, frames and unsafe styles are dropped. Vector images and prose rendering from lightweight markup get the same treatment, since they can embed HTML. The allowlist trades safety against fidelity: stricter lists break rich charts and tables. Sanitizers must be updated as new browser features and bypass techniques emerge, and must run on every code path that inserts content.",
    k: ["Allowlist sanitization vs blocklist: an allowlist denies by default and drops unknown useful features; a blocklist keeps content working and misses new attack forms.", "Sanitizing at render time vs at save time: render-time sanitizing protects whatever file arrives; save-time sanitizing changes stored content and misses files from other tools."],
    p: ["A prose cell containing raw HTML with an event handler runs script because only outputs were sanitized.", "A sanitizer that misses one code path, such as exported pages, leaves a bypass."],
    v: "Open an untrusted notebook whose outputs and prose contain script tags, event handler attributes and script-scheme links, and confirm none execute and the sanitized DOM lacks them.",
    dep: ["trust-model", "mime-selection"]
  },
  "content-security-isolation": {
    s: "Browser-level isolation for untrusted or interactive outputs: sandboxed frames, separate origins and content security policies that limit what embedded content can do.",
    d: "Outputs can be rendered in frames with a sandbox attribute that withholds privileges such as access to the parent page, cookies and navigation. Serving user content from a different origin from the editor prevents it from using the editor's credentials. A content security policy limits which scripts and connections the page may load. The cost is integration: framed content cannot size itself, share styles or reach the kernel without explicit message passing, which complicates every interactive output.",
    k: ["Separate origin for user content vs same origin: a separate origin makes script in outputs harmless to the editor's session and needs extra hosting; same origin is simple and exposes everything.", "Strict content security policy vs permissive: strict stops injected script, and breaks extensions loading from other hosts; permissive keeps extensions working."],
    p: ["Outputs served from the editor's origin can read its cookies and call its API as the user.", "A policy that blocks inline script breaks charts and widgets with no visible error."],
    v: "Render an output containing a script that tries to read the parent page and cookies, and confirm it cannot, with the console showing the sandbox blocking the access and the output otherwise displayed.",
    dep: ["interactive-html-outputs", "auth-tokens"]
  },
  "trust-signatures": {
    s: "A keyed hash of a notebook's content, stored by the user's installation, that records which notebooks the user has trusted and detects any later change.",
    d: "When a user trusts a notebook, the system computes a message authentication code over the notebook's cells and outputs using a secret key kept in the user's data directory, and stores it in a small database. On open, it recomputes and compares. Any change to content invalidates trust, so a file edited by someone else becomes untrusted again. The signature depends on a local secret, which means trust does not transfer to other machines, and also means the key must be protected from other users and from the notebook itself.",
    k: ["Keyed signature stored locally vs a signature carried in the file: a local key means a file cannot forge its own trust and trust is not portable; an embedded signature travels and can be copied or forged by whoever has the key.", "Signing everything vs only outputs: signing everything detects any change; signing outputs only ignores harmless source edits and misses code changes that matter."],
    p: ["Deleting or copying the signature database silently trusts or distrusts every notebook.", "Reformatting a notebook in another tool changes its hash and removes trust with no explanation."],
    v: "Trust a notebook, confirm it opens trusted, change one output in a text editor, reopen and confirm trust is gone; restore the change and confirm trust returns.",
    dep: ["notebook-file-format", "trust-model"]
  },
  "secrets-handling": {
    s: "Keeping credentials out of notebook files and outputs: injecting them at run time, masking them in output, and scoping what a kernel can reach.",
    d: "People paste tokens into cells to get work done, and notebooks then store them in source, in outputs that echo requests, and in saved history. Safer patterns read secrets from environment variables or a secret service provisioned to the kernel, and keep them out of the document. Scheduled runs need credentials too, which are issued to the run and not to a person. Output scanning can reject files containing known token patterns. Since any cell can read the environment, secrets available to the kernel are available to all code that runs in it.",
    k: ["Injecting secrets into the kernel environment vs fetching on demand with the user's identity: injection is simple and exposes secrets to all code in the session; on-demand fetching limits exposure and requires an identity-aware service.", "Scanning commits for secrets vs preventing exposure at the source: scanning catches mistakes after the fact; prevention needs changes in habits and tools."],
    p: ["A token printed during debugging is saved in the output and committed to a public repository.", "A shared kernel or shared executed copy exposes one person's credentials to another."],
    v: "Run a cell that reads a secret from the environment and uses it, then save and scan the notebook file and confirm the secret's value appears nowhere in source, outputs or metadata.",
    dep: ["output-stripping-hooks", "output-serialization"]
  },
  "network-egress-control": {
    s: "Limiting which hosts a kernel can contact and which can contact it, to contain data leaks, package attacks and misuse of shared compute.",
    d: "Kernels run arbitrary code with the network access of their host or container. Policies restrict outbound traffic to approved package mirrors and data services, block metadata endpoints that hold platform credentials, and prevent connections to internal services. Inbound access to kernel ports is limited to the server. Strict rules break normal workflows, such as installing packages or downloading a dataset, so many deployments offer a mirror or allowlist and a request path for exceptions.",
    k: ["Default deny with an allowlist vs open egress with monitoring: default deny contains leaks and burdens every new data source; open egress is convenient and detects problems afterward.", "Package mirror inside the network vs direct internet installs: a mirror gives control and reproducibility and needs upkeep; direct installs are current and unvetted."],
    p: ["A kernel can reach the platform's credential service and obtain tokens for the underlying machine.", "A strict policy breaks package installs, and users work around it with personal machines and copies of data."],
    v: "From a kernel, attempt connections to an approved host, an unapproved external host and the platform metadata address, and confirm only the first succeeds and the others are logged as denied.",
    dep: ["resource-limits", "kernel-provisioners"]
  },
  "kernel-message-signing": {
    s: "Authentication of every protocol message with a keyed hash, so that other local processes cannot inject requests into a kernel's sockets.",
    d: "The connection file holds a secret key generated per kernel. Each message includes a signature computed over its header, parent, metadata and content. The kernel verifies every incoming message and discards any with a bad signature or a repeated identifier. Without this, any local process that can reach the ports could execute code as the kernel's user. The key is only as private as the connection file: its permissions must restrict it to the user, and it must not appear in logs or shared directories.",
    k: ["Signing every message vs authenticating the connection once: per-message signing protects against injection on a shared host and costs a hash per message; a one-time authentication is cheaper and weaker if the channel is shared.", "A per-kernel key vs a shared server key: per-kernel keys limit the damage of one leak; a shared key is simple and exposes all kernels."],
    p: ["A connection file readable by other users lets them run code as the owner.", "A kernel started with an empty key accepts any message from any local process."],
    v: "Send a request with a wrong signature and confirm the kernel ignores it and logs it; send one with the correct signature and confirm it executes; check the connection file permissions are owner-only.",
    dep: ["message-envelope", "kernel-process"]
  },
  "execution-order-and-hidden-state": {
    s: "Because cells run in any order against one shared namespace, the saved document no longer determines its results, and every layer must decide how to expose or remove that gap.",
    d: "The editor shows counters and staleness, the file stores counts and outputs, the kernel keeps a global scope, and conversion, testing and scheduling all assume document order. Systems pick a stance: accept hidden state and provide tools to detect it, or constrain execution so state follows from the document, as reactive models do. The choice affects the file format, the kernel, the editor and every consumer of the file, so it must be made early and consistently.",
    k: ["Free execution order vs enforced dependency order: free order is the reason notebooks suit exploration; enforcement removes a class of irreproducible results and changes how people write.", "Detecting problems after the fact vs preventing them: detection through restart-and-run-all keeps the model simple; prevention makes every edit more expensive."],
    p: ["A notebook delivered as final fails on first run elsewhere because an earlier deleted cell supplied a variable.", "Exporters, tests and schedulers each assume document order, and disagree with what the author ran."],
    v: "Take a notebook that was edited interactively for a day, run it from a fresh kernel in document order, and compare every output with the stored ones; list every difference and trace it to a cause.",
    dep: ["namespace-execution-counter", "restart-run-all", "reactive-execution"]
  },
  "trust-and-untrusted-code": {
    s: "A notebook is a document and a program at once, so opening, rendering, converting, reviewing and running each carry a different level of risk, and the controls must follow that distinction.",
    d: "Opening should execute nothing. Rendering must neutralize active output. Conversion and review services handle files from strangers on servers. Running executes code with the user's identity, files and credentials, so it needs isolation and network limits, since no static check proves code safe. Trust state, sanitizers, origin separation, kernel isolation and message signing each cover one boundary, and a single missing one, such as an unsanitized export path, nullifies the rest.",
    k: ["Defending each boundary separately vs a single sandbox for everything: layered controls match the different risks and need consistent enforcement; one sandbox is simple and constrains legitimate use.", "Convenience of live outputs vs safety on open: live active content gives rich shared notebooks and enables file-borne attacks; stripping is safe and loses interactivity."],
    p: ["A conversion service renders uploaded notebooks with scripts enabled and exposes its host session.", "Teams rely on trust prompts while kernels run with broad credentials, so one executed cell reaches everything."],
    v: "Feed a deliberately hostile notebook through open, render, export and review paths with every control active, and confirm it executes no code and reaches no credentials in any of them.",
    dep: ["trust-model", "output-sanitization", "content-security-isolation"]
  },
  "state-versus-reproducibility": {
    s: "Notebooks favor an exploratory process that keeps live state, while sharing requires that someone else can rerun the work; the system choices determine how far apart these sit.",
    d: "Fast iteration depends on a persistent kernel with loaded data and warm caches. Reproduction depends on a captured environment, deterministic inputs, a clean order and recorded parameters. Each captured element costs authoring effort or flexibility. Systems provide the pieces separately, such as dependency capture, run-all checks, seeds and executed-copy records, and leave the discipline to the team. Where results feed decisions, teams add automation that reruns notebooks in clean environments and compares outputs.",
    k: ["Exploration freedom vs enforced reproducibility: freedom gets results fast and produces files nobody can rerun; enforcement yields reliable artifacts and slows early work.", "Capturing everything automatically vs asking authors to declare it: automatic capture reduces effort and misses system-level inputs; declaration is accurate and often skipped."],
    p: ["A result shown in a meeting cannot be regenerated a month later because the data and environment changed.", "A team enforces clean reruns so strictly that exploration moves into untracked scratch notebooks."],
    v: "Pick a result from a notebook a month old, rebuild its environment from captured records, rerun it from a fresh kernel, and compare the figures with those in the stored outputs.",
    dep: ["environment-spec", "restart-run-all", "run-artifacts"]
  },
  "code-and-results-in-one-file": {
    s: "Storing source, prose and generated results together makes a notebook self-explanatory and makes every tool that handles files, from version control to review to storage, handle both.",
    d: "Results in the file let a reader see output with no kernel and no environment, which is the main reason notebooks are shared. The same design makes files large, makes every run a change, mixes data with code in privacy terms, and breaks line-based diff and merge. Responses include output stripping, paired text sources, structural diff and merge tools and rendered review. Each response re-separates something the format joined, and each adds a step that someone must remember.",
    k: ["Keeping outputs in the file vs separating them: joined files are self-contained and heavy; separated files are lean and reviewable and need a way to show results.", "One tool-specific format vs a plain text convention: the standard file is read by every tool; text conventions diff well and support only what they can encode."],
    p: ["Repositories fill with large noisy notebook files, and review stops looking at them.", "Results containing private data are shared with the code because the file was treated as source only."],
    v: "Commit a notebook with outputs, measure its size and diff against a one-line source edit, then repeat with the project's configured stripping and pairing, and compare size and diff readability.",
    dep: ["notebook-file-format", "output-stripping-hooks", "paired-text-formats"]
  },
  "interaction-latency": {
    s: "Notebook use is a loop of edit, run and look, so every layer has a time budget: the kernel's wait, the message path, the rendering and the save must all feel immediate.",
    d: "A cell's feedback time includes queueing in the kernel, execution, output formatting, message transport through the server and any proxy, and rendering in the browser. Completion and widgets add small, frequent round trips that suffer from queueing behind long cells and from network latency to remote kernels. Large outputs, huge notebooks and many editors cost front-end time. Designs respond with separate channels, throttling, truncation, virtualized rendering and keeping heavy computation off the thread that answers requests.",
    k: ["Local kernel vs remote compute: local gives fast round trips and limited power; remote gives scale and adds latency to every keystroke-driven request.", "Rich live outputs vs cheap static ones: rich outputs support exploration and cost time per update; static outputs are cheap and ask the user to rerun for changes."],
    p: ["A completion popup waits behind a running cell and appears after the user has moved on.", "A single large output makes every later interaction in the page sluggish."],
    v: "Measure time from pressing run to the first visible output for a trivial cell, with the kernel idle and with a long cell running elsewhere, locally and through a remote gateway, and compare against the stated budget.",
    dep: ["channels", "large-output-handling", "websocket-gateway"]
  },
  "extension-and-compatibility": {
    s: "Everything from kernels to renderers to widgets is replaceable, so versioned interfaces and compatibility rules decide whether upgrades and third-party packages keep working.",
    d: "The file format, the kernel protocol, the widget protocol, the renderer interface and the extension API are each public contracts with many independent implementations. Each evolves by adding fields and versions, with older peers expected to ignore what they do not understand. The cost shows at upgrade time: front ends, servers, kernels and extension bundles are released separately, and mismatches appear as missing outputs and silent failures. Stable, narrow interfaces and clear version negotiation are the defense.",
    k: ["Narrow stable contracts vs fast evolving interfaces: narrow contracts keep old extensions working and slow change; evolving interfaces allow progress and break ecosystems.", "Ignoring unknown fields vs strict rejection: ignoring keeps mixed versions working and may hide errors; rejection finds problems early and breaks mixed deployments."],
    p: ["An editor upgrade drops support for a renderer interface, and saved notebooks lose their charts.", "A kernel implements an older protocol version, and new front-end features silently do nothing."],
    v: "Combine a new front end with an older kernel and an older widget package, run a representative notebook, and confirm each mismatch is reported clearly and the supported features still work.",
    dep: ["kernel-info-handshake", "schema-validation", "server-extensions", "widget-extensions"]
  }
});
