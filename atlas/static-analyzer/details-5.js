// Details for the static analyzer plate, part 5: representations, incremental execution, storage and control.
ATLAS.details("static-analyzer", {
  "abstract-syntax-tree": {
    s: "The tree of syntactic constructs with source ranges, used for pattern matching, local checks and as the starting point for all other representations.",
    d: "Nodes represent declarations, statements and expressions with child links, parent links and exact source spans. Visitors and pattern matchers walk it. Rules that need only the shape of code, such as banned calls or missing braces, run directly on it. Lowering passes build graphs and intermediate forms from it. Trees are often immutable and shared between runs. The hard part is size and fidelity: a tree with full trivia is large, and one without it cannot support exact fixes.",
    k: ["Concrete tree with trivia vs abstract tree without: concrete supports exact edits and suppressions and uses more memory; abstract is compact and loses formatting.", "Parent pointers vs top-down only: parents make upward queries easy and complicate sharing and immutability."],
    p: ["Two language versions produce structurally different trees for the same code, so a pattern matches in one and not the other.", "Holding every file's tree in memory for a large repository exhausts the machine."],
    v: "Round-trip a corpus of files through the tree and printer and confirm byte-identical output, and check that every node's range is contained in its parent's.",
    dep: ["parser-frontend"]
  },
  "control-flow-graph": {
    s: "A graph of basic blocks and the possible transfers between them, including branches, loops and exceptions, on which flow analyses iterate.",
    d: "Straight-line code is grouped into blocks, with edges for conditional and unconditional jumps. Loops appear as cycles. Short-circuit operators, switch statements, finally clauses and exceptions all create edges that must be modeled. Edges may be labeled with conditions for path-sensitive use. Dominance information computed on the graph underlies many transformations. The hard part is completeness of rare edges, such as exceptions in every call, or computed jumps, and the size of the graph for huge generated functions.",
    k: ["Model exceptional edges from every call vs only explicit throws: every call is sound and enlarges the graph; explicit only is small and misses cleanup bugs.", "Block-level vs statement-level nodes: blocks are compact and need in-block replay; statement nodes are simpler and large."],
    p: ["Missing edges for exceptions make resource leaks on error paths invisible.", "A switch with fall-through is built with the wrong edges, so facts flow to a case that cannot be reached."],
    v: "Build graphs for a set of functions containing each control construct, and confirm blocks, edges and reachability match hand-drawn expected graphs, with all blocks reachable from entry except known dead code.",
    dep: ["abstract-syntax-tree","intermediate-representation"]
  },
  "ssa-form": {
    s: "A form in which each variable is assigned exactly once and merges are explicit, making value flow visible and many analyses simpler and sparser.",
    d: "Every assignment creates a new version of a variable, and at control-flow merges special join operations select among incoming versions. Uses refer directly to one definition, so def-use information is implicit and analyses can follow values along sparse edges instead of through every statement. Construction uses dominance frontiers. Memory is usually treated separately because pointer writes do not fit simple versioning. The hard part is the cost and complexity of building it and mapping findings back to the original variables.",
    k: ["SSA for scalars only vs memory SSA too: scalar-only is simple and ignores heap effects; memory SSA captures them with extra constructions.", "Build SSA up front vs on demand: up front is uniform; on demand saves time for functions few analyses touch."],
    p: ["Names in SSA do not match source names, so messages read as incomprehensible temporaries.", "Join operations at loop headers are omitted for variables not obviously modified, and a later definition is missed."],
    v: "Convert functions to SSA and confirm every use has one definition that dominates it and every variable is assigned once; convert back or evaluate on test inputs and confirm results are unchanged.",
    dep: ["control-flow-graph","intermediate-representation"]
  },
  "intermediate-representation": {
    s: "A simplified, uniform instruction form that lowers the many source constructs into a few operations, so that analyses are written once and not for every syntactic form.",
    d: "Lowering turns nested expressions into three-address instructions, makes implicit operations explicit, such as conversions, bounds checks and destructor calls, and normalizes loops and switches into branches. It retains links to source ranges. Typed forms keep type information for pointer and type-based analyses. Analyses work on this form because it has a manageable number of instruction kinds. The hard part is faithfulness: lowering must preserve semantics, including evaluation order and exceptions, and must keep enough source mapping to report meaningful locations.",
    k: ["Typed IR vs untyped low-level IR: typed keeps type-based checks and structure; untyped is simple and loses source-level facts.", "Lower early vs keep high-level constructs: early lowering shrinks the instruction set and loses patterns such as loops; late lowering keeps structure and widens each analysis."],
    p: ["Lowering reorders operations inside an expression, and a check appears to run before the value it guards.", "Source ranges are lost for compiler-generated instructions, so findings point to no line."],
    v: "Lower a test suite and execute the lowered form with a reference interpreter, and confirm identical results to the original semantic expectation; check every instruction has a source range or a recorded generated flag.",
    dep: ["abstract-syntax-tree","name-and-type-resolution","symbol-table"]
  },
  "symbol-table": {
    s: "The index of every named entity with its kind, type, scope, definition site and references, queried by resolution, call graph construction and cross-file analysis.",
    d: "Entries record functions, classes, fields, variables and types, together with where they are declared and used. Cross-file tables link declarations to definitions across translation units, and export tables summarize what a module offers to others. Lookups by qualified name, and reverse lookups from definition to all uses, support both resolution and reporting. The table is a major shared cost in large repositories. The difficulty is consistency: when a file changes, all dependent entries must be refreshed or invalidated.",
    k: ["Global in-memory table vs persisted sharded index: in-memory is fastest and bounded by memory; persisted scales to monorepos and costs lookup time.", "Store full signatures vs hashes: full signatures aid explanation and use space; hashes are compact and hide names in debugging."],
    p: ["Two definitions with the same qualified name in different build targets collide and one is dropped.", "Stale entries survive a deleted file and cause calls to resolve to code that no longer exists."],
    v: "Index a repository, delete a function and re-index incrementally, and confirm lookups for it fail and every former caller is reported unresolved without any stale entry remaining.",
    dep: ["name-and-type-resolution","fact-store"]
  },
  "def-use-chains": {
    s: "Explicit links from each definition of a value to every use it can reach, built from reaching definitions or SSA, and used for sparse propagation and slicing.",
    d: "For every assignment the chain lists the statements that may read it, and for every use the definitions that may supply it. Sparse analyses follow these links instead of visiting every statement between, which cuts work greatly for facts that matter to few statements. They also answer questions such as every place this value goes. Memory definitions need alias information to be linked correctly. The difficulty is maintenance: chains are large for long procedures, and must be updated or rebuilt when code changes.",
    k: ["Precomputed chains vs on-demand queries: precomputed is fast to traverse and uses memory; on demand costs time per query and saves space.", "Include memory definitions vs scalars only: including memory is complete and depends on alias analysis; scalars-only is cheap and misses heap flows."],
    p: ["A pointer write is not linked to later reads through aliases, so taint is dropped at that point.", "Chains for a huge function use more memory than the rest of the analysis combined."],
    v: "For a function with branches and loops, compare computed chains with hand-derived ones and confirm every use has at least one definition or is reported as an uninitialized read.",
    dep: ["reaching-definitions","ssa-form","alias-queries"]
  },
  "program-dependence-graph": {
    s: "A graph combining data dependence and control dependence between statements, showing which statements can influence which, used for slicing and implicit-flow analysis.",
    d: "Data edges come from def-use links; control edges connect a statement to the branch conditions that decide whether it executes. Walking backward from a statement yields its backward slice: everything that may affect it, which helps both analysis and explanation of a finding. Interprocedural versions add parameter and call edges. Slices on real code are often huge, because nearly everything depends on something through a loop or condition. The hard part is size and usefulness: slices that cover most of the program explain nothing.",
    k: ["Include control dependence vs data only: including it captures branch influence and enlarges slices; data-only slices are small and miss implicit effects.", "Build whole-program graph vs per-procedure with summary edges: whole-program is simple and large; summary edges compose well and need more construction logic."],
    p: ["Slices include nearly the whole module, so the trace shown to the developer is useless.", "Missing control dependence on exceptional exits omits statements that decide whether cleanup ran."],
    v: "Compute the backward slice of a known statement in a small program and confirm it equals the hand-derived set, and report the average slice size on a real module as a size check.",
    dep: ["control-flow-graph","def-use-chains"]
  },
  "code-property-graph": {
    s: "A single graph merging the syntax tree, control flow and data dependence, so queries can mix structure, flow and data in one traversal.",
    d: "Nodes are syntax elements and edges come in several kinds: syntactic nesting, control flow, data dependence and call relationships. Queries traverse any mix, such as a call whose argument is reached by data from a parameter through a branch. The graph is stored in a database or in memory for the query engine. It supports flexible rule writing and ad-hoc investigation. The hard parts are build cost and size, which are several times the tree's, and ensuring all edge kinds are consistent with one another.",
    k: ["One combined graph vs separate graphs linked on demand: combined makes queries simple and storage large; separate graphs are modular and need joins in the query layer.", "Whole-repository graph vs per-module graphs: whole-repository allows cross-module queries and large builds; per-module is incremental and cannot see across."],
    p: ["Edge kinds are built with different assumptions about aliasing, so queries mixing them give contradictory answers.", "Building the graph for the monorepo takes longer than the rest of the pipeline."],
    v: "Run a documented set of queries over a sample project with known answers, and confirm each result set equals the expected one, including a query that crosses syntax, control flow and data edges.",
    dep: ["abstract-syntax-tree","control-flow-graph","program-dependence-graph","call-graph-construction"]
  },
  "change-detection": {
    s: "Finds which files, and which facts derived from them, changed since the last analysis, using content hashes and the build's own dependency information.",
    d: "The detector compares content hashes or version-control diffs to a recorded snapshot. A changed file invalidates its facts. It then follows dependency edges to find units whose analysis could change, such as files that include it or call into it. It also tracks changes that are not in source: the analyzer version, rule versions, configuration and build flags. The hard problem is correctness: missing a dependency leaves stale results, and invalidating too much loses the benefit.",
    k: ["Content hashes vs timestamps: hashes are exact and cost reading files; timestamps are cheap and change without edits or fail to change after checkouts.", "Compare against last run vs against the target branch: last run is fast for local work; target branch gives results relevant to a pull request."],
    p: ["A change to a configuration file does not invalidate cached results, and old findings persist.", "A header edit invalidates every file that includes it, so a one-line change reanalyzes the repository."],
    v: "Change one file's content and confirm exactly that file and its true dependents are reanalyzed; change only the configuration and confirm all results are invalidated.",
    dep: ["unit-dependency-tracking","source-snapshot-access"]
  },
  "fact-cache": {
    s: "Stored results of earlier analysis, such as parse results, summaries and findings per unit, keyed so that unchanged units are not analyzed again.",
    d: "Entries are keyed by content hash of the unit plus tool version, rule set and relevant configuration, so any difference produces a miss. The cache can be local, shared by a team or held in a remote service for CI. Values include trees, fact sets and summaries. Eviction keeps it bounded. A hit saves most of the cost of a run, which matters most for pull requests. The hard parts are key completeness, since an omitted input produces wrong hits, and the cost of moving large cached data over a network.",
    k: ["Local cache vs shared remote cache: local is fast and private to one machine; remote shares work across CI workers and developers and adds latency and trust concerns.", "Cache findings vs cache intermediate facts: findings are small and cannot be reused after rule changes; intermediate facts are large and serve many rules."],
    p: ["The key omits an environment-dependent flag, so a hit returns results from a different configuration.", "A poisoned entry from a faulty run is served to every later run."],
    v: "Run twice on unchanged code and confirm the second run takes cache hits for every unit with identical findings; modify the rule set and confirm all affected entries miss.",
    dep: ["change-detection","fact-store"]
  },
  "unit-dependency-tracking": {
    s: "Records which analysis units depend on which others, so that when one changes, exactly the units whose results could differ are recomputed.",
    d: "During analysis, every use of another unit's information is recorded: a symbol resolved from a header, a summary applied at a call, a type read from another module. The recorded edges form a dependency graph. Fine-grained dependencies track individual symbols or summaries, so a change to an unused function does not invalidate callers. The graph is stored with the cache. It is hard because under-recording yields stale results and over-recording defeats the purpose, and the graph must stay accurate across many analyses.",
    k: ["Fine-grained symbol dependencies vs file-level: symbol-level is precise and costly to record; file-level is simple and invalidates broadly.", "Record dependencies during analysis vs derive from build metadata: recording is accurate to what was read; derived edges are cheap and over-approximate."],
    p: ["An analysis reads a fact without recording the dependency, so a later change does not trigger recomputation.", "A widely used utility file makes every unit depend on it, and any edit invalidates everything."],
    v: "Modify a function's body without changing its summary and confirm callers are not reanalyzed; modify its summary-relevant behavior and confirm all callers are.",
    dep: ["symbol-table","procedure-summaries"]
  },
  "incremental-solver": {
    s: "Updates fixed-point results after small changes by reprocessing only affected parts, instead of solving the whole analysis from scratch.",
    d: "When a function changes, its facts are recomputed and the change is propagated through dependents only if its output differs. Solvers keep their worklist state and facts between runs, and reuse everything in unaffected regions. Some formulations use datalog-style evaluation, where deleting and adding base facts yields derived changes. Deletions are the hard part: retracting a fact requires knowing what else depended on it. A wrong incremental update gives results that differ from a fresh run, which should never happen.",
    k: ["Maintain solver state across runs vs recompute from cached summaries: kept state is fastest and large to persist; summaries are compact and coarser in granularity.", "Support retraction exactly vs recompute affected regions: exact retraction is efficient and difficult to get right; recomputing regions is simple and slower."],
    p: ["A retracted fact that was derived through two paths is deleted, and a result that still holds disappears.", "State from a previous run in a different configuration is reused and produces mixed results."],
    v: "After a series of random edits, compare incremental results to a from-scratch analysis of the final code and confirm they are identical for every edit sequence tested.",
    dep: ["worklist-solver","unit-dependency-tracking","fact-cache"]
  },
  "diff-scoped-analysis": {
    s: "Analyzes only what a change touches, and reports only findings relevant to it, so that pull-request feedback arrives quickly and is about the change.",
    d: "The diff identifies changed functions. The analysis recomputes those and their dependents, using cached facts for the rest. Findings are filtered to those on changed lines, or whose trace passes through changed code, or which did not exist on the base. This keeps run time proportional to the change and output proportional to what the author can act on. The hard part is the effects at a distance: a change to a sanitizer or a callee can create a finding in untouched code, which a changed-lines filter hides.",
    k: ["Report only on changed lines vs on anything the change affects: changed lines is quiet and misses distant effects; affected-code reporting is thorough and noisy.", "Analyze changed files only vs changed plus dependents: changed only is fastest and incomplete; with dependents is correct and larger."],
    p: ["A change removes a sanitizer in a helper, and flows in unchanged callers are never reported.", "The base used for comparison is out of date and old findings appear as new."],
    v: "Open a pull request that removes a sanitizer used by an unchanged caller and confirm the resulting new finding is reported with a trace through the changed line.",
    dep: ["change-detection","incremental-solver","baselines"]
  },
  "parallel-scheduler": {
    s: "Distributes analysis work across cores or machines, respecting dependencies between units, while keeping results independent of scheduling.",
    d: "Units with no unfinished dependencies are placed on a work queue consumed by workers. Parse and per-file checks are independent and parallel; summary computation follows the call graph order. Large units are split or given priority to avoid a long tail. Workers share a fact store or merge their results at the end. The difficulties are load imbalance, memory per worker, and keeping the result identical regardless of how many workers run or in what order they finish.",
    k: ["Threads in one process vs multiple processes: threads share memory cheaply and a crash or leak affects all; processes isolate and duplicate data.", "Dynamic work stealing vs static partitioning: dynamic balances uneven units and is nondeterministic unless results are canonicalized; static is predictable and leaves workers idle."],
    p: ["One huge function keeps a single worker busy while all others finish and sit idle.", "Each worker loads its own copy of shared type data, and memory use multiplies by the core count."],
    v: "Run the same analysis with one, four and thirty-two workers and confirm identical result logs, with speedup near the expected fraction for each count and no worker idle for long.",
    dep: ["summary-computation-order","fact-store","determinism-and-reproducibility"]
  },
  "monorepo-sharding": {
    s: "Splits a very large repository into independently analyzed pieces along build or ownership boundaries, then merges results, so the work fits machines and time limits.",
    d: "A planner groups files into shards by build target, directory or dependency cluster, keeping tightly coupled code together. Each shard runs on its own worker with the facts it needs from other shards available as summaries or interface data. Results are merged. Cross-shard flows need those summaries or are missed. Shard plans must be stable between runs so caches stay useful. The hard part is boundary quality: bad cuts break flows and good cuts are hard to find automatically.",
    k: ["Shard by build target vs by directory: build targets follow real dependencies and require build metadata; directories are simple and cut across dependencies.", "Share summaries across shards vs analyze each in isolation: shared summaries preserve cross-shard flows and add ordering dependency; isolation is parallel and blind at the borders."],
    p: ["A flow that crosses two shards is never found because neither has the other's summaries.", "Shard assignment changes with every run, and the cache gets no hits."],
    v: "Seed a flow crossing a shard boundary and confirm it is found in sharded mode as in whole-repository mode; run twice and confirm identical shard assignments and cache hits.",
    dep: ["parallel-scheduler","procedure-summaries","result-merging","build-and-target-model"]
  },
  "fact-store": {
    s: "The persistent, queryable storage for extracted facts, summaries and results, holding data larger than memory and shared between analysis phases and runs.",
    d: "Facts are stored as relations or keyed records on disk or in a service, indexed for the access patterns of analyses: by symbol, by file, by call site. Writes are batched from workers, and reads are memory-mapped or cached. The store supports versioning by content hash so stale facts are never read. Compact encodings keep size down, as facts for a large repository reach gigabytes. The hard part is the mix of heavy parallel writes, point reads and bulk scans with consistency across crashes.",
    k: ["Embedded local store vs networked service: embedded is simple and fast for one machine; a service allows sharing across workers and adds operations and latency.", "Relational facts vs opaque serialized blobs: relations support ad-hoc queries and cost space and write time; blobs are fast and cannot be inspected."],
    p: ["A crash during write leaves a partial entry that later runs read as valid.", "Many workers write the same key concurrently and one overwrites the other with a different version."],
    v: "Kill the writer process during a bulk write, restart, and confirm the store either contains the complete batch or none of it, and that a verification pass finds no corrupt entries.",
    dep: ["source-snapshot-access"]
  },
  "source-snapshot-access": {
    s: "Gives the analyzer a consistent, read-only view of the source at one specific revision, independent of what is happening in the working tree.",
    d: "The snapshot comes from a version-control checkout, an export or a virtual filesystem keyed by revision. All files read during a run are from that revision, including headers and generated files that are produced beforehand. Paths are normalized relative to the repository root, and content hashes are available for cache keys. For editor use, unsaved buffers overlay the snapshot. The hard parts are generated files, which exist only after a build, and keeping many revisions available cheaply for pull-request runs.",
    k: ["Full checkout per run vs shared virtual filesystem: checkout is simple and slow for big repositories; a virtual filesystem is fast to mount and an extra component to run.", "Include generated files by building first vs excluding them: building is complete and expensive; excluding is fast and breaks references to generated code."],
    p: ["The working tree changes during a long run, so files read early and late come from different states.", "Line endings are rewritten by checkout settings, so file hashes and locations differ between machines."],
    v: "Record the revision and a tree hash in the result log, modify the working tree during a run, and confirm results correspond exactly to the recorded revision.",
    dep: []
  },
  "resource-budgets": {
    s: "Hard limits on time, memory and work per file, function or run, enforced so a pathological input cannot stop the analysis or the machine.",
    d: "Budgets are set at several levels: total run, per translation unit, per function and per solver query. Work-based counters, such as number of iterations or states, are preferred to wall time for reproducibility. When a budget is hit, the analysis stops for that scope, records the event and falls back to a cheaper mode. Memory is watched by estimating state size and by process limits. The hard part is choosing values that protect the pipeline without cutting off ordinary large functions.",
    k: ["Per-scope budgets vs one global limit: per-scope budgets isolate a bad function and need tuning; a global limit is simple and one case starves the rest.", "Work counters vs time: counters are reproducible and need instrumentation; time is simple and varies across machines."],
    p: ["A budget is hit silently and the file is reported clean with no indication that analysis was cut short.", "Limits tuned on a developer laptop are far too tight on a loaded CI worker."],
    v: "Run on a synthetic function designed to blow up the analysis and confirm it stops at the limit, a result notification names the function and budget, and other functions complete normally.",
    dep: []
  },
  "analysis-timeouts-and-fallbacks": {
    s: "The behavior when an analysis cannot finish within its budget: abandon, degrade to a cheaper analysis, or report partial results, always with an explicit record.",
    d: "On a timeout the engine can drop the function from deep analysis and apply a conservative summary, switch from a precise domain to a coarse one, or return only findings already confirmed. Each choice has a different effect on soundness and noise. The fallback is recorded as a notification in the result log and counted in metrics. Policies decide whether partial analysis fails the gate. The difficulty is making degradation graceful and visible, as silent loss of coverage is the most dangerous failure for a tool whose clean result implies safety.",
    k: ["Degrade precision vs skip the unit: degrading keeps coverage with more noise; skipping is quiet and leaves the unit unchecked.", "Fail the gate on timeouts vs pass with a warning: failing keeps guarantees and blocks on slow code; warning keeps flow and hides coverage loss."],
    p: ["Timeouts accumulate on a growing module, and coverage falls without anyone seeing it.", "A fallback summary treats an unanalyzed function as harmless, and flows through it are missed."],
    v: "Force a timeout on a chosen function and confirm the result log carries a notification naming it, the fallback used is recorded, and the coverage metric on the dashboard drops accordingly.",
    dep: ["resource-budgets","procedure-summaries","sarif-style-log"]
  },
  "plugin-loader": {
    s: "Loads rule packs, checkers, frontends and models from outside the core at startup, with versioned interfaces and isolation, so third parties can extend the analyzer.",
    d: "Plugins are discovered from configured locations, checked for compatible interface version and signature, and registered with the engine. They may supply rules, library models, frontends or output formats. The loader enforces limits on what a plugin may access, and reports failures without aborting unrelated analysis. Dependencies of plugins must not conflict with those of the core. The hard part is stability of the extension interface and the trust boundary: a plugin runs with the analyzer's permissions.",
    k: ["Dynamic loading in process vs separate process plugins: in-process is fast and unsafe; separate processes isolate and add communication cost.", "Strict interface version match vs compatibility ranges: strict avoids subtle breakage and forces upgrades; ranges ease updates and risk misbehavior."],
    p: ["A plugin built for an older interface loads and misreads data structures, producing wrong results rather than an error.", "A plugin from an untrusted source reads files and secrets available to the analysis job."],
    v: "Load a plugin with a mismatched interface version and confirm a clear refusal naming both versions, and load a crashing plugin and confirm the run continues and records the failure.",
    dep: []
  },
});
