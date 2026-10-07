// Details for the backup system plate, part 1: operations, scheduling, policy and retention.
ATLAS.details("backup-system", {
  "management-console": {
    s: "The interface where administrators define sources, policies and targets, start jobs and browse recovery points, usually as a web application over the control service.",
    d: "The console is a thin front end over the management service's API. It shows an inventory of protected systems, their policies, last results and stored recovery points, and lets operators start jobs or restores. Role-based views limit what each person sees. It is hard because the state it shows is eventually consistent: agents report late, jobs run for hours, and a green status can describe something that happened yesterday. Good consoles show age next to every status.",
    k: ["Central console versus per-site consoles: one view across everything simplifies oversight, but a site that loses its link cannot be managed locally unless it keeps a local copy of control.", "Wizard-driven setup versus declarative configuration: wizards onboard new teams quickly, but cannot be reviewed or repeated, so drift between sites accumulates."],
    p: ["A status that shows the last result without its age lets a job that stopped running three weeks ago look healthy.", "Unprotected systems never appear in the console, so a missing source goes unnoticed until a restore is needed."],
    v: "Add a new host, then confirm it appears in the inventory as unprotected until a policy is assigned, and shows a recovery point with a timestamp after the first job completes.",
    dep: ["automation-api", "identity-and-access", "backup-catalog"]
  },
  "job-monitor": {
    s: "A live view of running and queued jobs with progress, throughput, current stage and logs, so operators can tell a slow job from a stuck one.",
    d: "Agents and workers send periodic progress records: bytes read, bytes sent, files processed, current stage and last heartbeat. The monitor merges them with queue state and estimates completion from recent throughput. It must tell three conditions apart: slow but healthy, waiting for a resource, and dead. Heartbeats with timeouts separate the last two. At scale the monitor aggregates progress rather than streaming every event, and keeps per-job logs addressable after the job ends.",
    k: ["Heartbeat timeouts versus connection-based liveness: heartbeats survive proxies and sleeping laptops, but a long timeout delays detection of a dead job while a short one produces false alarms.", "Estimating completion from recent throughput versus from source size: throughput adapts to reality, but swings wildly when other jobs start or stop."],
    p: ["A job that sits at ninety-nine percent while the agent scans millions of tiny files looks hung and gets killed.", "Progress that counts bytes read but not bytes committed reports success for data that never reached storage."],
    v: "Start a large job, pause the agent's network, and confirm the monitor changes the job from running to stalled within the heartbeat timeout, then back to running with correct progress when the link returns.",
    dep: ["job-queue-and-priorities", "backup-agent", "transfer-protocol"]
  },
  "reports-and-dashboards": {
    s: "Summaries of protection coverage, success rates, data growth, restore times and policy compliance, delivered on screen and by scheduled email or export.",
    d: "Reports query the job history and catalog to answer questions auditors and managers ask: which systems met their recovery point objective last week, which jobs failed repeatedly, how much was stored and how fast it is growing. The central design problem is defining success. A job that completed with warnings, or that skipped locked files, can be counted either way. Reports must also show absence, such as protected systems that produced no job at all.",
    k: ["Computing reports from raw history versus from pre-aggregated tables: raw history allows any new question, but slows down at scale and needs retention as long as the reports it supports.", "Counting warnings as success versus as failure: success keeps dashboards green and quiet, while failure is honest but trains operators to ignore noise."],
    p: ["A report built only from jobs that ran cannot show systems with no schedule, so coverage looks complete while gaps exist.", "Reports computed from history that has been pruned silently change last year's numbers."],
    v: "Remove the schedule from one test host and confirm the next compliance report lists it as missing its recovery point objective rather than omitting it.",
    dep: ["job-history", "rpo-rto-targets", "backup-catalog"]
  },
  "alerting": {
    s: "Detects failed, missed or suspicious jobs and capacity problems and sends notifications through email, chat, tickets or paging with enough context to act.",
    d: "Rules evaluate job results, schedule adherence, repository free space, verification failures and security events. Each alert has a severity, an owner and a de-duplication key so a repeating failure produces one open alert rather than hundreds of messages. Escalation sends unacknowledged alerts onward. The hard cases are absence alerts, since a missing job produces no event, and tuning: too many alerts teach operators to ignore all of them, too few miss the one that matters.",
    k: ["Alerting on every failure versus on consecutive failures: single failures are often transient, so waiting reduces noise, but a real fault takes longer to surface.", "Event-driven versus schedule-driven checks: events react instantly, but only schedule-driven checks can notice a job that never started."],
    p: ["A mail server outage silences alerts exactly when many jobs are failing, because the notification path shares the failed infrastructure.", "Alerts without the failing source's name and error text force a console visit for every message."],
    v: "Disable one scheduled job and confirm a missed-job alert fires after its window passes, is delivered to the owner, and closes automatically once the next run succeeds.",
    dep: ["job-history", "schedule-engine", "capacity-forecasting"]
  },
  "capacity-forecasting": {
    s: "Projects repository and bandwidth consumption from growth trends, retention and deduplication ratios so storage is added before it runs out.",
    d: "The forecaster fits growth to daily stored size, change rate and deduplication ratio per source, then projects forward under the current retention rules. It can answer what-if questions: how much space another year of retention needs, or when a repository fills. Accuracy is limited because data is not linear. A new project, a database reindex or a change in compression settings shifts change rates abruptly, and deduplication ratios fall as the easiest redundancy is already removed.",
    k: ["Projecting from logical source size versus from stored size: logical size is stable and easy to plan, but ignores deduplication that can differ ten-fold between data types.", "Linear trend versus per-source modeling: a single trend is cheap and often close, but misses one fast-growing system that fills the repository alone."],
    p: ["Forecasts that ignore pending expiry of old backups predict a full repository that retention would have freed.", "A forecast built from a quiet month underestimates quarter-end growth and runs out of space during the year-end close."],
    v: "Feed in thirty days of recorded usage, ask for the date the repository fills, then compare against actual usage over the following month and confirm the error is within a stated tolerance.",
    dep: ["job-history", "retention-rules", "repository-scaling"]
  },
  "automation-api": {
    s: "A programmatic interface covering every console action, so policies, sources and restores can be managed from code, scripts and external orchestration.",
    d: "The API exposes inventory, policies, jobs, recovery points and restores as resources with authentication, authorization and stable versions. Infrastructure-as-code integrations declare desired protection and let a reconciler create policies and enroll sources. Webhooks push job results to other systems. The difficulty is idempotence and long operations: a restore request may take hours, so the API returns a job handle, and retries from a client must not start a second restore or a second backup.",
    k: ["Resource-oriented API versus command endpoints: resources suit declarative tooling, but actions like 'run now' or 'restore' do not map cleanly onto them.", "Long-lived tokens versus short-lived signed requests: tokens are simple for scripts, but a leaked one gives lasting access to deletion capabilities."],
    p: ["A script that retries a timed-out 'start restore' call without an idempotency key launches several restores that overwrite each other.", "An API that can delete recovery points with a single credential defeats the protections placed on the console."],
    v: "Send the same create-policy request twice with one idempotency key and confirm one policy exists. Confirm a token without delete permission cannot remove a recovery point.",
    dep: ["identity-and-access", "protection-policies", "job-queue-and-priorities"]
  },
  "multi-tenant-admin": {
    s: "Separates tenants, departments or customers so each administers only its own data, quotas and policies, while a provider manages the shared platform.",
    d: "Tenants have isolated inventories, catalogs, keys, quotas and reports. Delegated administrators manage their own scope, and a provider tier manages shared repositories and global policy. Isolation must hold in the data layer too: separate encryption keys, per-tenant namespaces and, for some, separate repositories. Usage metering for billing counts logical data, stored data or both. The hard part is shared deduplication, which saves space across tenants but can reveal whether another tenant holds a given file.",
    k: ["Shared deduplication across tenants versus per-tenant: shared pools save the most space, but leak existence information and complicate deleting one tenant's data.", "Logical versus stored-size billing: logical size is predictable for customers, while stored size rewards efficiency but is hard to explain."],
    p: ["A global search or report that forgets the tenant filter shows one customer another's file names.", "Offboarding a tenant leaves shared chunks and keys behind because reference counting did not follow tenant boundaries."],
    v: "Create two tenants backing up the same file, then confirm each tenant's console and search show only its own recovery points, and deleting one tenant leaves the other fully restorable.",
    dep: ["identity-and-access", "key-management", "chunk-reference-counts"]
  },
  "schedule-engine": {
    s: "Decides when each protection job starts, using calendars, windows, triggers and policies, and compensates for missed runs and clock changes.",
    d: "Schedules are recurring calendars (daily at night, hourly for databases), event triggers (after another job), or continuous. The engine converts them to concrete run times, spreads start times to avoid thundering herds, and honors blackout windows when production is busy. A job missed because the agent was offline either runs late or is skipped, depending on policy. Time zones and daylight changes make this harder than it looks: a job scheduled in an hour that repeats runs twice, and one in an hour that vanishes never runs.",
    k: ["Run missed jobs on return versus skip to the next window: catching up keeps recovery points fresh, but an agent returning at nine in the morning then backs up during peak hours.", "Fixed start times versus randomized jitter within a window: fixed times are predictable, while jitter prevents hundreds of jobs from starting in the same minute."],
    p: ["Hundreds of jobs all scheduled at midnight saturate the repository and every one of them finishes late.", "Local-time schedules skip or double-run across a daylight saving change, leaving a gap or a duplicate recovery point."],
    v: "Set a daily job, take the agent offline over its start time, bring it back, and confirm the job runs once according to the missed-run policy and a recovery point appears with the right timestamp.",
    dep: ["protection-policies", "clock-and-time-sync", "job-queue-and-priorities"]
  },
  "job-queue-and-priorities": {
    s: "Holds jobs that are due, orders them by priority and recovery objectives, and dispatches them to workers and targets as resources free up.",
    d: "Due jobs enter a queue. The dispatcher picks the next job by priority, deadline and the availability of its source, a worker and a repository slot. Restores outrank backups. Jobs that need the same source or the same chain are serialized. Fairness prevents one large tenant from starving others. Because jobs are long, the queue persists across restarts and must reconcile with agents, which may have kept running a job the control service believes was lost.",
    k: ["Strict priority versus weighted fair share: strict priority guarantees critical systems finish, but low-priority jobs can starve for days.", "Central dispatch versus agent-pulled work: central dispatch optimizes globally, while pulling lets agents behind firewalls and on intermittent links participate."],
    p: ["After a control service restart, the queue starts a job that is already running on the agent and corrupts the chain.", "A restore queued behind a backlog of backups waits hours because restores were not given priority."],
    v: "Queue one hundred backups and then one restore, and confirm the restore starts within one slot-release rather than after the backlog, while no two jobs hold the same chain concurrently.",
    dep: ["concurrency-limits", "worker-pool", "rpo-rto-targets"]
  },
  "concurrency-limits": {
    s: "Caps how many jobs, streams and readers run at once against a source, worker, repository or link, so backup load does not overwhelm any one of them.",
    d: "Limits are set at several levels: per host, per datastore, per repository, per worker and globally. Each running job takes tokens from the levels it touches and waits when one is exhausted. The right values depend on hardware: a single spinning disk performs worse with many parallel streams, while object storage performs better. Deduplicated targets add a limit on index lookups. Mistuning shows as either idle hardware with slow jobs or a saturated repository with timeouts.",
    k: ["Static limits versus adaptive limits that back off on latency: static limits are predictable, but adaptive limits find the real capacity as hardware changes.", "Limits per job type versus global: per-type limits protect restores from backup load, but sum to more than the hardware can bear if not checked."],
    p: ["Too many parallel streams to a single disk array cause seek storms and every job slows by far more than the added parallelism gains.", "A limit counted per agent but not per shared datastore lets twenty virtual machines on one volume back up simultaneously."],
    v: "Raise parallel streams from one to sixteen against a test repository and confirm aggregate throughput rises, plateaus and then drops, then set the limit at the plateau and confirm queued jobs wait.",
    dep: ["job-queue-and-priorities", "worker-pool"]
  },
  "bandwidth-throttling": {
    s: "Limits the network rate a backup or replication job may use, by schedule, destination or priority, so it does not starve interactive traffic.",
    d: "Throttles are token buckets applied at the sender, on the repository gateway or at a network shaper. Rules vary by time of day (lower during working hours), by site link and by job class. Deduplication reduces the bytes needing transfer, which helps the limit go further. Throttling must interact sensibly with retries and parallel streams: each stream limited separately sums to far more than the intended cap. The difficulty is that a link shared with other traffic changes capacity from minute to minute.",
    k: ["Fixed rate limits versus latency-sensitive backoff: fixed limits are simple and predictable, while backoff protects users automatically but makes completion times unpredictable.", "Limiting at the sender versus at the network edge: sender limits work anywhere, but only edge shaping controls the aggregate of many senders."],
    p: ["A per-stream limit applied across thirty parallel streams saturates the link at thirty times the configured rate.", "A rate set so low that the nightly backup cannot finish in its window leaves recovery points permanently behind."],
    v: "Set a limit of fifty megabits for a job over a test link and confirm measured throughput at the receiver holds near that value across all of its streams, and rises when the daytime rule ends.",
    dep: ["transfer-protocol", "schedule-engine"]
  },
  "source-load-throttling": {
    s: "Reduces the read rate and priority of a backup on the source host when production performance suffers, protecting databases and users from backup I/O.",
    d: "Agents lower their thread priority and I/O priority, read with limited queue depth, and may pause when the host's CPU, disk latency or application response times cross a threshold. Snapshot-based reads shift the load to storage rather than the application. Storage arrays can enforce per-initiator limits themselves. The trade-off is time: a gentler backup keeps users happy but extends the window, and a backup that never finishes is no protection.",
    k: ["Throttle by fixed read rate versus by observed latency: latency-based throttling reacts to real harm, but oscillates and can stall entirely on a permanently busy host.", "Back up from a snapshot copy on the array versus from the live host: array snapshots remove host load, but need array integration and consume snapshot space."],
    p: ["A backup running at full speed during business hours raises database response times, and users blame the application.", "An aggressive latency threshold on a busy server pauses the job so often that it never completes."],
    v: "Run a read-heavy benchmark on a test host alongside a backup, and confirm application latency stays under its threshold while the backup slows, then resumes full speed when the benchmark stops.",
    dep: ["backup-agent", "snapshot-orchestration"]
  },
  "retry-and-resume": {
    s: "Recovers interrupted jobs by retrying transient errors and resuming from the last committed checkpoint rather than restarting the whole transfer.",
    d: "Jobs record checkpoints as chunks are committed to storage. After a network loss, agent crash or repository restart, the job asks the target what it already holds and continues from there. Retry policy distinguishes transient errors (timeouts, throttling responses), retried with backoff, from permanent ones (access denied, source missing), which fail at once. Resuming is hard because the source keeps changing: a resumed backup either continues from the same snapshot or abandons it and starts a fresh, consistent one.",
    k: ["Resume from a retained snapshot versus start a new snapshot: resuming saves the work done, but holds the snapshot open for days, while a fresh one wastes the transfer.", "Retry forever versus fail after a limit: persistence rides out outages, while a limit surfaces a real fault to a human before the next window."],
    p: ["Retrying a non-idempotent step after a timeout writes a chunk reference twice and corrupts reference counts.", "A resumed job that mixes data from before and after the interruption yields a recovery point that never existed on the source."],
    v: "Interrupt a large backup halfway by cutting the network, restore the link, and confirm the job resumes without resending committed chunks and the result restores to a state consistent with one snapshot.",
    dep: ["transfer-protocol", "backup-catalog", "snapshot-orchestration"]
  },
  "protection-policies": {
    s: "Named bundles that say what to protect, how and how often to back it up, where copies go, and how long each is kept, applied to many sources at once.",
    d: "A policy combines selection rules, backup type, schedule, target, encryption, retention, verification and archival steps. Policies are assigned to individual systems or to groups and tags, so a new server inherits protection automatically. Changes apply from the next run and must say what happens to existing recovery points. It is hard because policies interact: a longer retention changes capacity, a new target changes throughput, and an exception for one system creates a special case someone must remember.",
    k: ["Policy assigned by tag versus by explicit list: tags enroll new systems automatically, but a wrong or missing tag silently leaves a system unprotected.", "Changing retention retroactively versus only for new recovery points: retroactive changes are consistent but can delete data immediately, so most systems apply them going forward."],
    p: ["A new virtual machine is created without the tag the policy selects on, and no one notices for months.", "Editing a policy to shorten retention deletes years of recovery points at the next pruning run."],
    v: "Create a host carrying a policy's tag and confirm it is enrolled and runs its first job without manual steps; remove the tag and confirm an unprotected-system alert appears.",
    dep: ["source-selection-rules", "retention-rules", "schedule-engine", "rpo-rto-targets"]
  },
  "source-selection-rules": {
    s: "Defines what is included and excluded: systems, volumes, directories, file patterns, databases and cloud resources, evaluated each run so new data is picked up.",
    d: "Rules can include whole machines, named paths, patterns, tags or dynamic queries such as every database on a host. Exclusions drop temporary files, caches, swap, downloads and anything restorable from elsewhere. Rules are evaluated at run time, so a new directory under an included root is protected without edits. The danger is in exclusions: patterns written years ago exclude paths that later hold important data, and nested rules can conflict in ways that are hard to see.",
    k: ["Backing up everything and excluding the known junk versus listing what to include: exclusion-based selection protects unknown new data, but wastes space on large unimportant files.", "Dynamic discovery versus a fixed inventory: discovery follows change automatically, but can enroll or drop sources without anyone reviewing the decision."],
    p: ["An exclusion for 'temp' also matches a directory of customer exports that happens to include that word in its path.", "A fixed path list misses the data a team moved to a new volume, and the old path backs up an empty directory."],
    v: "Create an included directory, add a new subfolder with a file, run a backup, and confirm the file is present in the recovery point; then confirm an excluded pattern's files are absent.",
    dep: ["filesystem-walker", "data-classification"]
  },
  "rpo-rto-targets": {
    s: "The stated limits on acceptable data loss (recovery point objective) and time to restore service (recovery time objective), which drive schedules, targets and restore methods.",
    d: "A recovery point objective of four hours means backups or log shipping must occur at least that often. A recovery time objective of thirty minutes rules out restoring terabytes from tape and demands instant recovery or replicas. Systems are tiered by objectives, and each tier gets matching policy, storage and test frequency. The system measures achieved values: the age of the newest recovery point, and timed restores. The hard part is that the objectives are business decisions, often unstated or unrealistic, until a failure exposes them.",
    k: ["Objectives per system versus a few tiers: per-system objectives fit exactly, but tiers are easier to operate, fund and test.", "Declared versus measured recovery time: declared numbers are quick to set, but only a timed restore shows what the stated number really is."],
    p: ["A recovery time objective is promised without ever measuring a full restore, and the first real one takes three days.", "Objectives are assigned to the backup but not to dependencies such as directory services, so recovered systems cannot start."],
    v: "For one system, compare the age of its newest recovery point to its recovery point objective, and run a timed restore to compare against its recovery time objective, recording both numbers.",
    dep: ["restore-testing", "job-history"]
  },
  "retention-rules": {
    s: "Rules that say how long each recovery point is kept, by age, count or calendar position, balancing recovery needs, regulation and storage cost.",
    d: "A rule might keep daily points for two weeks, weekly for three months and monthly for seven years. Retention is evaluated on every recovery point, producing an expiry date. Rules can be overridden by holds, by dependent incrementals that cannot be removed while a later point needs them, and by minimum retention enforced by locks. Because retention drives most of the storage bill, it is argued over: legal requirements pull one way, cost the other, and a point deleted too early cannot be recreated.",
    k: ["Time-based versus count-based retention: time-based maps to regulation and is predictable for audits, while count-based gives predictable storage but varies in age with job frequency.", "Retention set by policy versus by data owners: central policy is consistent, while owners know their data's real obligations."],
    p: ["Retention written as a count keeps only five days of points after a job starts running hourly, instead of five weeks.", "A rule that expires a point still required by later incrementals either breaks the chain or silently keeps the point past its date."],
    v: "Create points at known dates, set a rule to keep seven days, run the pruning, and confirm exactly the expected points remain, with no dependent point left unrestorable.",
    dep: ["generational-rotation", "legal-hold", "backup-chains"]
  },
  "generational-rotation": {
    s: "The grandfather-father-son pattern and its variants, keeping many recent points and progressively fewer older ones so long history stays affordable.",
    d: "Recent daily points are kept at full density; at weekly and monthly boundaries one point is promoted to a longer-lived tier and the rest expire. Promotion picks a specific point, often the first full or the last of the period. With synthetic and forever-incremental schemes, promotion means marking a point as long-lived while its supporting chunks remain referenced. The challenge is aligning calendar boundaries across systems and job types, so that the promoted point exists and is verified rather than assumed.",
    k: ["Promoting an existing daily point versus taking a dedicated weekly job: promotion costs nothing extra, but ties long retention to whatever that day's run produced.", "Calendar boundaries versus rolling windows: calendar tiers match accounting periods, but rolling windows spread expiry more evenly and avoid month-end spikes."],
    p: ["The job scheduled for the promoted day failed, so the monthly tier holds a neighboring day or nothing.", "Overlapping generations double count shared chunks in capacity reports, making retention look more expensive than it is."],
    v: "Simulate ninety days of backups with a daily, weekly and monthly scheme and confirm the surviving points match the specification exactly, each one verified as restorable.",
    dep: ["retention-rules", "synthetic-full", "expiry-and-pruning"]
  },
  "expiry-and-pruning": {
    s: "Removes recovery points past their retention date and then frees the chunks and media that no remaining point references.",
    d: "Expiry marks points as deletable once rules and holds permit. Pruning removes the catalog entries, then space reclamation finds chunks with no remaining references and deletes or compacts them. With chains, a point cannot be removed while later ones depend on it. In deduplicated stores the cost is in the second phase, which must scan references safely while new backups are adding them. Deletion is the least reversible step in the system, so it is staged, logged and often delayed.",
    k: ["Immediate deletion versus delayed deletion with a grace period: immediate frees space at once, but a delay lets a mistaken policy change be reversed before data is lost.", "Reference counting versus mark-and-sweep reclamation: counting is incremental and quick, while sweeping is robust to counting errors but needs an expensive pass over everything."],
    p: ["Pruning that runs concurrently with an in-progress backup deletes a chunk the backup just decided to reuse.", "A bug in expiry dates after a time change deletes recent recovery points that should have lasted years."],
    v: "Expire a recovery point, run pruning, and confirm its unique chunks are gone and shared chunks are intact, while every remaining point restores with identical checksums.",
    dep: ["retention-rules", "chunk-reference-counts", "space-reclamation", "legal-hold"]
  },
  "legal-hold": {
    s: "A freeze that exempts specified data or recovery points from expiry and deletion for as long as litigation or investigation requires, overriding normal retention.",
    d: "A hold is attached by an authorized person to a scope: a user, a mailbox, a system or a date range. While active, pruning and manual deletion skip held points, and chunks they reference stay. Holds have an owner, a reason and an audit trail, and release is explicit. It is hard because scope is fuzzy: held content may sit inside larger recovery points, so the whole point is kept, and a hold placed after the point expired cannot recover what was already removed.",
    k: ["Holding whole recovery points versus extracting held items: whole-point holds are simple and defensible, but keep far more data than the matter involves.", "Holds enforced by software versus by storage-level locks: software holds are flexible to place and release, but an administrator or bug can bypass them."],
    p: ["A hold is applied after the relevant points expired, and the system confirms success while nothing can be preserved.", "A forgotten hold keeps data for years past its matter, growing storage and legal exposure."],
    v: "Place a hold on a recovery point past its expiry date, run pruning and an administrator delete attempt, and confirm both leave it intact and write audit entries naming the hold.",
    dep: ["retention-rules", "tamper-evident-log", "identity-and-access"]
  },
  "archive-policies": {
    s: "Rules for moving data that is no longer active into long-term storage, distinct from backups: archives hold the only copy or the official record.",
    d: "An archive keeps data for years or decades for compliance or history, often after removing it from primary systems. Policies pick data by age, last access or classification, write it with its metadata and checksums to cheap, durable media, and leave a stub or index entry behind. Retrieval times are long and accepted. The difficulty is time: formats, applications and encryption keys must still be usable in twenty years, so archives favor open formats and keep metadata and keys with equal care to the data.",
    k: ["Archive as a separate copy versus move with a stub left behind: copies are safe and simple, while moves actually reclaim primary space but make the archive the only copy.", "Self-describing open formats versus the product's native format: open formats outlive software, but give up some deduplication and efficiency."],
    p: ["Data archived and removed from primary storage turns out to have been written with a key that was later rotated away.", "No periodic test retrieval, so media or format problems surface only when a regulator requests the record."],
    v: "Archive a sample dataset, delete it from the source, and restore it using only the archive and documented steps, confirming checksums and that its metadata and original timestamps are preserved.",
    dep: ["data-classification", "cloud-archive-tier", "tape-library", "key-management"]
  },
  "data-classification": {
    s: "Tags data by sensitivity, regulation or business value so policies can apply the right retention, encryption, location and restore access.",
    d: "Classification labels come from the source system, from path and ownership rules, or from content scanners that detect personal, financial or health data. Policies then key off the label: sensitive data is encrypted with separate keys, kept in a given region, or retained for a statutory period. Scanning backup data is expensive and can run on a restored or mounted copy instead of production. The difficulty is accuracy and churn: labels go stale as data changes, and false negatives create compliance exposure.",
    k: ["Classification at the source versus by scanning stored backups: source labels are cheap and current, while scanning backups covers legacy data but costs read throughput and time.", "Automatic labels versus owner-assigned labels: automation scales, but owners know context that content patterns cannot see."],
    p: ["Scanner rules miss a new data format, so regulated records are stored under a general policy with a shorter retention.", "Labels stored only in the catalog are lost with it, and the data is treated as unclassified after a rebuild."],
    v: "Seed test files containing known sensitive patterns, run classification, and confirm each is labeled, routed to the labeled policy's retention and keys, and shown as such in the catalog and reports.",
    dep: ["malware-scanning", "file-index", "key-management"]
  },
});
