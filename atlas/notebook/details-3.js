// Details for the notebook plate, part 3: reproducibility, scheduling, notebook server.
ATLAS.details("notebook", {
  "dependency-capture": {
    s: "Recording which libraries and versions a notebook used, by declaring them in a manifest or by detecting imports and installed versions at run time.",
    d: "Capture happens in three ways: the author writes a requirements list, a tool inspects imports and resolves them, or the system records the installed set from the running kernel. A manifest can live in the notebook metadata or beside it. Capturing the language packages is not enough, because native libraries, system tools, hardware drivers and the interpreter itself affect results. Captured versions must be exact, since ranges resolve differently next month, and the lock must be generated in an environment that actually ran the notebook.",
    k: ["Declared manifests vs automatic detection: declared lists are intentional and drift as code changes; detection follows the code and misses dynamic imports and system packages.", "Exact pins vs ranges: pins reproduce results and age into security holes; ranges track fixes and let results change without notice."],
    p: ["A notebook installs packages from inside a cell, so the manifest never lists them and a fresh environment fails.", "Pins cover language packages but not the native library underneath, so a rebuilt image yields different numbers."],
    v: "Build a clean environment from only the captured manifest, run the notebook top to bottom, and confirm it completes and the recorded installed versions match the original run exactly.",
    dep: ["environment-spec", "notebook-file-format"]
  },
  "environment-spec": {
    s: "A complete, rebuildable description of the runtime: interpreter version, packages, system libraries and settings, usually as a lock file or a container recipe.",
    d: "The spec is what a build tool turns into an environment: a lock file with exact versions and hashes, or a container image recipe that also includes system packages. Teams store it next to the notebook and rebuild in CI, so the same environment is used by authors, schedulers and reviewers. Images are the more complete form and are large; lock files are small and depend on a package index remaining reachable. Specs must also be versioned together with the notebook, or old notebooks cannot find their environment.",
    k: ["Container image vs lock file: images include system libraries and are heavy to store and update; lock files are light and miss everything outside the package manager.", "One shared environment per team vs one per project: shared saves effort and drifts under conflicting needs; per project isolates and multiplies maintenance."],
    p: ["The package index removes an old release, and a lock file that referenced it can no longer be built.", "A shared environment is upgraded for one project and silently changes another's results."],
    v: "Rebuild the environment on a different machine from the spec alone, run the notebook, and compare output hashes of key results with the original run.",
    dep: ["dependency-capture"]
  },
  "kernel-env-binding": {
    s: "The link between a notebook and the specific environment its kernel runs in, so that opening the notebook starts the right interpreter with the right packages.",
    d: "The notebook's metadata names a kernel specification, and each specification points to an interpreter in a particular environment. If the environment is missing on another machine, the front end offers a different kernel or fails. Problems arise when names match but contents differ: two machines each have a kernel called by the same name with different package versions. Tools address this by creating or activating an environment per project, and recording its identity, not just a display name.",
    k: ["Binding by kernel name vs by environment identity: names are portable and lie about content; identity is exact and needs a registry the other machine can query.", "Automatic environment creation on open vs manual setup: automatic gives new collaborators a working notebook, but runs installation steps from files they did not read."],
    p: ["A notebook opens against a differently populated kernel with the same name and fails on a missing package, or worse, runs with a different version.", "Installation commands run on open execute whatever a downloaded notebook specifies."],
    v: "Open a notebook on a machine where the named kernel is missing and confirm the system reports the exact mismatch; on a machine where it exists, confirm the kernel's reported package versions equal the spec.",
    dep: ["environment-spec", "kernelspec-discovery"]
  },
  "restart-run-all": {
    s: "A check that clears the kernel's state and executes every cell in document order, to confirm that the saved notebook works without hidden state.",
    d: "Running from a fresh kernel exposes cells that depend on variables defined by deleted or later cells, and results that came from experiments no longer in the file. Many teams run it before sharing and automate it in continuous integration. It does not prove reproducibility of data or randomness, only that document order is self-consistent. A strict form stops at the first error; a tolerant one runs on and lists all failures. Long-running notebooks make it expensive, so some projects run it on a small data sample.",
    k: ["Stopping at the first error vs continuing: stopping gives a quick signal, but hides further failures; continuing lists everything and later failures may be cascading noise.", "Full data vs a sample: full data proves the real result and takes hours; a sample is quick and misses failures tied to scale."],
    p: ["A notebook that passes run-all still depends on a data file on one machine, so it fails elsewhere.", "A fresh run passes only because a cell has a side effect that persists on disk between runs."],
    v: "Delete a cell that defines a variable used later, restart the kernel and run all, and confirm the run stops with an error at the dependent cell and exits with a nonzero status when scripted.",
    dep: ["headless-execution", "namespace-execution-counter"]
  },
  "execution-order-record": {
    s: "The execution counts stored beside code cells, showing the sequence in which they actually ran, which exposes out-of-order runs and stale outputs.",
    d: "The kernel increments a counter for every execution request and returns it with the reply. The front end shows it next to the cell and stores it in the file. If the numbers are not increasing down the page, cells ran out of order and the saved outputs may not match a top-to-bottom run. The counter is only a hint: it does not record which cells ran in between, which variable changed, or whether code was edited after the run. Some tools add a staleness marker when source changes after execution.",
    k: ["Storing counts in the file vs recomputing: stored counts let readers spot disorder without a kernel, but change on every run and clutter history.", "Counter only vs full run history: the counter is tiny and suggestive; a full log of what ran in what order is reliable and large and rarely stored."],
    p: ["Readers trust a notebook whose counts look sequential, though cells were edited after running and show outdated results.", "Counts reset after restart and look like a clean run even when outputs predate it."],
    v: "Run cells one, three, then two, and confirm the saved counts are one, three and two with the sequence visibly non-monotonic; then edit a cell and confirm a staleness indicator appears.",
    dep: ["namespace-execution-counter", "output-serialization"]
  },
  "cell-dependency-graph": {
    s: "A graph of which cells define and use which names, computed by analyzing source, used to find stale cells, order execution or rerun only what changed.",
    d: "A static analyzer parses each cell, collecting the names it assigns and reads. Edges connect a reader to the cell that last defines each name. Tools use the graph to mark downstream cells stale after an edit, to run a cell's prerequisites first, or to run automatically in dependency order regardless of position. Static analysis cannot see dynamic names, side effects on files or objects mutated through methods, so the graph is an approximation, and the system must be clear about what it cannot see.",
    k: ["Static analysis vs runtime tracking: static analysis is cheap and safe and misses dynamic behavior; runtime tracking sees real access and adds overhead and complexity to the kernel.", "Execution in dependency order vs document order: dependency order removes hidden state; document order is familiar, and the file may no longer mean what its layout suggests."],
    p: ["A cell mutates an object in place, which the analyzer treats as a read, so downstream cells are not marked stale.", "Cells that write and read files have no visible edge, so reruns happen in the wrong order."],
    v: "Edit a cell defining a variable, and confirm the cells that read it are marked stale while an unrelated cell is not; then mutate an object in place and note which dependents the tool misses.",
    dep: ["cell-model", "reactive-execution"]
  },
  "randomness-seeds": {
    s: "Controlling random number generators and other nondeterminism so that a rerun yields the same numbers, or at least a known variation.",
    d: "Results depend on random seeds, on the order of parallel operations, on hash randomization, and on hardware-specific numerical behavior. Fixing a seed at the top of a notebook helps only for generators that read it, and only if cells run once in order; rerunning a middle cell continues the sequence from where it was and gives a different value. Libraries keep separate generators. Parallel computation and accelerators can be nondeterministic even with seeds. Reproducibility is therefore a spectrum that must be documented.",
    k: ["One global seed vs passing explicit generators: a global seed is simple and fragile under rerun order; explicit generators per step are reproducible in any order and add plumbing.", "Bitwise reproducibility vs statistical reproducibility: bitwise reproducibility makes checks exact and costs speed and portability; statistical agreement tolerates differences and needs tolerances."],
    p: ["Rerunning only a middle cell advances the random stream, so its result differs from the original run.", "A seed set for one library does not affect another's generator, so results still vary."],
    v: "Run the notebook twice from a fresh kernel and confirm identical key outputs; rerun one middle cell alone and observe whether results change, which shows the seed strategy's limits.",
    dep: ["restart-run-all", "namespace-execution-counter"]
  },
  "parameter-cells": {
    s: "A designated cell holding default values that a runner overrides for each execution, turning a notebook into a function with named inputs.",
    d: "The author tags one cell as the parameters. The runner reads its defaults, then inserts a new cell after it assigning the supplied values, so later cells use them. Values are passed as strings from the command line or as structured data, and are typed by the runner. Parameterization lets one notebook run for many dates, regions or models. It works by editing the notebook before execution, so the executed copy shows the actual values used, which also acts as a record of the run.",
    k: ["Injected assignment cell vs passing parameters through the environment: injection is visible in the result and works in any language; the environment avoids editing and hides the values from readers.", "Typed parameters vs strings: typing catches errors early; strings are simple and force parsing in every notebook."],
    p: ["A parameter name not defined in the defaults cell is injected and silently ignored by the code.", "Defaults left in the executed copy make it unclear which values were actually used."],
    v: "Run the notebook with a changed parameter and confirm the executed copy contains an injected cell with that value, that results depend on it, and that omitting it uses the default.",
    dep: ["cell-metadata-tags", "headless-execution"]
  },
  "headless-execution": {
    s: "Running every cell of a notebook in order with no browser, by starting a kernel, sending execute requests one at a time and collecting outputs into a new file.",
    d: "An executor reads the notebook, launches a kernel, sends each code cell as an execute request, waits for the reply and broadcast messages, and stores the outputs. It honors timeouts, handles stdin requests by failing or answering, and decides whether to stop on error. It speaks the same protocol as the interactive front end, so the same kernels work. The difficulty is what the browser normally provides: widget state, a display for rich output and a human to answer prompts, none of which exist in a batch run.",
    k: ["Stopping on the first error vs continuing: stopping saves compute and gives a clear failure; continuing yields a fuller report and wastes time on cells that must fail.", "A timeout per cell vs one for the notebook: per-cell timeouts catch a hang precisely; a total limit is simpler and finds the hang late."],
    p: ["A cell that waits for user input hangs forever because no front end answers.", "The executor reports success while an error output was stored but the run continued."],
    v: "Execute a notebook from the command line with one failing cell and confirm the exit status is nonzero, the executed file contains outputs up to the failure, and the error is stored in the failing cell.",
    dep: ["kernel-manager", "execute-request", "iopub-broadcast"]
  },
  "scheduler": {
    s: "A service that runs notebooks at set times or on events, supplying parameters and compute and tracking each run's status.",
    d: "A schedule defines a notebook, a calendar rule or trigger, parameters and the environment. At the time, the service allocates a worker, launches the executor, and records start, end, status and artifacts. Missed runs, overlapping runs and catch-up behavior after downtime need rules. Because notebooks were written interactively, they often need cleanup for scheduled use: removing exploratory cells and fixing assumptions about paths and credentials. The scheduler also needs access to secrets and data the person at the keyboard would have had.",
    k: ["A notebook-aware scheduler vs a generic job runner calling the executor: notebook-aware features such as parameters and result viewing come built in; a generic runner reuses existing operations and shows runs as opaque jobs.", "Skip missed runs vs run them on recovery: skipping avoids a stampede after downtime; running guarantees completeness and may duplicate work."],
    p: ["Two runs of a slow notebook overlap and write to the same output file.", "A scheduled run uses the owner's expired credentials and fails every night unnoticed."],
    v: "Schedule a notebook every minute with a parameter, stop the scheduler for three minutes, restart it, and confirm the configured missed-run policy is applied and each run's record shows its parameter value.",
    dep: ["headless-execution", "parameter-cells", "secrets-handling"]
  },
  "run-artifacts": {
    s: "What a scheduled or batch run leaves behind: the executed notebook, rendered reports, logs, metrics and files it wrote, stored with the run's identity and inputs.",
    d: "The executed notebook is the primary record: source, parameters and outputs of that run. It is stored beside the logs and any exported formats, keyed by run identifier and time. Retention rules prune old runs. Artifacts let people open a failed run in the editor and see exactly where it stopped, with the variables and tracebacks it produced. Large artifacts and sensitive outputs need storage with the right access control and an expiry, since an executed notebook is also a copy of whatever data it displayed.",
    k: ["Keeping the executed notebook vs only extracted metrics: the notebook is a full explanation and costs storage and privacy exposure; metrics are small and cannot show why a number changed.", "Storing artifacts with the scheduler vs in general object storage: with the scheduler is simple and ties lifetime to the run; general storage is durable and separate."],
    p: ["Executed notebooks pile up forever and hold private data long after the policy allows.", "A run's artifact path is reused, so the next run overwrites the failing one that someone was investigating."],
    v: "Run a parameterized notebook that fails, then open its stored executed copy and confirm it shows the injected parameters, the outputs up to the error, and the traceback, under a run identifier.",
    dep: ["headless-execution", "output-serialization"]
  },
  "failure-retry": {
    s: "How unattended runs handle errors: classifying failures, retrying transient ones, alerting on persistent ones and keeping the evidence.",
    d: "Failures fall into kinds: code errors that will repeat, resource failures such as a killed kernel, and external failures such as an unreachable service. Retry rules apply to the transient kinds, with delays and limits. A notebook has no built-in notion of retrying one step: a retry reruns everything, so notebooks with expensive early cells waste time or repeat side effects such as sending messages. Alerts need the failing cell and error, not only a status.",
    k: ["Retrying the whole notebook vs resuming from a failed cell: whole reruns are simple and correct; resuming saves time and requires state that the kernel may no longer have.", "Alerting on every failure vs after retries are exhausted: every failure is noisy; after retries is quiet and delays awareness."],
    p: ["A retry repeats a side effect such as sending an email or writing a record twice.", "An out-of-memory kill is reported as a generic failure, so people debug the code instead of the limit."],
    v: "Make a cell fail once for a transient reason, run with retries, and confirm the second attempt succeeds, both attempts are recorded, and a persistent failure sends an alert naming the cell.",
    dep: ["headless-execution", "run-artifacts", "memory-pressure-kernel-death"]
  },
  "notebook-testing": {
    s: "Checking notebooks automatically: that they run top to bottom, that outputs match expected values, and that functions defined in cells behave correctly.",
    d: "Levels of testing are cheap to expensive. Does it run without error, using headless execution. Do key outputs match stored reference outputs, within tolerance for numbers. Do functions and data meet assertions placed in cells. Output comparison must ignore volatile parts such as timestamps, memory addresses and execution counts. Tests run in continuous integration with the captured environment. Many teams move reusable logic into modules that have ordinary tests, and keep the notebook as a thin layer over them.",
    k: ["Comparing against stored outputs vs asserting in cells: stored comparisons catch any change and break on harmless ones; assertions state intent and cover only what the author thought of.", "Testing the notebook vs extracting logic into modules: testing the notebook covers the real artifact slowly; modules test quickly and leave the notebook unchecked."],
    p: ["Reference comparison fails on floating-point differences between machines, training people to ignore failures.", "Tests pass because outputs from a previous run were stored and never re-executed."],
    v: "Introduce a change that alters one printed number, run the test suite in CI, and confirm the failure names the cell and shows expected and actual values, while a timestamp change alone passes.",
    dep: ["headless-execution", "restart-run-all", "environment-spec"]
  },
  "contents-manager": {
    s: "The server component that reads, writes, lists, renames and deletes notebooks and files through a storage-neutral interface, and checks modification times.",
    d: "Browsers never touch the file system directly; they ask the server's contents interface to open a path and receive the notebook as structured data. Implementations store on a local disk, an object store, a database or a remote repository, behind the same interface. It converts between formats on the fly, such as paired text, validates files, creates checkpoints and enforces path rules that stop access outside the root. Slow or eventually consistent storage shows up as sluggish saves and spurious conflicts.",
    k: ["A pluggable storage interface vs direct file access: pluggable storage supports cloud and database backends, but leaks assumptions about atomic rename and listing speed.", "Reading through the server vs a mounted file system: server reads let it check permissions and convert formats; a mount is faster and bypasses both."],
    p: ["Path handling that fails to normalize relative segments lets a request read files outside the notebook root.", "An object store with delayed consistency shows a saved notebook as missing or old after a reload."],
    v: "Save a notebook, reload, and confirm identical content; request a path with parent-directory segments pointing outside the root and confirm the server refuses it.",
    dep: ["auth-tokens", "notebook-file-format"]
  },
  "session-manager": {
    s: "Tracks which open notebooks are attached to which running kernels, so a page reload or second browser reconnects to the same session.",
    d: "A session is a record linking a notebook path, a kernel identifier and a client name. Opening a notebook creates or finds a session; closing it may leave the kernel running. This indirection lets a reload keep variables, and lets the server show a list of running notebooks for cleanup. It also makes renames work, since the path in the record updates while the kernel continues. Orphaned sessions, whose browser vanished and kernel kept consuming memory, are the usual operational burden.",
    k: ["Kernel outliving the page vs shutting down on close: persistence keeps long computations alive through reloads and leaks resources; automatic shutdown frees memory and loses work in progress.", "Session record held in server memory vs persisted: in-memory is simple and lost on server restart; persisted survives restarts and must reconcile with kernels that died."],
    p: ["Hundreds of idle sessions from closed tabs hold memory until the machine runs out.", "After a server restart, the session list shows notebooks attached to kernels that no longer exist."],
    v: "Open a notebook, set a variable, reload the page, and confirm it reattaches to the same kernel with the variable present; then list sessions and confirm exactly one for that path.",
    dep: ["kernel-manager", "contents-manager"]
  },
  "kernel-manager": {
    s: "Starts, monitors, interrupts, restarts and stops kernel processes, and keeps the connection details clients need to reach them.",
    d: "On a start request it picks a kernel specification, generates connection information with ports and a signing key, launches the process with a command from the specification, and waits until the kernel answers a handshake. It watches for exits and can restart automatically. It exposes interrupt, which sends a signal or a message, and shutdown, which asks politely and then kills. Culling stops kernels idle beyond a limit. The manager runs in the server, so a crashing or slow kernel must never block it, which is why launching and waiting use asynchronous calls.",
    k: ["Culling idle kernels vs leaving them: culling reclaims resources and surprises users who expected a long-lived state; leaving them is friendly and costs memory.", "Automatic restart after a crash vs manual: automatic restart keeps the page usable, but gives a clean namespace without telling the user their variables are gone."],
    p: ["Idle culling shuts down a kernel during a long cell that printed nothing, destroying hours of work.", "A kernel that ignores interrupt must be killed, leaving child processes running."],
    v: "Start a kernel, run an endless loop, send an interrupt and confirm it stops while variables survive; send shutdown to another and confirm the process is gone and its ports are released.",
    dep: ["kernelspec-discovery", "kernel-process", "kernel-info-handshake"]
  },
  "websocket-gateway": {
    s: "The long-lived browser connection that relays protocol messages between the page and a kernel's channels, with framing, authentication and flow control.",
    d: "Kernels talk over local sockets with separate channels. The browser opens one WebSocket per kernel, and the gateway multiplexes the channels onto it, adding the channel name to each message. It authenticates the connection and checks the origin. It buffers messages for slow clients and handles reconnects, replaying recent output when a client returns. Proxies, idle timeouts and size limits between browser and server frequently break it, and the failure shows up as a notebook that appears alive and never updates.",
    k: ["One socket multiplexing all channels vs one per channel: one socket is cheap and ordering is simple; separate sockets isolate slow outputs and multiply connections.", "Buffering and replaying on reconnect vs dropping: replay restores context after a network blip, at the cost of memory per kernel; dropping is simple and loses output."],
    p: ["A reverse proxy without WebSocket support or with a short idle timeout cuts the connection mid-run.", "A slow browser lets message buffers grow without bound and exhausts server memory."],
    v: "Run a cell that prints every second, disconnect the network for ten seconds, reconnect, and confirm the page resumes and either replays or marks the missed output rather than hanging silently.",
    dep: ["channels", "auth-tokens", "message-envelope"]
  },
  "auth-tokens": {
    s: "How the server decides who a request comes from: login by password, single sign-on, or a random token in the URL, plus session cookies and cross-site protections.",
    d: "A server started for one person generates a random token and prints a link containing it; the token is exchanged for a cookie. Shared servers authenticate through an identity provider and attach the user to each request. Every route that reads files or reaches a kernel must check identity, and WebSockets need the same check at upgrade time. Because a kernel runs code, access to it is equivalent to a shell as that user, and weak authentication here is remote code execution.",
    k: ["Token links vs password login: tokens are simple and work for single users; passwords and single sign-on give identity and revocation for shared servers.", "Binding to localhost vs exposing on a network: localhost is safe by default and awkward for remote work; exposure enables access and demands proper authentication and transport encryption."],
    p: ["A server exposed on a network without a token or with one in a shared URL gives anyone a shell.", "WebSocket upgrade requests skip the checks applied to ordinary HTTP routes."],
    v: "Request the kernel list and open a WebSocket without credentials and confirm both are rejected; with a valid token, confirm both succeed, and that a request from a different origin is refused.",
    dep: []
  },
  "server-extensions": {
    s: "A way to add routes, settings, handlers and front-end modules to the server and editor, so features such as terminals, version control and previews ship as installable packages.",
    d: "Extensions register HTTP handlers, hooks around file saves and kernel starts, and configuration. Front-end extensions are bundles loaded by the editor that add commands, panels, renderers and menus, and can talk to a matching server part. The editor itself is built as a set of such extensions, so everything is replaceable. Installation, version compatibility and load order create most of the difficulty, as does trust: an extension runs with the full privileges of the server or the page.",
    k: ["Everything as extensions vs a closed core: extensions let the community add features, but expand the compatibility surface that every upgrade must preserve.", "Prebuilt extensions vs building on the target machine: prebuilt install quickly and reproducibly; building adapts to the environment and needs a toolchain."],
    p: ["An editor upgrade breaks a third-party extension, and the editor loads with a missing panel and no clear error.", "A malicious extension reads files and tokens, since it runs with the user's privileges."],
    v: "Install an extension, restart the server, and confirm its route answers and its panel appears; uninstall it and confirm both are gone and the editor still starts without errors.",
    dep: ["auth-tokens", "contents-manager"]
  },
  "multi-user-spawner": {
    s: "A hub that authenticates many users and launches a separate server for each, on shared machines, containers or a cluster, with per-user storage and limits.",
    d: "Users sign in once at the hub, which starts a single-user server through a spawner appropriate to the platform: a local process, a container, or a cluster pod. A proxy routes each path to the right server. The hub tracks activity and shuts down idle servers to save resources. Each server gets its own identity, home storage and resource limits. The proxy and hub are the shared, critical pieces: if either fails, every user's page is unreachable even though their kernels are running.",
    k: ["Separate server per user vs one multi-tenant server: separate servers isolate files, resources and failures at the cost of startup time and memory; one server is cheap and shares everything.", "Idle shutdown vs always on: shutdown saves cost and loses unsaved state and warm caches; always on is convenient and expensive."],
    p: ["A user's server takes minutes to start because the image is large and not cached on the chosen node.", "The proxy's routing table loses entries after restart, and users see running servers they cannot reach."],
    v: "Log in as two users, confirm each gets a distinct server with its own files and limits, stop the hub briefly, and confirm users' running kernels continue and reconnect when it returns.",
    dep: ["auth-tokens", "kernel-provisioners", "resource-limits", "data-access-mounts"]
  },
});
