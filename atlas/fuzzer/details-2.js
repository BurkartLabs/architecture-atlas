// Details for the fuzzer plate, part 2: scheduling, scaling, corpus.
ATLAS.details("fuzzer", {
  "seed-scheduler": {
    s: "Chooses which corpus entry to mutate next, favoring entries likely to lead to new coverage while keeping every entry's turn from starving.",
    d: "The scheduler ranks entries by properties such as execution time, size, depth in the lineage, and how rare the edges they hit are, then picks one with a weighted or round-robin policy. Some designs keep a small favored subset that covers all known edges and visit it far more often. It reads corpus metadata and coverage, and it tells the mutation stage how much effort to spend. It is hard because the payoff of each choice is unknown until tried, and the best choice changes as the corpus grows.",
    k: ["Favoring a small covering subset versus uniform choice: favoring finds new coverage faster early, while uniform avoids ignoring entries with value that the subset misses.", "Prefer fast small entries versus slow large ones: fast entries raise executions per second, but slower ones may sit nearer to deep code."],
    p: ["A favored set that never refreshes keeps the fuzzer working on entries long since exhausted.", "Ranking by size alone buries a large input that reaches the only path to a deep parser."],
    v: "Run two campaigns on the same target and seeds with the scheduler enabled and replaced by uniform choice, and compare coverage over time across several repeats to confirm a difference beyond run-to-run spread.",
    dep: ["seed-metadata", "edge-coverage", "power-schedules"]
  },
  "power-schedules": {
    s: "Decide how many mutated variants to generate from a chosen entry, giving more attempts to entries that hit rarely exercised paths.",
    d: "After the scheduler picks an entry, the power schedule sets its energy: the number of mutations to try. Formulas weigh how often the entry's paths have been hit by all inputs, how often the entry has already been chosen, and its speed. Rarely visited paths earn more energy, which steers effort toward unexplored regions. Schedules read global path frequency and per-entry counters. They are hard because rarity is estimated from sparse counts, and a schedule that suits a shallow target may waste time on one with deep, narrow paths.",
    k: ["Rarity-weighted energy versus fixed energy: rarity concentrates effort where discovery is likely, while fixed energy is simple and has no feedback to mis-estimate.", "Cooling energy as an entry is reused versus keeping it constant: cooling prevents fixation on one entry, constant energy rewards a productive one."],
    p: ["Energy keyed to hit counts of noisy edges rewards entries that only differ in unstable instrumentation.", "A schedule tuned on small benchmarks starves large targets where one path needs thousands of attempts."],
    v: "Instrument the fuzzer to log energy per entry and confirm entries covering the rarest edges receive more mutations than ones covering only common edges.",
    dep: ["seed-scheduler", "hit-count-bucketing", "campaign-stats"]
  },
  "bandit-scheduling": {
    s: "Treats scheduling choices as a multi-armed bandit, learning from observed discovery rates which seeds or mutators to pick more often.",
    d: "Each arm, whether a seed, a mutation operator or a whole strategy, has a running estimate of how often it produced new coverage. The scheduler picks mostly the best arm and sometimes tries others to refresh estimates, using schemes that balance exploration and exploitation. It reads discovery events from the campaign stats and adjusts weights live. It is hard because rewards are rare, delayed and nonstationary: an arm that was productive early dries up as the easy paths are exhausted.",
    k: ["Adaptive selection versus fixed probabilities: adaptive follows what works on this target, but it can lock onto early luck and starve a late bloomer.", "Reward as new edges versus reward as new edges per second: raw edges ignore cost, per-second rewards favor fast arms over valuable slow ones."],
    p: ["Probabilities decay to near zero for an arm that would have helped later and are never refreshed.", "Rewards are credited to the last mutator in a stack rather than the one that mattered."],
    v: "Plot per-arm selection probability against its measured discovery rate during a run and confirm weights move toward arms that discover more and recover when productivity changes.",
    dep: ["campaign-stats", "mutator-selection", "seed-scheduler"]
  },
  "deterministic-stage": {
    s: "A systematic first pass over a new corpus entry that applies every simple mutation at every position once, before random mutation takes over.",
    d: "For a newly admitted entry the fuzzer walks its bytes, flipping each bit, each byte, setting small arithmetic offsets and inserting known interesting values, one position at a time. The pass is exhaustive and repeatable, and it discovers which bytes matter, information that later mutation can reuse. It uses the mutation operators and the execution engine. It is hard because it costs a number of runs linear in input size, which is wasteful for large inputs and for targets that need structure rather than bit flips.",
    k: ["Running the deterministic pass versus skipping to random mutation: the pass finds easy wins and byte importance, while skipping saves time on large inputs and structured formats.", "Whole input versus only effective regions: restricting to bytes that previously changed behavior saves runs but depends on a map that can be wrong."],
    p: ["Large entries spend hours in the pass while smaller entries wait, slowing the whole campaign.", "The pass reruns on every synchronized entry from other instances, repeating work other instances already did."],
    v: "Count executions spent per entry in the pass versus random stages and confirm the pass finishes in a number of runs proportional to input length and discovers coverage not found by random mutation alone on a small target.",
    dep: ["bit-and-byte-flips", "arithmetic-mutations", "persistent-mode"]
  },
  "phase-control": {
    s: "Switches the campaign between exploring for new coverage and exploiting known entries, based on how recently discovery has slowed.",
    d: "Control logic monitors time since the last new edge and the size of the unexplored queue. In an exploration phase it favors fast, broad mutation and new seeds; after a stall it can shift to slower, deeper strategies such as structured or directed mutation, or hand over to solver-assisted techniques. It reads campaign statistics and sets scheduler parameters. It is hard because a plateau may mean the target is exhausted, or merely that the next step needs a rare condition, and the controller cannot tell which.",
    k: ["Fixed time-based phases versus stall-triggered switching: fixed phases are predictable, while stall triggers react to the target but flip on noise.", "Staying with cheap strategies longer versus escalating early: cheap strategies give steady yield, and escalation costs compute that may find nothing."],
    p: ["A controller escalates after a short natural lull and abandons a strategy that was about to pay off.", "Phase changes reset counters, so the same entries are re-explored from scratch."],
    v: "Run a campaign past a coverage plateau and confirm from logs that the phase changes at the configured trigger, and that the new phase reaches edges the earlier one did not in the following hours.",
    dep: ["campaign-stats", "seed-scheduler", "hybrid-fuzzing"]
  },
  "time-budgeting": {
    s: "Allocates the campaign's compute time across targets, entries and stages, and stops runs when marginal discovery no longer justifies the cost.",
    d: "A budget manager assigns each target a share of cores and hours, based on priority, code change recency and recent yield. Within a target it caps time per stage and per timeout. It watches discovery rate per core hour and reassigns resources when yield falls. It talks to the worker fleet and to campaign statistics. It is hard because yield is bursty, so stopping on a flat stretch can miss a late discovery, and uniform shares waste compute on exhausted targets.",
    k: ["Equal shares versus yield-weighted shares: equal is fair and simple, yield-weighted maximizes discoveries but starves quiet targets that may hide bugs.", "Fixed run length versus stopping at a plateau: fixed length is predictable for planning, plateau stopping saves cost but may stop just before a find."],
    p: ["A target with a slow harness consumes its share without enough executions to learn anything.", "Budgets are tuned on discovery counts, and the fleet drifts toward targets that produce duplicate crashes."],
    v: "Compare discoveries per core hour across targets with budgeted and equal allocation over a week and confirm the budgeted split finds at least as many distinct bugs for the same total compute.",
    dep: ["campaign-stats", "worker-fleet", "throughput-accounting"]
  },
  "strategy-ensembles": {
    s: "Runs several differently configured fuzzers or strategies on the same target, since no single configuration is best across targets.",
    d: "An ensemble starts instances with different mutators, schedules, instrumentation or even different fuzzers, and shares their findings through corpus synchronization. Diversity covers the weaknesses of any single design: one instance with grammar mutation, another with comparison feedback, another with sanitizers off for speed. It depends on synchronization and the coordinator. It is hard to configure: the mix must be chosen without knowing the target, and weak members consume cores without contributing.",
    k: ["Many varied instances versus many identical ones: variety reaches different bugs, while identical copies benefit from simpler tuning and cause less sync noise.", "Static mix versus dynamically reweighted mix: static is easy to reason about, and dynamic follows results but adds feedback complexity."],
    p: ["Every member uses the same coverage metric, so the diversity is only apparent and they find the same things.", "Weak members flood the shared corpus with near-duplicate inputs."],
    v: "Compare union coverage of an ensemble with the best single configuration at equal total core hours and confirm the ensemble reaches edges no single member reached alone.",
    dep: ["corpus-synchronization", "parallel-instances", "campaign-coordinator"]
  },
  "campaign-stats": {
    s: "The live and historical counters of a campaign: executions per second, coverage over time, queue sizes, stage yields and crashes found.",
    d: "Each instance writes counters to a stats file or service: total executions, speed, edges found, entries by stage, timeouts and crashes, with timestamps. Aggregators combine them across instances. The numbers drive the scheduler, bandit selection, time budgeting and dashboards. They are hard to interpret: coverage growth is logarithmic, so a flat curve is expected eventually, and speed collapse or a stuck calibration looks the same as a healthy slow target unless the stats separate causes.",
    k: ["Per-instance stats versus central aggregation: local files are simple and survive a coordinator failure, central views make fleet-level decisions possible.", "Record every event versus periodic summaries: events enable analysis at storage cost, summaries are cheap and hide short anomalies."],
    p: ["Execution counts include failed starts, so a broken harness appears busy.", "Stats from instances that restarted overlap or reset and make totals jump backward."],
    v: "Run a short campaign and compare the reported execution count and edge count with independent measurements, such as process-level counters and a coverage replay of the corpus, and confirm they agree within a small margin.",
    dep: ["throughput-accounting", "edge-coverage"]
  },
  "parallel-instances": {
    s: "Several fuzzer processes working on the same target at once, usually one per core, each with its own queue and a shared view of discoveries.",
    d: "Each instance has a private working directory and runs its own scheduler and mutations. Instances occasionally import interesting inputs from siblings through the shared sync directory or a central store. Role assignment can differ: one runs the deterministic stage, others only random mutation. It uses CPU placement and corpus sync. It is hard because parallel instances scale less than linearly: they rediscover the same paths, contend for disk, and import inputs they have already covered.",
    k: ["Independent instances with periodic sync versus tightly shared state: independence keeps runs simple and robust, shared state wastes less duplication but couples failures.", "Roles per instance versus identical instances: roles split work cleanly, and identical instances are simpler to scale and replace."],
    p: ["All instances run the expensive deterministic stage on the same entry at once, which is wasted work.", "Disk contention in a shared sync directory slows every instance as the count grows."],
    v: "Measure combined coverage and executions per second at one, two, four and eight instances and confirm throughput scales near linearly and the coverage gain per added instance is reported.",
    dep: ["corpus-synchronization", "cpu-placement", "seed-scheduler"]
  },
  "corpus-synchronization": {
    s: "Moves interesting inputs between fuzzer instances or machines so each benefits from what the others discovered, without importing everything.",
    d: "Instances periodically scan a shared location or message channel for new entries from peers and run each once. If the entry reaches coverage the importer lacks, it is admitted to the local queue. Filtering by coverage, size and age limits traffic. It uses the shared store or network and the corpus admission logic. It is hard because naive sync wastes time re-running thousands of redundant inputs, and because sync across a fleet creates a bandwidth and consistency problem.",
    k: ["Pull-based directory polling versus push to a coordinator: polling is simple and tolerates failures, while push is faster and needs infrastructure and ordering.", "Sync everything versus only inputs with new coverage on the sender: everything keeps copies identical but costs bandwidth, filtering saves it and may lose useful context."],
    p: ["Imported entries are re-executed at every instance, so synchronization time rivals fuzzing time on a big fleet.", "Sync copies an entry mid-write and the importer sees a truncated input."],
    v: "Start two instances, let one find a new edge, and confirm the other imports that input within the sync interval and records the same edge in its own map.",
    dep: ["corpus-admission", "distributed-corpus-storage", "shared-memory-channel"]
  },
  "campaign-coordinator": {
    s: "The control process that assigns targets and configurations to workers, collects results and keeps the whole fleet's state consistent.",
    d: "The coordinator holds the list of targets, their current builds, the worker roster and the desired assignments. It hands out work, receives heartbeats, aggregates coverage and crashes, and reassigns work when workers die. It reads from the build system and writes to storage and the tracker. It is hard because it is a single point of coordination for thousands of independent processes: it must be restartable without losing campaign state, and tolerate workers that vanish or report twice.",
    k: ["A central coordinator versus peer-to-peer coordination: central is easy to reason about and may become a bottleneck or single failure; peer-to-peer scales and is harder to debug.", "Pull work from the coordinator versus push assignments: pull tolerates worker churn, push gives tighter control."],
    p: ["A coordinator restart loses in-memory assignments and workers all restart from empty corpora.", "Duplicate heartbeats from a restarted worker count its coverage twice."],
    v: "Kill the coordinator mid-campaign, restart it, and confirm workers continue, state is recovered from storage, and the totals after recovery match the sum of worker-reported values.",
    dep: ["worker-fleet", "global-coverage-merge", "distributed-corpus-storage"]
  },
  "worker-fleet": {
    s: "The pool of machines or containers that run fuzzing instances, including provisioning, health checks, replacement and per-worker resource limits.",
    d: "Workers are created from images with the target build, tools and sanitizers. A manager launches instances, monitors for crashes of the fuzzer itself, out-of-memory kills and disk fill, and replaces unhealthy workers. Preemptible capacity lowers cost but is reclaimed with short notice, so state must be flushed often. It depends on the resource limits and the corpus store. It is hard because fuzzing deliberately stresses the machine: it fills disks with crashes, leaks memory and hangs, so fleet hygiene is a core part of the system.",
    k: ["Preemptible capacity versus reserved capacity: preemptible is cheap and requires frequent state upload, reserved is stable and costs several times more.", "One instance per container versus many per host: one per container isolates failures, many per host use memory and disk more efficiently."],
    p: ["Crash artifacts fill the local disk and the worker stops fuzzing while still reporting healthy.", "Stale images run old target builds and discover bugs already fixed."],
    v: "Terminate a worker without warning and confirm the manager launches a replacement, which restores the corpus and resumes at comparable executions per second within the stated recovery time.",
    dep: ["resource-limits", "distributed-corpus-storage", "process-isolation"]
  },
  "global-coverage-merge": {
    s: "Combines per-instance coverage maps into one fleet-wide view, so the system knows what has been reached anywhere and can tell new from already-seen.",
    d: "Each instance sends its coverage bitmap or edge list to an aggregator, which unions them and tracks which instance found what first. The merged view drives fleet statistics and lets instances discard inputs whose edges the fleet has already covered. It uses the coverage map format. It is hard because maps from different builds are not comparable, collisions make union overstate or understate coverage, and sending large maps frequently costs more than it saves.",
    k: ["Merge raw maps versus merge decoded edge identities: raw maps are small and fast, while identities survive collisions and build changes at higher storage cost.", "Frequent merging versus periodic: frequent merging prevents duplicated work, periodic reduces traffic and tolerates staleness."],
    p: ["Instances running different builds merge incompatible maps and the union is meaningless.", "A collision inflates the fleet map so a genuinely new edge is judged already seen."],
    v: "Run two instances that cover disjoint known edges and confirm the merged view equals the union with first-finder attribution, then confirm an instance built differently is rejected rather than merged.",
    dep: ["edge-coverage", "map-sizing-and-collisions", "campaign-coordinator"]
  },
  "distributed-corpus-storage": {
    s: "Durable shared storage for the corpus, crashes and reproducers, so campaigns survive machine loss and instances can fetch what peers found.",
    d: "An object or file store holds the corpus per target, keyed by content hash. Workers upload new entries in batches and download others on sync or startup. Versioning and retention rules govern what is kept. It serves sync, regression replay and fix verification. It is hard because many workers write at once, millions of small objects are expensive to list, and the corpus must stay small enough to download in minutes while keeping coverage.",
    k: ["Content-addressed storage versus named files: content addressing deduplicates and makes writes idempotent, and loses human-readable names.", "Storing the full corpus versus only a minimized one: full keeps history, minimized restores fast and drops potentially useful inputs."],
    p: ["Listing a bucket with millions of entries makes every sync take longer than the interval between syncs.", "A bad worker uploads corrupt inputs that every new worker then downloads."],
    v: "Wipe a worker and confirm it restores the stored corpus, reaches the stored coverage on replay and resumes without redoing the discovery work.",
    dep: ["corpus-store", "seed-metadata"]
  },
  "cpu-placement": {
    s: "Pins fuzzing processes to specific cores and keeps them off cores used by other work, so speed is stable and measurements are comparable.",
    d: "Each instance is bound to a core, and sibling hardware threads, memory nodes and interrupt handling are considered. Pinning reduces migration, cache misses and scheduler noise. It also keeps heavy instances from sharing a core, which halves speed each. Power management is set so clock speed does not vary. It interacts with the fleet's container limits. It is hard because the best placement depends on machine topology, and virtualized hosts hide the real layout.",
    k: ["Pin one instance per physical core versus per hardware thread: per core is faster for each instance, per thread yields more instances at lower speed each.", "Fixed pinning versus letting the scheduler move processes: fixed pinning gives repeatable numbers, free scheduling copes better with mixed loads."],
    p: ["Two instances pinned to the same core by a configuration mistake each run at half speed with no error.", "Frequency scaling makes executions per second drift and masks real changes in throughput."],
    v: "Read per-core utilization during a campaign and confirm each instance occupies its assigned core at full utilization with no two sharing one.",
    dep: ["resource-limits", "throughput-accounting"]
  },
  "seed-corpus": {
    s: "The initial set of valid, varied inputs a campaign starts from, which determines how quickly it reaches deep code.",
    d: "A seed corpus is gathered from sample files, test suites, captured traffic or earlier campaigns. The fuzzer runs each seed, records its coverage and uses the useful ones as the first queue. Good seeds cover the main features of the format and pass early validation, so mutation spends effort on interesting variations. It feeds the corpus store and the scheduler. It is hard because seeds must be small, diverse and representative at once, and licensing and privacy of real-world files must be handled.",
    k: ["Many small seeds versus a few rich ones: small seeds mutate quickly and run fast, rich ones reach deep features but are slow and brittle to mutate.", "Real-world samples versus hand-crafted ones: real samples capture actual usage, crafted ones target features and avoid sensitive data."],
    p: ["All seeds come from one source and share a feature set, so a whole format version is never reached.", "Seeds contain personal data that ends up in public bug reports."],
    v: "Run the target on the seeds alone and confirm coverage already spans the main format features, then compare time to reach a deep function from the seeds against an empty start.",
    dep: ["corpus-store", "seed-selection"]
  },
  "seed-selection": {
    s: "The process of gathering, filtering and importing seeds: choosing diverse, valid, small inputs and rejecting ones that add nothing.",
    d: "Candidates are executed and ranked by new coverage over those already chosen, then trimmed by size and speed. Sources include conformance suites, public sample files, production traffic samples and corpora from related targets. Invalid or slow inputs are dropped, and duplicates by coverage are merged. It runs the same minimization used for the live corpus. It is hard because representative inputs for rare features are scarce, and importing a huge set uncritically makes the first synchronization slow.",
    k: ["Greedy coverage-based selection versus random sampling: greedy gives compact diverse sets and may drop rare, subtle inputs; random keeps variety and bloats.", "Importing from related projects versus writing seeds: related corpora are free and may carry assumptions that do not fit."],
    p: ["Selection by coverage keeps only the smallest representatives and loses inputs whose bytes matter for later mutation.", "Production samples are imported without scrubbing and carry secrets into the corpus."],
    v: "Select seeds from a large candidate pool and confirm the chosen subset reaches the same edges as the whole pool with far fewer entries.",
    dep: ["corpus-minimization", "edge-coverage", "seed-corpus"]
  },
  "corpus-store": {
    s: "Persistent storage of the corpus on disk or in a shared service, with one file per input and the metadata needed to restore a campaign.",
    d: "Inputs are stored as individual files named by hash or sequence number, with sidecar data for coverage and lineage. On startup the fuzzer reloads and recalibrates entries. Directories can hold hundreds of thousands of files, so layout and filesystem choice affect speed. It supplies replay, sync and minimization. It is hard because files must be written atomically while the process may be killed, because reload cost grows with size, and because corpus data may contain sensitive material.",
    k: ["One file per input versus a packed archive: files are simple and tool-friendly, and a packed archive reads faster and handles huge counts.", "Hash names versus sequence numbers: hashes dedupe and are stable across machines, sequences show order and lineage at the cost of collisions between instances."],
    p: ["A kill during a write leaves a truncated file that crashes the target on every reload.", "A single directory with millions of files makes listing and startup take hours."],
    v: "Kill the fuzzer with no warning, restart it from the stored corpus, and confirm it reloads every complete entry, ignores or repairs partial ones and reaches the same coverage count.",
    dep: ["seed-metadata"]
  },
  "corpus-admission": {
    s: "The rule that decides whether a tested input joins the corpus, normally because it reached coverage not yet seen.",
    d: "After running a candidate, the fuzzer compares its coverage against the global map. If it contains a new edge or a new hit-count bucket, the input is saved with its metadata; otherwise it is discarded. Some systems also admit inputs for other reasons, such as unusual runtime or new comparison outcomes. It uses the feedback signal and writes to the store. It is hard because the rule defines what the campaign values: too strict a rule stops growth, too loose a rule admits near-duplicates that slow everything.",
    k: ["New edges only versus edges plus hit-count changes: edges alone keep the corpus small, hit counts find loop and iteration behavior and grow the corpus.", "Admit at once versus verify first: verification removes flaky coverage but doubles the runs spent on each discovery."],
    p: ["Unstable coverage from threads or randomness admits inputs that reach nothing new on replay.", "A very strict rule drops an input that is one step from a deep path."],
    v: "Replay each admitted input alone against an empty map and confirm each reaches at least one edge no earlier-admitted input reached, in admission order.",
    dep: ["edge-coverage", "hit-count-bucketing", "corpus-store"]
  },
  "corpus-minimization": {
    s: "Reduces the corpus to a smaller set that keeps the same total coverage, and shrinks individual entries, to speed up fuzzing and replay.",
    d: "Set minimization picks the fewest inputs that cover every edge the whole corpus covers, using a greedy set-cover pass over recorded coverage. Entry trimming removes bytes that do not change coverage. Both reduce the work per cycle and the cost of syncing. It consumes coverage data and rewrites the store. It is hard because coverage is only a proxy for value: an input removed for redundant coverage may still be a good mutation base, and trimming costs executions.",
    k: ["Minimize the set versus keep everything: a minimized set restores and replays fast, and the full set keeps variety that mutation can use.", "Trim entries versus leave them: trimming speeds each run and mutation, and can remove bytes that matter for conditions coverage does not see."],
    p: ["Minimizing against a coarse map removes inputs needed to cover edges the map collided with.", "Trimming a checksum-protected input makes it invalid and it no longer reaches deep code."],
    v: "Minimize a corpus and confirm replaying the result reaches exactly the same edge set as the original, with a smaller number of files and shorter total replay time.",
    dep: ["edge-coverage", "corpus-store", "hit-count-bucketing"]
  },
  "dictionary-store": {
    s: "A collection of tokens, keywords and magic values the target is known to look for, used by mutation to pass checks random bytes would not.",
    d: "Dictionaries hold strings and byte sequences such as format signatures, keywords and field names. Authors supply them, or they are extracted from the target's binary or source, or learned from comparison feedback during a run. The mutation stage inserts or overwrites with these tokens. It feeds dictionary mutation. It is hard because large dictionaries dilute the chance of choosing a useful token, and because tokens appear in context: a keyword alone passes a lexer, and not a parser that expects it in the right place.",
    k: ["Hand-written dictionaries versus automatic extraction: hand-written ones are precise and cost expert time, extraction is free and adds noise.", "Static dictionary versus tokens learned at runtime: static ones are available from the first run, learned tokens reflect what this target compares against."],
    p: ["A dictionary with thousands of tokens makes useful insertions rare and slows discovery.", "Tokens extracted from the target include error messages and dead code and mislead mutation."],
    v: "Fuzz a parser that checks for a long magic string with and without the dictionary and confirm the dictionary run reaches the post-check code in far less time.",
    dep: ["comparison-feedback", "dictionary-mutations"]
  },
  "seed-metadata": {
    s: "The per-input record the fuzzer keeps: coverage hit, speed, size, parent, mutation that produced it and how often it has been chosen.",
    d: "Each corpus entry carries a descriptor with its execution time, size, the edges it covers, its depth in the lineage, its parent and the operator that made it, plus counters of times selected and times it led to new entries. The scheduler and power schedule read it, minimization uses it and analysts use lineage to understand how a bug was found. It is stored beside the entry. It is hard because it grows with the corpus and must stay consistent across restarts and synchronization between instances.",
    k: ["Rich metadata versus a bare file: rich metadata enables smarter scheduling and analysis and adds storage and recalibration cost.", "Recompute on load versus persist: recomputing is always accurate and slow, persisting is fast and can go stale when the build changes."],
    p: ["Metadata persisted from an older build gives wrong speeds and coverage after the target changes.", "Lineage is lost in synchronization, so a finding cannot be traced back to its seeds."],
    v: "Pick a crash found late in a campaign and confirm its lineage can be followed through parents back to a seed, with the operator at each step.",
    dep: ["corpus-store"]
  },
});
