// Details for the configuration management plate, part 2: configuration language, modules and reuse.
ATLAS.details("config-management", {
  "declarative-syntax": {
    s: "The language form in which desired state is written: statements of what should exist and how it should look, not step-by-step instructions for reaching it.",
    d: "Programs consist of resource declarations and relationships among them, with order of statements mostly irrelevant. The compiler builds a graph from them rather than executing top to bottom. Some systems use a purpose-built language, others use a data format with embedded expressions or a general-purpose language as a library. Declarative form makes plans analyzable and repeatable. It becomes hard where real configuration needs sequence, loops and conditions, and every language drifts toward becoming a general-purpose one with odd restrictions.",
    k: ["Purpose-built language vs data format with expressions: purpose-built gives clear semantics and good errors; a data format is familiar but turns logic into awkward string tricks.", "Strictly declarative vs allowing imperative escapes: strictness keeps plans analyzable; escapes handle real cases but hide behavior from the planner."],
    p: ["Authors rely on statement order that the compiler does not guarantee, and the plan works until an unrelated edit reorders it.", "Logic grows inside the language until configuration code is untestable programs in a poor language."],
    v: "Reorder two independent resource statements in a file and confirm the compiled plan for a test node is identical, with the same dependency edges and the same final order.",
    dep: ["parser-and-validator"]
  },
  "resource-declarations": {
    s: "The statements that name a thing to manage, its type, its identity and its desired properties, such as a file with given content and mode or a service that should be running.",
    d: "A declaration has a type, a unique title or key, and a set of attributes. Types define which attributes exist and which are required. The title identifies the resource for dependency references and reports, and the compiler rejects two declarations for the same resource in conflicting forms. Declarations are the unit the engine converges, reports on and orders. They are hard to get right because identity is subtle: the same file declared in two modules, or a package named differently by platform, creates conflicts or duplicates.",
    k: ["Unique titles enforced at compile time vs last declaration wins: enforcement catches conflicts early but forces coordination; last-wins is flexible and hides collisions.", "Attributes required by type vs defaults everywhere: required attributes make intent explicit; defaults make code shorter but behavior implicit."],
    p: ["Two modules declare the same package, and a compile error appears only on nodes that include both.", "A default for an attribute changes in a new module version, and thousands of resources change behavior silently."],
    v: "Declare the same file twice with different content and confirm compilation fails naming both locations, and that fixing it yields a plan with exactly one file resource.",
    dep: ["declarative-syntax", "resource-abstraction"]
  },
  "variables-and-types": {
    s: "Named values and their declared shapes, so code can take parameters, reject wrong input early, and make the data it expects explicit.",
    d: "Variables hold strings, numbers, booleans, lists and maps, set from node data, facts or code. Optional type annotations on parameters check values at compile time, so an invalid port or a missing required map key fails with a message rather than producing a broken file. Scoping rules decide what a name refers to inside nested modules. The difficulty is that data arrives from many sources, some untyped, and dynamic scoping or silent coercion make errors appear far from their cause.",
    k: ["Typed parameters vs untyped: types catch bad data before it reaches a node; untyped code is shorter and accepts anything, including mistakes.", "Lexical scope vs dynamic scope: lexical is predictable from reading the code; dynamic lets values flow implicitly but changes behavior depending on the caller."],
    p: ["A string of the number eight is compared with the number eight, and a condition silently takes the wrong branch.", "An undefined variable evaluates to empty and writes an empty value into a production file."],
    v: "Pass a text value where a port number is required, compile, and confirm compilation fails with an error naming the parameter, expected type and the data source, before any node is contacted.",
    dep: ["declarative-syntax", "hierarchical-data-lookup"]
  },
  "conditionals": {
    s: "Branches in code that choose different resources or values based on facts, data or earlier results, such as different packages per platform.",
    d: "Conditions test facts about the node, values from data or the presence of other resources, and select which declarations enter the plan. They run at compile time, so the plan for each node contains only the branches that apply. The compiler therefore needs facts before it can compile. Overuse is the main hazard: heavy branching on operating system, role and environment multiplies code paths, and many of them are never exercised by tests, so errors appear only on the node type that takes the rarely used branch.",
    k: ["Branch on facts in code vs resolve differences in data: facts in code are explicit; data-driven differences keep code simple and let operators change behavior without code edits.", "Compile-time conditions vs run-time checks: compile-time gives a clean plan; run-time checks see the live state but hide the plan's shape."],
    p: ["A branch for an uncommon platform has never been compiled in testing and fails the first time such a node appears.", "A condition tests for a fact that is missing on new nodes, and takes the default branch wrongly."],
    v: "Compile the same code for two test nodes with different platform facts and confirm each plan contains only its own branch's resources, and compile a node with the fact missing to see a clear failure.",
    dep: ["facts-collector", "variables-and-types"]
  },
  "loops-and-iteration": {
    s: "Constructs that repeat a declaration or a computation over a list or map, so a hundred similar resources come from one statement and a data list.",
    d: "Iteration expands at compile time: for each user, site or mount in the data, the compiler emits a resource with generated titles. This keeps the data as the single place to add an item. The language provides map, filter and reduce style functions in addition to loops over declarations. The difficulty is resource identity: generated titles must be unique and stable, because reordering the list or renaming an element changes titles and appears to the engine as deleting one resource and creating another.",
    k: ["Iterate over data lists vs write each resource out: iteration keeps one definition and many items; explicit resources are greppable and easy to read.", "Keyed maps vs positional lists: keys give stable identity when items move; lists are simpler but identity shifts with position."],
    p: ["Inserting an item at the front of a list renumbers titles and recreates every later resource.", "An empty list silently produces no resources, and a missing data entry looks the same as an intentional one."],
    v: "Compile a plan from a list of three users, then add a fourth and remove the first, and confirm the plan changes by exactly one added and one removed account with other titles unchanged.",
    dep: ["resource-declarations", "variables-and-types"]
  },
  "functions-and-lookups": {
    s: "Built-in and user-defined functions that compute values, query data, join or format strings, and fetch values from data sources at compile time.",
    d: "Functions handle formatting, string manipulation, hashing, merging data maps, and looking up values in the hierarchy or an external store. User-defined functions put shared logic in one place. Functions run in the compiler, not on nodes, so they must be deterministic and must not touch the network without care. The difficulty is purity: a function that reads a clock or a remote service makes the same input compile to different plans, which breaks caching and makes problems hard to reproduce.",
    k: ["Pure functions only vs allowing side effects: purity keeps compilation cacheable and reproducible; side effects enable useful lookups but break both.", "Many built-ins vs a small core with libraries: many built-ins are convenient; a small core is easier to learn and keep stable."],
    p: ["A lookup function calls an external service during compile, and an outage there breaks every node's run.", "A random value generated in code changes on every compile and rewrites a file on each run."],
    v: "Compile the same node twice with identical inputs and confirm the two plans are byte-for-byte equal, including every value produced by functions.",
    dep: ["hierarchical-data-lookup", "variables-and-types"]
  },
  "templating-engine": {
    s: "Renders configuration files from templates by inserting values, conditions and loops, so one template yields a different correct file for each node.",
    d: "A template is a file with placeholders and control tags. The renderer supplies variables from data and facts and produces final file content, which the file resource compares with what is on the node. Rendering can happen on the server or on the node; server-side keeps data off the node but requires the server to hold everything, while node-side lets the node add local facts. Templates are hard because they generate files in other languages: whitespace, quoting and escaping errors produce files that look right and fail at load.",
    k: ["Render on the server vs on the node: server rendering keeps data central and reports exact content; node rendering sees live local state but ships data to every node.", "Logic-heavy templates vs logic in code with simple templates: heavy templates are flexible but untestable; simple templates keep logic where tests exist."],
    p: ["Unescaped values insert a quote or newline into the target format and break the service on restart.", "A template renders differently depending on trailing whitespace, and a harmless edit rewrites every file in the fleet."],
    v: "Render a template for a test node and validate the output with the target program's own syntax checker, then change one variable and confirm only the expected line differs.",
    dep: ["variables-and-types", "file-provider"]
  },
  "parser-and-validator": {
    s: "Reads configuration code, rejects syntax and type errors with located messages, and checks references and attributes before the code is allowed near a node.",
    d: "The parser builds a syntax tree, and a validator checks that resource types exist, attributes are valid, referenced resources are declared and parameter types match. Running it in a pre-commit hook or review pipeline catches mistakes in seconds. Error messages must give file and line. Some checks need data and facts, so full validation requires compiling against sample nodes. It is hard because the dynamic parts, such as lookups and conditions, can only be checked with realistic inputs, which means the quality of test data determines the checker's value.",
    k: ["Static checks only vs compile against sample nodes: static is fast and needs no data; compiling samples catches real failures but requires representative facts.", "Strict failures vs warnings: strictness keeps bad code out; warnings let legacy code continue but accumulate."],
    p: ["Validation passes because the sample nodes do not include the unusual node that takes the broken branch.", "Warnings about deprecated syntax are ignored until a language upgrade turns them into errors on the whole fleet."],
    v: "Introduce a reference to an undeclared resource and a misspelled attribute, run the validator, and confirm both are reported with file and line and that the exit status is nonzero.",
    dep: []
  },
  "modules": {
    s: "A self-contained package of configuration code, templates, data defaults and facts for one concern, such as a web server or a time service, with a defined interface.",
    d: "A module groups the resources and logic to manage one thing, exposes parameters, and ships its own templates and default data. Other code uses it by declaring it with parameters rather than copying it. Good modules are narrow, have sane defaults, and work across supported platforms. The difficulty is the interface: parameters become a contract, and every added option is something to maintain, while modules that try to expose every setting end up as a thin wrapper over the underlying configuration language.",
    k: ["Narrow modules vs broad ones: narrow modules compose and are easy to test; broad ones are convenient but accumulate options and platform branches.", "Own the whole file vs expose fragments: owning the file gives clear semantics; fragments allow shared files but need ordered assembly."],
    p: ["A module's default quietly differs from the vendor's, and every consumer inherits a setting nobody chose.", "Two modules each manage part of the same configuration file and overwrite each other on alternate runs."],
    v: "Apply a module to a clean test node on each supported platform and confirm the service runs with default parameters, then run again and confirm zero changes.",
    dep: ["resource-declarations", "precedence-rules"]
  },
  "roles-and-profiles": {
    s: "A layering convention in which a node has one role describing its purpose, a role is made of profiles, and profiles use modules, keeping site-specific choices out of reusable code.",
    d: "Modules are generic and shared. Profiles configure modules the way this organization wants, choosing parameters and wiring technologies together. A role is a list of profiles that makes a business purpose, and each node gets exactly one. The layers give a simple answer to what is this machine: its role. Hard parts are discipline and granularity: a profile for every small variation multiplies files, while too few profiles push conditions into code, and nodes needing two roles break the one-role rule.",
    k: ["One role per node vs composing several: one role is easy to reason about and report; several allow flexibility but make behavior harder to predict.", "Profiles in a shared repository vs per team: shared gives consistency; per team gives autonomy and divergence."],
    p: ["A node needs a small variation and gets a new role that copies an existing one, and the copies drift.", "Profiles hold many parameters inline instead of in data, so changing a value requires a code release."],
    v: "Assign a node its role, compile the plan, and confirm the resource list equals the union of the role's profiles, with no resources from any other role.",
    dep: ["modules", "node-classifier"]
  },
  "defined-types": {
    s: "User-defined resource types and macros that wrap several resources into one reusable declaration with parameters, such as a virtual host or a user with its keys and home directory.",
    d: "A defined type takes a title and parameters, and expands into the underlying resources each time it is declared. It lets code declare many instances with different data, and each instance is a first-class resource with its own identity in reports. Unlike a module, it is meant to be declared repeatedly. The complexity is expansion: dependencies on an instance must apply to everything inside it, and a bug in the expansion multiplies across every instance on every node.",
    k: ["Defined types vs loops over raw resources: defined types give names and dependencies at the right level; loops are simpler but flatten structure.", "Rich parameters vs several narrow types: rich parameters reduce the number of types; narrow types stay understandable."],
    p: ["Inner resources use fixed titles, so two instances collide on the second declaration.", "A relationship to the instance does not reach its inner resources, and ordering silently breaks."],
    v: "Declare a defined type twice with different titles on a test node, and confirm both instances appear in the report with distinct inner resources, and that a change in one does not alter the other.",
    dep: ["resource-declarations", "loops-and-iteration"]
  },
  "module-registry": {
    s: "A central store of published modules with versions and metadata, from which teams fetch shared code, internal or external, with checks on what they depend on.",
    d: "Modules are published as versioned archives with a manifest listing dependencies and supported platforms. A dependency resolver builds the set of versions a repository needs, and a lockfile or equivalent records them. Internal registries host the organization's code and proxy external modules after review. It is hard because external modules are code that runs as root on every node, so pulling one is a supply chain decision, and version constraints that are too loose pull in untested changes.",
    k: ["Public registry directly vs an internal mirror: direct is convenient; a mirror gives review, availability and protection from removed or replaced versions.", "Resolve at deploy vs lock in the repository: resolving gives latest fixes; locking makes deployment reproducible."],
    p: ["A new release of a transitive dependency changes behavior across the fleet at the next deploy.", "An upstream module is removed or changed in place, and builds break or silently differ."],
    v: "Clone the repository on a clean machine, resolve dependencies, and confirm the exact module versions and checksums match the lock record used by the last production deploy.",
    dep: ["version-pinning", "modules"]
  },
  "version-pinning": {
    s: "Fixes the exact version of every module, template set and data source a node uses, so changes are deliberate and a previous state can be rebuilt.",
    d: "Pinning names the commit or release of each module in the environment definition, and promotion moves a pin from a test environment to production. It makes it possible to say which code ran on which node, and to roll back by restoring earlier pins. The trade-off is staleness: a pinned module misses fixes, and updating many pins at once is its own risk. Frequent small updates with automated tests are the usual remedy, but only if tests actually cover the behavior that matters.",
    k: ["Exact pins vs ranges: exact pins make runs reproducible; ranges pick up fixes automatically but make the plan depend on when it was compiled.", "One pin set for all environments vs per environment: one set keeps environments identical; per environment allows staged rollout."],
    p: ["Pins are never updated, and a security fix in a module sits unadopted for a year.", "Production pins differ from the tested set because someone updated them directly."],
    v: "Roll one production environment back to its previous pin set, run a node, and confirm its report shows the earlier commit and its resource states match the earlier release.",
    dep: ["version-control-integration"]
  },
  "precedence-rules": {
    s: "The defined order in which defaults, role data, node data, overrides and command-line values win when the same setting is given in several places.",
    d: "Settings can come from module defaults, shared data, environment data, group data and per-node overrides, and the system defines which wins and how maps and lists combine: replace, merge or append. A clear rule, such as most specific wins, lets operators predict outcomes. Tools should show the winning source for a value. Precedence becomes hard when merging is deep or when several mechanisms, such as class parameters and external data, each have their own rule and interact.",
    k: ["Most specific wins vs most recently defined wins: specificity is predictable from names; recency depends on file order and is fragile.", "Deep merge vs replace: deep merge reduces repetition but makes removing an inherited key impossible; replace is explicit and repetitive."],
    p: ["An override set long ago on one node keeps winning after the group value is changed, so the node alone does not get the fix.", "A list is appended, not replaced, and the node gets duplicate entries."],
    v: "Set one value at three levels, ask the system to explain the value for a test node, and confirm it names the winning level and that removing that level exposes the next one.",
    dep: ["hierarchical-data-lookup"]
  },
  "module-testing": {
    s: "Automated tests that compile modules for sample nodes and then, on disposable machines, apply them and check the resulting state, including that a second run changes nothing.",
    d: "Two levels exist. Unit tests compile the module against fact sets and assert which resources appear, quickly and without nodes. Acceptance tests provision a container or virtual machine per supported platform, apply the module, check ports, files and services, and apply again to prove idempotence. Running them in the review pipeline keeps changes safe. They are hard because real platforms are slow to provision, because applying code that changes the network can lock out the test machine, and because passing on a clean machine says little about nodes with years of accumulated state.",
    k: ["Compile-only tests vs applying on real machines: compile-only is fast and runs everywhere; applying finds provider and ordering bugs that compile cannot see.", "Fresh machines vs upgraded machines in tests: fresh is simple; upgraded machines reproduce the leftover state that production nodes have."],
    p: ["A module passes on a clean image and breaks on production nodes that already have a conflicting configuration.", "Tests omit the second run, so a resource that changes on every run goes unnoticed."],
    v: "Apply a module in a disposable machine, check the service answers on its port, apply again, and confirm the second run reports zero changed resources.",
    dep: ["modules", "idempotence-and-convergence", "apply-loop"]
  },
  "linting-and-style": {
    s: "Static checks and formatting rules applied to configuration code to catch likely mistakes and keep a large shared codebase consistent.",
    d: "Linters flag unquoted values, unused variables, deprecated syntax, missing defaults and risky patterns such as world-writable modes or commands that run on every run. A formatter fixes layout so reviews focus on meaning. Both run in editors, pre-commit hooks and the review pipeline. They help most on shared code with many authors. The limit is that a linter checks form, not behavior: code that passes every rule can still delete the wrong directory, so linting complements tests and review but cannot replace them.",
    k: ["Strict enforced rules vs advisory ones: enforced rules keep quality uniform; advisory rules avoid blocking urgent changes but get ignored.", "Organization-specific rules vs the standard set: custom rules encode local lessons; standard rules need no maintenance."],
    p: ["Teams disable a noisy rule globally, and the one real defect it caught is no longer caught.", "Formatting-only changes touch every file and bury the meaningful diff in review."],
    v: "Commit a file containing a known risky pattern, such as a command with no guard, and confirm the pipeline fails with the rule name and line, then passes after the fix.",
    dep: ["parser-and-validator"]
  }
});
