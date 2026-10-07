// Details for the experiment tracker plate, part 1: comparison interface, integrations.
ATLAS.details("experiment-tracker", {
  "run-table": {
    s: "A sortable, filterable table with one row per run, showing settings, final metrics and status, so people can pick which runs deserve a closer look.",
    d: "Columns are generated from the union of parameter and metric names across the selected runs, which can reach thousands of distinct keys. The table queries the metadata store with filters, sort keys and pagination, and lets users pin, hide and group columns. Grouping collapses runs that share settings and shows aggregates. The difficulty is that columns are schema-less: names differ between runs, types vary, and missing values must sort sensibly instead of breaking the view.",
    k: ["Server-side filtering versus client-side filtering: server queries scale to millions of runs, but every filter edit costs a round trip; client filtering feels instant and breaks past a few thousand rows.", "Dynamic columns from observed keys versus a declared schema: no setup for users, but a typo in a logged name creates a new column that nobody notices."],
    p: ["Sorting a column that mixes numbers and strings puts the best run in an unexpected place and people pick the wrong one.", "Showing last-logged values as if they were final misleads when a run is still going or crashed early."],
    v: "Log 5,000 runs with two overlapping parameter sets, then filter on one parameter and sort by a metric. The table returns the correct first page in under a second and runs missing the metric appear last.",
    dep: ["metadata-database", "query-language", "summary-metrics"]
  },
  "metric-charts": {
    s: "Line charts of metrics against step or time, with several runs overlaid, smoothing and zoom, used to judge whether training is converging.",
    d: "The viewer requests series for the selected runs and plots each on a shared axis. Because a run may hold millions of points, the server returns a reduced series for the visible window and refetches detail on zoom. Users switch the x axis between step, wall time and relative time, apply smoothing, and use log scales. Charts must stay in step with live runs, so they poll or subscribe to new points. Hard parts are honest downsampling and aligning runs that logged at different steps.",
    k: ["Smoothing in the viewer versus storing smoothed values: viewer smoothing is reversible and adjustable, but two people viewing the same run with different settings draw different conclusions.", "Fetch reduced series on demand versus preload everything: on-demand keeps pages light, at the cost of visible loading each time the zoom changes."],
    p: ["Heavy default smoothing hides a loss spike that was the actual signal of divergence.", "Overlaying runs on step when their logging frequencies differ makes a slower logger look like it trains slower."],
    v: "Open a run that logged two million points and zoom to a 100-step window. The chart shows the exact raw points for that window, and the full view matches the stored minimum and maximum.",
    dep: ["metric-downsampling", "metric-store", "live-streaming", "step-and-time-axes"]
  },
  "run-comparison": {
    s: "A side-by-side view of selected runs showing which settings differ, how their metrics diverge and how their outputs compare, with identical fields collapsed.",
    d: "The view loads the full records for a handful of runs and diffs them field by field: parameters, tags, environment, code and data versions, and metric summaries. Fields that match are hidden by default so the differences stand out. It can also diff configuration trees and dependency lists. It depends on the captured records being complete; where a run never logged a value, the diff shows a gap that may mean either default or unknown.",
    k: ["Diff only changed fields versus show everything: hiding equal fields finds the cause faster, but a user cannot tell whether a field was equal or simply not recorded.", "Compare against a chosen baseline versus pairwise all-to-all: a baseline gives a clear reading, all-to-all grows quadratically and becomes unreadable past a few runs."],
    p: ["Two runs with the same visible settings but different data versions look identical because the data link was never compared.", "Nested configuration flattened into dotted keys produces false differences when key order changes."],
    v: "Pick two runs that differ only in learning rate and data snapshot. The view lists exactly those two fields as changed and shows both runs' metric summaries next to them.",
    dep: ["metadata-database", "config-snapshots", "dataset-version-links", "environment-capture"]
  },
  "parallel-coordinates": {
    s: "A chart with one vertical axis per hyperparameter plus the objective, with one line per run, used to see which settings lead to good results across a sweep.",
    d: "Each run is drawn as a polyline crossing an axis for every selected parameter and the target metric. Brushing a range on an axis filters the runs and highlights the surviving lines. Companion views show parameter importance and scatter plots against the metric. Categorical values get their own spacing and log-scaled parameters need a log axis. The hard part is legibility: with hundreds of lines, overplotting hides structure unless opacity, ordering and brushing are tuned.",
    k: ["Raw lines versus fitted importance scores: lines show the actual data and its exceptions, importance scores are quick to read but depend on a model that may be wrong with few runs.", "Brushing filters the run table too versus keeping views independent: linked views are powerful, but surprise users when a hidden filter silently changes another page."],
    p: ["Reading importance scores from twenty runs as if they were conclusions leads to dropping parameters that actually matter.", "Failed or pruned runs left in the chart show their partial metric as a result and distort the picture."],
    v: "Run a sweep of 200 trials, brush the top ten percent of the objective axis, and confirm the remaining lines match exactly the runs the run table returns for the same objective filter.",
    dep: ["hyperparameter-sweeps", "run-table", "summary-metrics"]
  },
  "artifact-viewers": {
    s: "Built-in renderers that display logged files inside the interface: images, tables, confusion matrices, audio, text diffs and model graphs, without downloading them.",
    d: "Each artifact or media entry has a type, and the viewer picks a renderer by type. Images and audio stream from the object store through signed links, tables page from stored rows, and large text is truncated with a link to the full file. Step sliders let users scrub through images logged during training. The work is in safely rendering untrusted content: an uploaded HTML or SVG file can run script, so previews are sandboxed or sanitized and served from a separate origin.",
    k: ["Render in the interface versus open the raw file: in-place rendering speeds up review, but every supported type adds a parser and an attack surface.", "Store renderable previews at upload versus render on demand: precomputed thumbnails load fast and cost storage and processing on every write."],
    p: ["Serving user-uploaded markup from the main origin lets one run's file read another user's session.", "Loading a full multi-gigabyte table into the browser freezes the page instead of paging it."],
    v: "Log an image at each of 100 steps and a table of 10 million rows. The slider shows the correct image per step, the table opens its first page without downloading the whole file, and an uploaded script file does not execute.",
    dep: ["object-store", "media-and-table-logging", "artifact-upload"]
  },
  "dashboards-and-reports": {
    s: "Saved collections of charts, tables and written commentary that present a group of runs to other people, and keep tracking the data as new runs arrive.",
    d: "A dashboard stores queries and visual settings, not copies of data, so panels refresh when new runs match. A report adds prose, embedded panels and a frozen snapshot option for sharing a result at a moment in time. Sharing follows the workspace's access rules. They are the main way findings travel to people who never open the run table. The tension is between live views, which drift after a conclusion is written, and snapshots, which go stale.",
    k: ["Live queries versus frozen snapshots: live panels stay current, but a report cited in a decision can change under the reader; snapshots are citable and become wrong as runs are added or deleted.", "Per-user dashboards versus shared team templates: personal views are flexible, shared templates keep teams looking at the same definition of a metric."],
    p: ["A live report quoted in a review shows different numbers a month later after runs are archived.", "Panels referencing a deleted run or renamed metric show empty charts without saying why."],
    v: "Save a dashboard filtered to one experiment, add a new matching run, and confirm the panel includes it. Export the same report as a snapshot, add another run, and confirm the snapshot is unchanged.",
    dep: ["search-and-saved-views", "metric-charts", "authorization-and-roles"]
  },
  "search-and-saved-views": {
    s: "Finding runs, experiments and models by name, tag, parameter value or metric range, and saving those queries so teams can return to them.",
    d: "Free text matches names and descriptions, while structured filters compare parameters, metrics, tags, status, user and time range. The query parser turns both into calls on the query language or the search index. Saved views store the filter, columns and sort so a link reproduces the same table. Typed comparison is the sticking point: a parameter logged as the string 0.1 in one run and the number 0.1 in another must match the same filter or results silently drop.",
    k: ["Structured query language versus point-and-click filters: a language is precise and shareable, but most users only use what the filter builder offers.", "Index on write versus query the database directly: an index makes text search fast, and adds a second store that can lag behind the primary."],
    p: ["Filtering on a metric returns only runs that logged it, so a run that crashed before logging looks like it never existed.", "Saved views refer to column names that later get renamed, and open as empty tables."],
    v: "Search for a parameter value logged as a string in some runs and a number in others and confirm every run appears. Open a saved view link in a new session and see the same table, sort and columns.",
    dep: ["query-language", "search-index", "metadata-database"]
  },
  "notebook-embeds": {
    s: "Embeddable panels and loaders that bring runs, charts and registry entries into interactive notebooks, so analysis can pull tracked results and show them in place.",
    d: "A notebook uses the client library to fetch run tables and series as data frames, and can render the same charts as the web interface in an inline frame. Authentication reuses the user's token. Going the other way, a notebook session can itself be a run, recording its code cell contents and outputs. Embedded views must respect access control, and links shared outside the workspace need expiring tokens instead of the user's own credentials.",
    k: ["Render server-side charts in a frame versus pull data and plot locally: frames match the web interface exactly, local plotting gives full control and lets results be combined with other data.", "Notebooks as runs versus only reading from runs: recording notebooks captures exploratory work, but captured state is partial because cells run out of order."],
    p: ["A notebook run records cells in execution order and a reader reruns them top to bottom, getting different results.", "A saved notebook output with an embedded token leaks access when the file is shared."],
    v: "From a notebook, load a run's metric history into a table, check it matches the web chart's values at three sampled steps, and confirm an embedded frame fails for a user without access to that project.",
    dep: ["client-sdks", "tracking-api", "authorization-and-roles"]
  },
  "client-sdks": {
    s: "The libraries that training code imports to start runs, log values and upload files, designed to add little overhead and never break the training job.",
    d: "An SDK exposes a small surface: start a run, log parameters and metrics, log artifacts, finish. Internally it assigns identity, buffers records, and sends them from a background thread or process so the training loop never waits on the network. It reads server address and credentials from environment variables, and handles retries and version negotiation with the server. It is hard because it lives inside other people's processes, including multiprocessing, forking and signal handlers.",
    k: ["Background sender versus synchronous calls: a background sender keeps training fast and risks losing the last values on a hard kill; synchronous sends are safe and slow.", "One thin core with wrappers versus separate implementations per runtime: a shared core keeps behavior consistent, and wrappers add a layer where bugs and version skew hide."],
    p: ["Forking a trainer after the run starts duplicates the sender and writes the same run from two processes.", "An exception in the logging path raises into the training loop and kills a week-long job over a metric."],
    v: "Start a run, log 100,000 values from a training loop, then kill the process with a signal. Confirm loop throughput is within a few percent of the same loop with logging off, and report how many trailing values reached the server.",
    dep: ["client-buffering", "tracking-api", "run-identity"]
  },
  "framework-autologging": {
    s: "Hooks that attach to common training frameworks and log parameters, metrics, models and environment automatically, without edits to the training code.",
    d: "Autologging patches framework entry points, such as the fit call or the training-loop callback, to capture constructor arguments, per-epoch metrics, final evaluation scores and the resulting model object. It names things by the framework's own conventions. It enables fast adoption since one line instruments an existing script. It is fragile because it depends on framework internals that change between versions, and it can log too much or the wrong thing without telling the user.",
    k: ["Automatic capture versus explicit logging: autologging gets everything with no effort, and users never learn which values were recorded or whether a field they rely on exists.", "Patch framework internals versus use official callback interfaces: callbacks survive upgrades, and expose less than patches can reach."],
    p: ["A framework upgrade renames a metric key and dashboards comparing old and new runs go blank.", "Autologging saves a full model at every epoch and fills the artifact store."],
    v: "Run an unmodified training script with autologging on and check the run record holds the framework's constructor arguments, per-epoch metric series and a loadable model. Repeat after a framework minor upgrade and diff the logged key names.",
    dep: ["client-sdks", "parameter-logging", "metric-logging"]
  },
  "command-line-interface": {
    s: "A terminal tool for the same operations as the interface and API: listing runs, downloading artifacts, managing registry entries and wrapping any command as a tracked run.",
    d: "The command line supports scripting and use from machines with no browser. It can launch an arbitrary command as a run, capturing its arguments, exit code, standard output and environment, which tracks programs that were never written with the SDK. It reads the same configuration and credentials as the SDK. The difficulty is stable behavior for automation: output formats, exit codes and flags become interfaces that other scripts depend on.",
    k: ["Wrap arbitrary commands versus require SDK calls: wrapping tracks any program with no code change, but only sees what the process exposes, such as arguments and output.", "Human-readable output by default versus structured output by default: readable text suits people, and scripts that parse it break when wording changes."],
    p: ["Scripts parse table output, and a column added in a new release breaks every deployment job that reads it.", "The wrapper marks a run succeeded because the launcher exited cleanly while the child it started failed."],
    v: "Run a shell command through the wrapper, make it exit non-zero, and confirm the run is recorded as failed with the exit code, arguments and captured output. List runs with structured output and parse it with a standard JSON tool.",
    dep: ["client-sdks", "tracking-api", "environment-capture"]
  },
  "pipeline-hooks": {
    s: "Connectors that make workflow engines and schedulers create runs, pass run identifiers between steps and record pipeline structure, so a multi-step job appears as one lineage.",
    d: "A pipeline step runs in a fresh container, often on a different machine from its neighbors. The hook injects the parent run identifier and server settings into the step, starts a child run, and records the step's inputs and outputs as lineage edges. It marks a step run failed or retried according to the scheduler's own state. Retries are the hard part: a re-executed step must either resume its run or start a clean one, never half of each.",
    k: ["One run per pipeline versus one run per step: one run gives a simple record, per-step runs match how retries and caching work and need a parent link to be browsable.", "Cached step outputs reused versus always recompute: reuse saves compute and the lineage must record that outputs came from a previous run."],
    p: ["A retried step creates a second run with the same name and the comparison view shows both as separate experiments.", "Step runs lose the parent identifier when the scheduler drops environment variables, and lineage breaks into islands."],
    v: "Run a three-step pipeline with one forced retry. The tracker shows one parent, three child runs plus the failed attempt marked failed, and lineage edges connecting each output to the next step's input.",
    dep: ["nested-runs", "input-output-edges", "run-resume"]
  },
  "training-platform-bridge": {
    s: "The integration with the system that schedules and runs training jobs, so jobs launch with tracking already configured and cluster details are attached to each run.",
    d: "The platform creates the run before the job starts, or injects credentials and a run identifier into the job's environment. It then writes scheduling data back: queue time, node names, resource requests, preemptions and the exit state. Going the other way, the tracker can trigger new jobs from a recorded configuration. A preempted or rescheduled job should continue the same run. The integration needs both systems to agree on who owns run state when they disagree.",
    k: ["Platform creates the run versus the script creates it: platform creation guarantees a record even when the code crashes at import, and script creation is simpler and misses early failures.", "Share one identity system versus map between two: shared identity is clean, mapping lets both systems evolve and needs careful handling of departed users."],
    p: ["A job killed by the scheduler never reports, and its run stays in the running state indefinitely.", "Cluster node names recorded without the allocation time make later hardware comparisons ambiguous."],
    v: "Submit a job, preempt it midway and let it restart. Confirm there is one run, with queue time and node names for both attempts, a recorded preemption event, and a final status matching the platform's own.",
    dep: ["run-lifecycle", "run-resume", "hardware-record", "authentication"]
  },
  "deployment-connectors": {
    s: "Integrations that let serving systems pull registered model versions by name or alias and report back which version is live where.",
    d: "A serving system resolves a name and alias, such as production, to a concrete version, downloads the packaged model, and loads it. Connectors can poll or react to registry events to roll new versions out. They write deployment records back, tying a version to an environment and time. This closes the loop from training to production, and the reported state is only as true as the serving system's honesty: the registry can say what should be live, not what is.",
    k: ["Serving resolves alias at startup versus continuously: startup resolution is predictable, continuous resolution propagates a rollback fast and means a bad alias change reaches production at once.", "Registry as source of truth versus deployment config as source of truth: registry control is convenient, and deployment config keeps releases reviewable in the same place as other changes."],
    p: ["A server caches the resolved version and keeps serving after the alias moved, so the record disagrees with production.", "Deployment records are written by hand and drift from what is actually running."],
    v: "Move an alias from version 3 to version 4 and confirm a connected serving instance loads version 4 within its configured interval. Then check the registry shows version 4 deployed to that environment with the load timestamp.",
    dep: ["stages-and-aliases", "model-packaging", "registry-api", "webhooks-and-events"]
  },
  "webhooks-and-events": {
    s: "An event feed that announces changes such as run finished, version created or stage changed, delivered to subscribers by HTTP calls or a message queue.",
    d: "Each state change emits an event with a type, subject, actor and time. Subscribers register a destination and a filter, and the delivery service signs each request, retries on failure with backoff, and records outcomes. Events trigger evaluation jobs, deployments and chat messages. The difficulty is delivery semantics: at-least-once delivery means receivers see duplicates and sometimes out-of-order events, so events need identifiers and consumers need to be idempotent.",
    k: ["At-least-once delivery versus at-most-once: at-least-once never loses a promotion event, and requires receivers to handle duplicates; at-most-once is simple and can silently drop a deployment trigger.", "Thin events with identifiers versus full payloads: thin events avoid leaking data and stale snapshots, and force receivers to call back for details."],
    p: ["A receiver acts on a stage-changed event after a later change has already reverted it, because events arrived out of order.", "Unsigned webhook endpoints accept forged promotion events from anyone who finds the URL."],
    v: "Subscribe a test endpoint, create a version, and make the endpoint fail the first attempt. Confirm the event arrives on retry with the same event identifier, a valid signature, and a delivery record showing both attempts.",
    dep: ["model-versions", "stages-and-aliases", "ingest-queue"]
  },
  "notifications-and-alerts": {
    s: "Messages sent to people when something needs attention: a run finished or failed, a metric crossed a threshold, a version awaits approval or a quota is near.",
    d: "Rules match events or metric conditions and route messages to chat, email or paging systems. Metric alerts evaluate on incoming points, for example loss becoming not-a-number or accuracy falling below a floor, so a wasteful run can be stopped early. Users tune what they get; unfiltered messages are ignored. Run-level alerts need care to fire once, not once per retry, and approval requests need to reach the right reviewer, not a general channel.",
    k: ["Alert on every threshold crossing versus alert after a sustained condition: immediate alerts catch divergence early, and fire on single noisy points; sustained conditions delay the message and cut noise.", "Fixed recipients on a project versus recipients derived from role: fixed lists are simple and rot as people move; role-based routing follows organization changes."],
    p: ["A flapping metric near its threshold sends hundreds of messages and the channel gets muted, hiding the real failure.", "Approval requests sent to a former owner sit unseen for weeks."],
    v: "Log a metric that goes to not-a-number at step 300. Confirm exactly one alert is delivered to the configured channel within the evaluation interval, naming the run and step, and no repeats for the rest of that run.",
    dep: ["webhooks-and-events", "metric-logging", "approval-workflows"]
  },
});
