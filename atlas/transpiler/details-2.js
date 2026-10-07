// Details for the transpiler plate, part 2: downleveling, helpers and polyfills, modules, types and markup.
ATLAS.details("transpiler", {
  "class-lowering": {
    s: "Rewrites class declarations into constructor functions with prototype assignments, handling inheritance, super calls, accessors and static members.",
    d: "A class becomes a function for the constructor, with methods assigned to its prototype as non-enumerable properties and static members assigned to the function. Inheritance sets the prototype chain and calls the parent constructor, and super calls become explicit calls with the right receiver. Derived constructors must not touch the instance before the parent returns, and built-in parents such as arrays need special construction. Calling a class without new must throw. Exact behavior has many corners, so a faithful lowering emits helpers and a looser one emits less code.",
    k: ["Faithful lowering with helpers vs loose assignment: faithful keeps enumeration, call checks and descriptors; loose is smaller and faster but differs when code inspects those.", "Lower classes at all vs require a target with classes: lowering reaches old runtimes, but extending built-in types becomes fragile or impossible."],
    p: ["Methods assigned as enumerable properties show up in for-in loops and break code that iterated objects safely before.", "Extending a built-in type such as an error or collection yields an instance with the wrong prototype."],
    v: "Run a fixture with a derived class extending a built-in, with accessors and a static member, in the oldest target. Confirm instanceof, method enumeration and the thrown error for calling without new match the original.",
    dep: ["helper-library", "node-replacement", "scope-tree", "private-fields-lowering"]
  },
  "destructuring-lowering": {
    s: "Expands destructuring patterns in declarations, parameters and assignments into sequences of property and index reads with defaults.",
    d: "Each pattern becomes a series of reads from a temporary holding the value, with default handling where the read is undefined, and rest elements copying the remaining properties. Array patterns use an iterator protocol, not plain indexing, so strings, sets and generators work. Nested patterns recurse. In parameters, defaults and patterns evaluate in a separate scope from the body, which affects closures. Evaluation order must match the original, including when the temporary is created and when getters run. Unique temporaries come from the identifier generator.",
    k: ["Iterator-based array reads vs indexed access: iterators are correct for all iterables; indexing is shorter and faster but wrong for anything that is not an array.", "Temporaries per pattern vs reuse of the source expression: temporaries preserve single evaluation; reuse is smaller but runs side effects twice."],
    p: ["Reading the source expression once per property runs getters or calls repeatedly and changes behavior.", "Parameter patterns lowered into the body change closure and default-value scoping."],
    v: "Destructure from a getter-backed object and from a generator in a function parameter with defaults. Confirm each getter fires once, generators close, and defaults evaluate in order.",
    dep: ["unique-id-generator", "helper-library", "node-replacement"]
  },
  "spread-and-template-lowering": {
    s: "Rewrites spread in calls, arrays and objects, and template literals, into explicit concatenation, array building and helper calls.",
    d: "A spread call becomes an application with an array built from the pieces, preserving the receiver for method calls. Array spread concatenates, using an iterator-aware helper for non-arrays. Object spread becomes a property copy helper that reads own enumerable properties and applies setters or definitions according to the target semantics. Template literals become concatenation with explicit string conversion, and tagged templates call the tag with a cached frozen strings array carrying a raw property. Details like conversion rules for symbols and caching per call site make this more than text substitution.",
    k: ["Helper-based spread vs inline array methods: helpers cover iterables and holes; inline code is smaller but wrong for sets, maps and strings.", "Concatenation operator vs explicit string conversion for templates: the operator is short but calls a different conversion path than templates do, which differs for some values."],
    p: ["Losing the receiver in a spread method call invokes the method with the wrong this.", "Creating a new strings array each time a tagged template runs breaks tags that cache by identity."],
    v: "Spread a set into a method call and a tagged template inside a loop. Confirm this binding is preserved, the set's items arrive, and the tag receives the identical strings array on every iteration.",
    dep: ["helper-library", "node-replacement", "unique-id-generator"]
  },
  "async-lowering": {
    s: "Rewrites asynchronous functions into code that drives a generator or state machine with promises, preserving ordering of awaits and error propagation.",
    d: "An async function body becomes a generator whose yields stand in for awaits, wrapped in a helper that resumes it as each promise settles and returns a promise for the result. Where generators are also unavailable, the body is further lowered into a state machine. Try and finally blocks, loops, arguments and this binding must survive the transformation, and arrow functions capture the outer this. Rejection must become a throw at the await point so catch blocks work. Stack traces and timing of microtask ticks change slightly and are rarely compatible exactly.",
    k: ["Generator plus driver helper vs full state machine: the helper form is compact and readable; the state machine runs where generators do not exist but is much larger and harder to debug.", "Preserve await tick counts vs allow different microtask order: exact timing matches original behavior; relaxing it simplifies the driver but can reorder interleaved async code."],
    p: ["An await inside a finally block resumes with the wrong completion value if the driver mishandles return and throw.", "Using the arguments object inside the generator refers to the generator's arguments, not the original function's."],
    v: "Run a fixture with await inside try, catch and finally, inside a loop and inside an arrow capturing this. Confirm results, rejection routing and the order of interleaved tasks match the original.",
    dep: ["generator-lowering", "helper-library", "scope-tree", "node-replacement"]
  },
  "generator-lowering": {
    s: "Compiles generator functions into explicit state machines with a dispatch loop, so suspension and resumption work without native support.",
    d: "The function body is split at each yield into labeled states. Local variables are hoisted into an enclosing scope so they survive suspension, and control flow such as loops, conditionals and exception handling is flattened into jumps between states with a table of try regions. A runtime object implements next, return and throw by resuming the machine. The transformation must keep scoping correct for closures created in loops and handle yield inside expressions by saving intermediate values. It is among the largest and most error-prone transforms in the pipeline.",
    k: ["State machine in generated code vs delegating to a runtime interpreter: generated code is faster and self-contained; an interpreter is simpler but slower and adds a dependency.", "Hoist all locals vs only those live across a yield: hoisting everything is simple; liveness analysis shrinks state but needs data-flow analysis that must itself be correct."],
    p: ["Closures created in a loop capture a hoisted variable shared by every iteration unless per-iteration copies are made.", "A yield inside a try with finally leaves the finally block unrun when the consumer returns early."],
    v: "Run a generator with loops, nested try and finally, a yield inside a call argument, and early return by the consumer. Confirm the yielded sequence and finally side effects equal native behavior.",
    dep: ["helper-library", "hoisting-analysis", "scope-tree", "unique-id-generator"]
  },
  "optional-chaining-lowering": {
    s: "Rewrites optional member access, optional calls and nullish coalescing into conditional checks that short-circuit the whole chain and evaluate each part once.",
    d: "An optional chain becomes a conditional that tests the base for null or undefined and, if so, yields undefined for the entire remaining chain. Each intermediate value is stored in a temporary so it is evaluated once, and method calls keep their receiver. Nullish coalescing tests for exactly null and undefined, not other falsy values, unlike the or operator. Deleting through an optional chain and parenthesized chains that end short-circuiting have special rules. Output size grows quickly with chain length, so long chains benefit from sharing temporaries.",
    k: ["Temporaries for single evaluation vs repeating the expression: temporaries are correct for side effects and calls; repetition is shorter but evaluates getters and calls twice.", "Test against null and undefined explicitly vs loose equality to null: loose equality is shorter and matches except for one legacy exotic value."],
    p: ["Using a truthiness test instead of a nullish test turns zero and empty string into undefined.", "A method call through an optional chain loses its receiver when the lowering stores only the function."],
    v: "Evaluate a chain with a call counter on each segment, with a null in the middle, and with falsy but non-null values. Confirm each segment runs at most once and zero and empty string pass through.",
    dep: ["unique-id-generator", "node-replacement", "scope-tree"]
  },
  "logical-assignment-lowering": {
    s: "Rewrites logical assignment operators and related compound forms into conditional assignments that evaluate the target reference once and assign only when required.",
    d: "An assignment such as or-equals only writes if the current value is falsy, and the nullish form only if it is null or undefined. The lowering turns it into a short-circuit expression whose right side is an ordinary assignment. The target is a reference that may include computed properties or calls, so the object and key are stored in temporaries first, ensuring they are evaluated once and that no setter runs when no write happens. Related forms, such as exponent operators, take the same treatment, usually mapped to a library call.",
    k: ["Cache the target object and key vs repeat the target expression: caching preserves single evaluation and avoids spurious setter calls; repeating is shorter and wrong for side effects.", "Lower to a conditional statement vs expression: statement form is more readable, but expression form works wherever the original appeared."],
    p: ["A naive rewrite to a plain assignment calls the setter even when the value was already set.", "Evaluating a computed key twice runs a function with side effects twice."],
    v: "Apply the operators to a property with a counting getter, setter and key function. Confirm that when no assignment is needed, the setter count is zero and each key expression runs exactly once.",
    dep: ["unique-id-generator", "node-replacement", "optional-chaining-lowering"]
  },
  "block-scope-lowering": {
    s: "Turns block-scoped declarations into function-scoped ones, renaming to avoid collisions and creating per-iteration copies where closures capture loop variables.",
    d: "Block-scoped declarations become function-scoped declarations, which requires renaming when two blocks use the same name or when the name would shadow or be shadowed incorrectly. Loops whose body creates closures over the loop variable are rewritten so each iteration gets its own binding, typically by moving the body into a function. Temporal dead zone behavior can be emulated with checks or ignored under a looser option. Constants are enforced by throwing on assignment. Break, continue and return inside a moved body must be routed back out.",
    k: ["Emulate temporal dead zone vs ignore it: emulation preserves errors for use-before-definition and costs code and speed; ignoring it is smaller and changes behavior only for buggy programs.", "Per-iteration function wrapper only when closures capture vs always: the conditional form keeps ordinary loops fast but depends on correct capture analysis."],
    p: ["Renaming a shadowed variable misses a reference inside a nested function, so it reads the wrong binding.", "Moving a loop body into a function breaks break, continue and return unless they are translated."],
    v: "Run a loop that pushes closures capturing the loop variable and later calls them, plus a shadowed name in nested blocks. Confirm each closure sees its own value and shadowed references resolve correctly.",
    dep: ["scope-tree", "renamer", "reference-resolution", "hoisting-analysis"]
  },
  "private-fields-lowering": {
    s: "Rewrites private class members into per-class weak maps or uniquely named properties, keeping them inaccessible from outside and enforcing brand checks.",
    d: "Each private field becomes an entry in a weak collection keyed by the instance, or a property with a unique, hidden key. Reads and writes go through helpers that check the receiver was constructed by the class and throw otherwise. Private methods and accessors use a shared brand set. The in operator on private names becomes a membership test. Initialization order, including fields added after parent construction in derived classes, must match the original. Because private names are lexically scoped, nested classes need distinct storage per class declaration.",
    k: ["Weak map per field vs hidden properties: weak maps give true privacy and no property visible to reflection; hidden properties are faster but observable and enumerable by tools.", "Brand check on every access vs only on first: always checking matches original errors; reduced checks are faster and silently allow a foreign object."],
    p: ["Accessing a private field on an object from a different class returns undefined rather than throwing, hiding a real bug.", "Fields initialized in the wrong order relative to the parent constructor see uninitialized state."],
    v: "Access a private field on an instance, on a plain object and on an instance of a subclass defined in another module. Confirm the first works, the second throws the documented error, and the third works.",
    dep: ["class-lowering", "helper-library", "scope-tree", "unique-id-generator"]
  },
  "helper-library": {
    s: "The collection of small runtime functions that generated code calls for operations that syntax alone cannot express, such as inheritance, iteration, spread and async driving.",
    d: "Each helper implements one semantic operation with the exact behavior of the source feature: setting up a prototype chain, driving a generator, copying object properties, checking a brand. Helpers are written once, versioned with the transpiler and available either inline, imported from a runtime package or from a shared module. Transforms refer to helpers by name and request them through the injection mechanism. They must work on the oldest target, so they avoid the very features they replace. Size matters, since they ship to every user.",
    k: ["Many small helpers vs a few general ones: small helpers tree-shake and inline cheaply; general ones reduce count but pull in code a file never uses.", "Helpers written in the output language vs generated per target: handwritten is reviewable and testable on its own; generated adapts to targets but is harder to trust."],
    p: ["A helper that uses a feature missing on the oldest target fails there only, at first call.", "Changing a helper's behavior between versions changes already-compiled libraries that share the runtime."],
    v: "Run each helper's own test suite on the oldest target and confirm that generated code from a fixture calls only helpers present in the shipped library, with matching behavior to native syntax.",
    dep: ["shared-runtime-module"]
  },
  "helper-injection": {
    s: "Adds the helpers a file needs to its output exactly once, as imports or inline definitions, with names that cannot collide with user code.",
    d: "When a transform asks for a helper, the injector records the request per file and, at the end, inserts either an import from the runtime module or a function definition at the top of the file. Repeated requests return the same local name. Names come from the unique identifier generator so they never clash with user bindings, and are added to scope so later passes see them. Module format affects the form of the insertion. When many files each inline the same helper, bundle size grows, which pushes projects toward a shared module.",
    k: ["Import from a shared module vs inline into each file: importing deduplicates across files; inlining leaves output self-contained with no extra dependency.", "Inject at first use vs collect and insert at the end: collecting allows deduplication and ordering; first-use insertion is simple but can produce duplicates and wrong position."],
    p: ["Injected helper names that clash with a user binding in a nested scope cause a call to the wrong function.", "Inlined helpers copied into every file balloon the final bundle."],
    v: "Translate two files that both need the same helper in inline and shared modes. Confirm one definition per file or one import per file, no name clashes with user code, and that a repeated request reuses the name.",
    dep: ["helper-library", "unique-id-generator", "binding-table", "shared-runtime-module"]
  },
  "polyfill-injection": {
    s: "Adds implementations of missing library functions and objects to the output, by importing them or loading them before the program, so newer APIs exist on older targets.",
    d: "Syntax transforms cannot supply a missing method on a built-in object. Polyfills do, by defining it on the global object or a prototype when absent. The transpiler decides which polyfills to add, either as entry imports at the top of the program or as imports inserted where features are used. Choosing the set depends on the target matrix. Polyfills modify shared global state, which is risky for libraries, and some features, such as proxies, cannot be faithfully emulated at all.",
    k: ["Global polyfills vs namespaced imports that leave globals untouched: globals make all code work with no changes; namespaced imports are safe for libraries but require rewriting each use.", "Include everything the target lacks vs only what is used: complete inclusion is safe and large; usage-based inclusion is small but can miss dynamic access."],
    p: ["A library that patches globals overwrites an application's own implementation with a different version.", "Dynamic access such as a computed property name is invisible to usage analysis, so the polyfill is never added."],
    v: "Run a fixture using a missing built-in method in the oldest target with only the injected polyfills. Confirm it works, and that on a modern target no polyfill code is included.",
    dep: ["usage-detection", "feature-matrix", "shared-runtime-module"]
  },
  "usage-detection": {
    s: "Scans the tree for uses of library features, such as method names and built-in objects, and reports which polyfills the code actually needs.",
    d: "The analyzer visits member expressions, calls, new expressions and global references, matches them against known built-ins, and uses scope information to avoid counting user-defined bindings that merely share a name. Method calls on values of unknown type are matched by name only, so it can only be an approximation. The result feeds polyfill injection. Syntax such as iteration, spread and async functions also implies runtime requirements. The tradeoff is precision: over-inclusion bloats bundles, and under-inclusion breaks old targets.",
    k: ["Match method names regardless of receiver vs require a known receiver type: name matching is safe and over-includes; type-aware matching is precise but needs type information that often does not exist.", "Per-file analysis vs whole-program: per-file works with incremental builds; whole-program removes duplicates but needs every file at once."],
    p: ["A user-defined function named like a built-in method triggers an unneeded polyfill.", "Code reached through a dynamic property lookup is not detected, and fails on the old target."],
    v: "Translate a file that uses two built-in methods and defines its own function with a third's name. Confirm exactly the two used polyfills are listed, and the output passes on the oldest target.",
    dep: ["reference-resolution", "feature-matrix", "ast-traversal"]
  },
  "shared-runtime-module": {
    s: "A versioned package of helpers and polyfills that translated code imports, so many files and libraries share one copy rather than each carrying its own.",
    d: "The package exports every helper under a stable path, in forms for each module system. Compiled code imports from it, and bundlers deduplicate the imports. Libraries declare it as a dependency with a version range, so an application ends up with one copy or a few. The package is released in step with the transpiler, because generated code refers to helper names and signatures that must exist. The difficulty is version skew: code compiled by an older version meeting a newer runtime, or the reverse, where a helper is missing.",
    k: ["Runtime as a separate dependency vs inlined helpers: shared reduces total size and allows one fix for everyone; inlined avoids the extra dependency and version-skew problem.", "Strict version coupling vs compatibility promise for helper signatures: strict is simple to reason about; compatibility lets libraries and apps update independently but constrains helper changes."],
    p: ["Two copies of the runtime at different versions mean private-state helpers cannot see each other's data.", "Code compiled with a newer transpiler calls a helper an installed older runtime lacks."],
    v: "Install a library compiled with a newer helper set beside an older runtime and run it. Confirm either it works or the load fails with a clear missing-helper message, not an obscure undefined call.",
    dep: []
  },
  "module-format-conversion": {
    s: "Converts a file between module systems, such as static imports and exports to a callable wrapper with require-style loading, or the reverse.",
    d: "Static module syntax becomes a wrapper that registers exports and loads dependencies through a function call, or the reverse. The converter collects all imports and exports, hoists the loading statements, handles the strict-mode difference, rewrites references to imported names, and sets up the export object. Top-level this, the module-level binding of file name and path, and top-level await differ between systems and need translation or a refusal. The hard part is faithfulness: static modules hoist and link before any code runs, while callable loading is sequential and dynamic.",
    k: ["Convert at build time per file vs leave format conversion to the bundler: per file works for libraries published in a format; delegating avoids duplicate work and gains whole-program optimization.", "Emit strict output always vs preserve source mode: always strict matches static modules; preserving avoids breaking scripts that depend on sloppy-mode behavior."],
    p: ["Top-level this is undefined in static modules but the export object in wrappers, changing code that reads it.", "Top-level await has no equivalent in synchronous wrappers and must be rejected or restructured."],
    v: "Convert a module with imports, default and named exports, and a cycle with another module. Run both formats in a real loader and confirm identical exported values and evaluation order.",
    dep: ["import-export-rewriting", "live-binding-emulation", "default-export-interop", "scope-tree"]
  },
  "import-export-rewriting": {
    s: "Rewrites import and export declarations, and every reference to an imported name, into the access pattern of the target module system.",
    d: "Every imported name becomes a property read on a module object at each use, so later updates from the exporting module remain visible. Export declarations become assignments to the export object, hoisted function declarations are exported at the top, and re-exports forward lazily. Star exports copy or forward names while skipping defaults and local conflicts. Unused imports with side effects remain as bare loads. The renamer must handle identifiers shadowing imported names, so a reference inside a nested function does not wrongly become a property access.",
    k: ["Rewrite each use as a property access vs copy values on import: property access preserves live updates; copying is faster but freezes values at import time.", "Eager loading in order vs lazy forwarding for re-exports: eager matches static ordering; lazy avoids cycles but changes when side effects run."],
    p: ["A local variable that shadows an imported name is rewritten as if it were the import.", "Calling an imported function as a member expression changes its this binding to the module object."],
    v: "Transform a file that imports a function, shadows its name in an inner scope and calls it. Confirm the inner reference stays local, the outer calls resolve, and the called function sees no module object as this.",
    dep: ["reference-resolution", "renamer", "scope-tree"]
  },
  "live-binding-emulation": {
    s: "Keeps exported names live when converting to a system without them, so importers see later reassignments rather than a snapshot taken at load.",
    d: "In static modules an export is a live view of a variable. In a callable wrapper the exporter must update the export object whenever the variable changes. The transform finds every assignment to an exported binding, including increments and destructuring assignments, and adds an export update after it. Importers read through the module object on each use, or use getters defined once. Cycles rely on this: a module can import a binding whose value is not yet set and read it later once it is. Missed assignments produce stale values that depend on load order.",
    k: ["Update the export on every assignment vs define a getter reading the variable: updates are simple and fast to read but must catch every assignment; getters are always right but add a call per read.", "Hoist function exports early vs export when evaluated: hoisting supports cycles that call functions before definition; late export is simpler and breaks them."],
    p: ["An assignment inside a destructuring pattern or loop header is missed, leaving the export stale.", "Exporting function declarations late breaks circular imports that call them during loading."],
    v: "Export a counter and a function that increments it, import it in a second module that reads it after calls, and confirm the importer sees each new value, including in a circular import setup.",
    dep: ["import-export-rewriting", "binding-table", "hoisting-analysis"]
  },
  "default-export-interop": {
    s: "Bridges the mismatch between modules with a default export and callable-format modules that export one value, using flags and wrapper helpers.",
    d: "Static modules have a distinct default export, while older formats assign one value to the module export. When one imports the other, the loader needs to know whether the value is itself a default. Generated code marks converted modules with a flag, and an interop helper wraps imports so default access returns the object when the flag is absent. Namespace imports get a frozen view with a default property. Settings choose strictness. The difficulty is that two correct tools can disagree about the convention, causing one default layer too many or too few.",
    k: ["Mark modules with a flag and wrap on import vs rely on a naming convention: flags are explicit and work across tools; conventions are lighter but break when a tool does not follow them.", "Default as the whole export object vs as a named property: the whole object is natural for single-value modules but cannot combine with named exports."],
    p: ["Importing a default from a module that sets none yields an object with a nested default property instead of the function.", "Two tools that disagree on the flag name produce code that works when built together and fails when separate."],
    v: "Import a single-function callable module and a converted static module from each other's format in a real loader. Confirm the default resolves to the function in all four pairings.",
    dep: ["module-format-conversion", "helper-library", "import-export-rewriting"]
  },
  "dynamic-import-lowering": {
    s: "Rewrites dynamic import expressions into promise-returning loads in the target system, with correct namespace objects and error behavior.",
    d: "A dynamic import returns a promise for the module namespace. In a callable format it becomes a promise that resolves to the interop-wrapped result of loading the file, deferring the load until the promise is created, not at call time. Specifiers can be computed, so static analysis cannot find the dependency, and bundlers need hints to split code. Errors in loading must become rejections, not synchronous throws. The lowering must also preserve that the specifier is evaluated at the call and that resolution is relative to the importing file.",
    k: ["Lower to a callable load wrapped in a promise vs keep native syntax: lowering works on targets without it; keeping it lets loaders do real asynchronous splitting.", "Evaluate the specifier before the promise vs inside it: before matches original timing and errors; inside is simpler but delays or changes where failures appear."],
    p: ["A synchronous throw from the load escapes instead of becoming a rejected promise.", "Relative specifiers resolve against the wrong directory after the file is moved by a bundler."],
    v: "Dynamically import a module that does not exist and one that does. Confirm a rejected promise for the first, a namespace object with expected exports for the second, and that load timing is after the call.",
    dep: ["module-format-conversion", "default-export-interop", "helper-library"]
  },
  "type-stripping": {
    s: "Removes type annotations, interfaces, type aliases and other type-only syntax, leaving plain code without running a type checker.",
    d: "The parser accepts an extended grammar that includes annotations. The stripper deletes anything with no runtime meaning: annotations on variables, parameters and returns, interface and alias declarations, generic parameters, assertion expressions, and modifiers such as access levels and optional markers. It does not check types, so it is fast and works on one file at a time. Constructs that look like types but affect runtime, such as parameter properties, enums and decorators, need real transformation. The tool must keep line numbers aligned or update the map accordingly.",
    k: ["Strip without type checking vs check first: stripping is fast and parallel per file; skipping the check means errors appear only in a separate step that must be run.", "Replace removed text with whitespace vs delete and remap: whitespace keeps positions and avoids needing a map; deletion gives smaller output and needs mapping."],
    p: ["Parameter properties in constructors are dropped as pure type syntax, and the field assignments they implied disappear.", "Treating a generic call as a comparison operator, or the reverse, mis-parses and corrupts valid code."],
    v: "Strip a file that mixes annotations, an interface, an assertion and a parameter property. Confirm the output parses as plain code, runs equal to the type-checked build, and original line numbers still line up.",
    dep: ["parser-core", "type-only-import-elision"]
  },
  "type-only-import-elision": {
    s: "Removes imports and exports that are used only as types, since a single-file tool cannot know whether an imported name is a value or a type.",
    d: "An import that is only used in type positions would load a module for nothing, or fail, if the name exists only as a type. A full compiler knows which names are values. A per-file transformer does not, so it guesses from usage: names never referenced in value positions are dropped. Explicit type-only markers on imports and exports remove the guess. Re-exports of types are the hardest case, since the name cannot be seen as a type from one file. A setting can preserve all imports for their side effects.",
    k: ["Elide by usage within the file vs require explicit type-only markers: usage analysis works on existing code; markers are exact and cheap but must be added by authors.", "Keep unused imports for side effects vs drop them: keeping preserves load-time behavior; dropping is smaller and can change when initialization code runs."],
    p: ["A re-exported type is kept as a value export, and the loader fails because no such binding exists.", "Dropping an import that was only used as a type also drops a needed side effect of loading that module."],
    v: "Translate a file importing a type, a value used as a type, and a module for its side effects. Confirm loading output keeps only what is needed and a real loader runs without a missing-export error.",
    dep: ["type-stripping", "reference-resolution", "binding-table"]
  },
  "jsx-transform": {
    s: "Expands embedded markup expressions into calls to a factory function, with children, attributes, fragments and spread props converted to arguments.",
    d: "Each element becomes a call whose first argument is the tag, either a string for built-ins or a reference for components, followed by props and children. Attributes become object properties, spread attributes merge, and text children are trimmed by whitespace rules that are easy to get wrong. Fragments use a separate marker. Newer output modes call dedicated functions that take keys separately and import them automatically from a configurable package. Development mode adds source location data. The transform must treat lowercase and uppercase tag names differently, and member-expression tags specially.",
    k: ["Classic factory calls vs automatic import runtime: classic works with any factory but requires it in scope; automatic imports the right functions and shrinks code but binds output to one package layout.", "Include development metadata vs omit: metadata gives better warnings and locations; omitting is smaller and faster in production output."],
    p: ["Trimming whitespace in text children inconsistently changes rendered output between the source and the result.", "A component name written in lowercase is treated as a string tag and rendered as an unknown element."],
    v: "Translate elements with mixed text and expression children, a spread attribute, a fragment and a member-expression tag. Confirm the factory calls produce the same rendered tree as the reference output.",
    dep: ["parser-core", "node-builders", "helper-injection"]
  }
});
