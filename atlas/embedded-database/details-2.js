// Details for the embedded database plate, part 2: SQL front end, planner, code generation, virtual machine.
ATLAS.details("embedded-database", {
  "tokenizer": {
    s: "Splits SQL text into tokens by hand-written character classification, recognizing keywords, identifiers, literals, operators and comments, with keyword fallback for names.",
    d: "The tokenizer reads one token at a time from the statement text using a character class table and returns a token code and length to the parser. Keywords are found by a perfect-hash lookup. Many keywords may also serve as identifiers, so the parser can tell the tokenizer to fall back when a keyword appears where a name is expected. Strings, quoted identifiers in several quote styles, blobs and numeric forms are handled here. It is hard because SQL has quoting quirks, a double-quoted string that is silently treated as a literal, and must never read past the end of the buffer.",
    k: ["Hand-written tokenizer vs generated lexer: no tool dependency and a tiny, fast, easily audited routine, but quoting rules are maintained by hand.", "Keyword fallback to identifiers vs reserved words: old schemas with column names like key or order keep working, but the grammar grows ambiguities."],
    p: ["A double-quoted word with no matching column is silently accepted as a string literal, hiding typos.", "Unterminated strings or comments at the end of input must produce an error, not a read beyond the buffer."],
    v: "Feed the tokenizer a statement with every quote style, an embedded NUL, and an unterminated comment and confirm the token stream matches expectation and the last case yields a clean syntax error.",
    dep: []
  },
  "parser-grammar": {
    s: "A table-driven LALR parser generated from a compact grammar file that recognizes the SQL dialect and builds tree nodes through semantic actions.",
    d: "A small parser generator turns the grammar into tables and a driver loop that shifts tokens and reduces rules. Reduction actions build expression, select and statement nodes, and call routines for DDL such as table and index creation. The grammar is the single definition of the dialect, including its extensions and deviations from the standard. Errors report the offending token. It is difficult to keep the grammar unambiguous and the parser re-entrant and bounded in stack depth, since deeply nested input is a classic attack.",
    k: ["Generated table-driven parser vs recursive descent: the grammar is declarative and easy to audit, while error messages are less tailored.", "Fixed maximum depth for expressions vs unbounded: a limit stops stack exhaustion from hostile SQL, but legitimate machine-generated queries can hit it."],
    p: ["Deeply nested parentheses or compound selects can exhaust stack or tree memory without an enforced depth limit.", "Adding a grammar rule can quietly create conflicts that change how existing statements parse."],
    v: "Parse a statement with thousands of nested parentheses and confirm the parser stops at the configured depth with an error and constant memory, while an ordinary statement still parses.",
    dep: ["tokenizer", "parse-tree"]
  },
  "parse-tree": {
    s: "The in-memory representation of a statement: expression nodes, select nodes with source lists, and structures for table, column and index definitions.",
    d: "Nodes hold operators, literals, column references, function calls and subselects, plus flags the later passes fill in. A select is a node with a result list, a source list of tables or subqueries, a where clause, grouping, ordering and limits, and a link to its compound partner. The tree is allocated from the connection's memory and freed in one pass at the end of preparing. Passes rewrite it in place. The hard part is correctness under mutation: flattening and view expansion rewrite nodes that other pointers still reference.",
    k: ["Mutable tree rewritten in place vs immutable stages: little copying and low memory, but passes depend on strict ordering and a bug corrupts later passes.", "Single allocator arena vs individual frees: freeing is fast and leak-free on error paths, but memory peaks for large statements."],
    p: ["Rewriting a shared subtree twice, once for a view and once for a trigger, double-frees or duplicates side effects.", "Large generated statements with thousands of terms can use far more memory than the text size suggests."],
    v: "Prepare a statement with a very large IN list under a memory limit and confirm it fails cleanly with an out-of-memory error and no leaked allocation after finalize.",
    dep: ["parser-grammar", "memory-allocator"]
  },
  "name-resolution": {
    s: "Binds every identifier in the tree to a table, column, alias or function, resolving ambiguity and recording which tables an expression depends on.",
    d: "The resolver walks each select with its scope of source tables, matching unqualified names against columns, applying aliases and handling correlated references to outer queries. It checks function names and argument counts, expands star into column lists and tags expressions with their source cursor. Errors such as ambiguous or unknown columns are raised here. It is hard because scoping rules interact with views, common table expressions and subqueries, and because the answer depends on the schema loaded at that moment.",
    k: ["Resolve once before planning vs resolve during codegen: the planner gets complete dependency information, but the tree must hold resolved forms that cost memory.", "Lenient alias use in clauses vs strict standard scoping: many queries work as written, but some behave differently from other engines."],
    p: ["An unqualified name matching columns in two joined tables resolves differently after a column is added, silently changing a query's meaning or turning it into an error.", "Correlated references in deeply nested subqueries resolve to the wrong scope when alias names repeat."],
    v: "Join two tables that share a column name, run an unqualified reference and confirm an ambiguity error; qualify it and confirm the intended column is returned.",
    dep: ["parse-tree", "schema-load", "scalar-functions"]
  },
  "view-and-cte-expansion": {
    s: "Replaces references to views and common table expressions with their defining subqueries before planning, so the planner sees one query and can optimize across the boundary.",
    d: "A view name in a source list is replaced by its stored select, parsed from the schema text, as a subquery. Common table expressions are handled the same way, and recursive ones are compiled into a queue-driven loop. After expansion, flattening may merge the subquery into the outer query. A CTE referenced twice may be materialized once instead of expanded twice. The hard parts are recursion limits, name capture, and deciding when to materialize versus inline.",
    k: ["Inline expansion vs materialization: inlining lets predicates push down and indexes be used, while materializing avoids recomputation when a CTE is used many times.", "Views stored as text vs parsed form: the stored text survives engine upgrades but is reparsed on every schema load."],
    p: ["A view that references a dropped table fails only when queried, not when the table is dropped.", "A recursive CTE without a terminating condition runs until it hits a limit or fills the disk."],
    v: "Query a view with an indexed filter and confirm in the EXPLAIN output that the base table index is used, showing the filter pushed through the view.",
    dep: ["name-resolution", "subquery-flattening", "schema-table"]
  },
  "trigger-compilation": {
    s: "Compiles trigger bodies into separate sub-programs that the main program calls around each affected row, with access to the old and new row values.",
    d: "When a statement modifies a table with triggers, the generator finds the matching triggers by event and timing and compiles each body as its own program, cached on the connection. The main program calls it with a frame containing the old and new values. Statements inside the trigger are compiled like any other, with their own constraint checks and nested triggers, up to a recursion limit. It is hard because triggers can modify the same table, raise errors that abort the outer statement, and make the true cost of a statement hard to see from its text.",
    k: ["Compile each trigger as a subprogram vs inline the body: subprograms are compiled once and keep the main program small, while inlining would remove call overhead but duplicate code.", "Row-level triggers only vs also statement-level: simple and uniform, but bulk operations pay per-row overhead for logic that could run once."],
    p: ["Recursive triggers can loop until the nesting limit, aborting a large statement after much work.", "A trigger that raises an error rolls back only the current statement, which surprises code expecting the whole transaction to be undone."],
    v: "Create an after-insert trigger that writes to a log table, insert a thousand rows in one statement and confirm the log has a thousand rows and that an error raised in the trigger undoes that statement's inserts.",
    dep: ["statement-code-generator", "trigger-frames", "name-resolution"]
  },
  "where-clause-analysis": {
    s: "Breaks the WHERE and ON expressions into terms joined by AND, classifies each by the tables and operators it involves, and marks which can drive an index lookup.",
    d: "The planner splits conjunctions into terms and records, for each, the set of tables it uses and whether it has the form column-operator-expression. It adds derived terms: transitivity across equalities, a range implied by a pattern match, and a term from a between expression. Terms from outer joins are kept distinct from filtering terms. This analysis produces the candidate constraints that index selection considers. It is hard because many equivalent rewrites exist, and a wrong rewrite near an outer join changes results.",
    k: ["Derive extra terms vs use terms as written: derived terms unlock more indexes and better join orders, but each derivation must respect null semantics and outer joins.", "Analyze once into a term table vs reanalyze per join order: one pass is cheap, but the planner must keep consistent masks of which tables each term needs."],
    p: ["Pushing a term from a where clause onto an outer join's right side changes results because unmatched rows are filtered differently.", "A column wrapped in an expression or a function hides a usable constraint, so a query that looks indexed scans the table."],
    v: "Run a join with a transitive equality, such as a equal to b and b equal to a constant, and confirm in the EXPLAIN output that the constant constrains both tables' lookups.",
    dep: ["name-resolution", "parse-tree"]
  },
  "index-selection": {
    s: "For each table in a candidate join order, picks the access path: full scan, rowid lookup, or an index equality or range prefix, with covering use when possible.",
    d: "For every table the planner considers each index and counts how many leading columns are constrained by equality, whether a range follows, and whether the index also contains every needed column so the table need not be touched. It produces a loop description with an estimated row count and cost. It also considers using an index only to satisfy ordering. It is hard because the choice is made from term shapes and a few statistics rather than from data distribution, and a small estimate error flips the plan.",
    k: ["Heuristic prefix matching with coarse statistics vs full histograms: no statistics to maintain and plans stay stable, but skewed data can choose a poor index.", "Prefer covering indexes: avoids the extra table lookup for each row, but wide indexes cost space and write time."],
    p: ["An index on a low-cardinality column can be chosen over a better one when statistics are missing.", "A type or collation mismatch between column and compared value disables the index, silently turning a lookup into a scan."],
    v: "Create two candidate indexes, run EXPLAIN QUERY PLAN and confirm the chosen index; run the analyze command and confirm the plan changes when statistics make the other index better.",
    dep: ["where-clause-analysis", "cost-model", "index-btree"]
  },
  "join-order-search": {
    s: "Searches for the sequence of tables in the nested loops with the lowest estimated cost, using a bounded path search rather than exhaustive enumeration.",
    d: "Joins are executed as nested loops, so the planner picks which table is outermost and which inner. It keeps a small set of best partial plans for each prefix length and extends them one table at a time, keeping only the cheapest few, which bounds the work for many-table joins. It accounts for constraints that require a table to follow another, such as outer joins and correlated subqueries. Hard because cost estimates are rough and the search space grows factorially, so pruning must not discard the plan that would have won.",
    k: ["Bounded multi-path search vs exhaustive dynamic programming: planning time stays low even for large joins, but the best plan can be missed.", "Nested loops only vs hash and merge joins: simple execution that relies on indexes, but joins without a usable index must be helped by an automatic index."],
    p: ["Joins of many tables with weak statistics can pick an order that is thousands of times slower than the best.", "Rewriting a query to change table order in the text rarely helps, but the unlikely-hint functions can override estimates."],
    v: "Join three tables of very different sizes with indexes, check that the EXPLAIN output puts the smallest filtered table outermost, and compare runtime with a forced reverse order.",
    dep: ["index-selection", "cost-model", "table-statistics"]
  },
  "cost-model": {
    s: "Estimates the cost of each plan as rows visited, index lookups and sorting work, using logarithmic row-count scales and a handful of fixed assumptions.",
    d: "Costs are kept as small logarithmic numbers so that multiplying row counts becomes addition. A full scan costs the table size, an index lookup costs a descent plus the rows matched, a sort costs a function of its input. Assumptions fill in what is unknown: an equality on an unindexed column keeps a fixed fraction of rows, a range roughly a quarter. Statistics, when present, replace these defaults. The hard part is that errors compound across a join, so the model aims to rank plans sensibly, not to predict time.",
    k: ["Fixed default selectivities vs sampling at plan time: plans are deterministic and cheap to produce, but the defaults are wrong for atypical data.", "Logarithmic cost units vs exact estimates: arithmetic is simple and overflow-proof, but small differences are not representable."],
    p: ["Assuming the cost number is a time or row prediction leads to wrong tuning conclusions.", "Constants tuned for an old storage speed lead to scan-versus-index choices that no longer match modern devices."],
    v: "On a table with skewed values, compare estimated rows from EXPLAIN with actual counts before and after collecting statistics, and confirm that the estimate moves toward the actual count.",
    dep: ["table-statistics"]
  },
  "table-statistics": {
    s: "Optional per-index counts, gathered by an analyze command and stored in an ordinary table, giving the planner the average rows per key prefix.",
    d: "Running the analyze command scans tables and indexes and writes into a statistics table the row count and, for each index, the average number of rows sharing each leading-column prefix. The values are loaded when the schema loads and consumed by index selection. There are no histograms, so skew remains invisible. A pragma allows a bounded analysis with sampling during optimization. It is hard because statistics go stale, and because loading them is part of the schema load that every new connection pays.",
    k: ["Average-per-prefix only vs histograms: the table is tiny and stable, but heavily skewed keys are estimated by the average.", "Manual or periodic analysis vs automatic maintenance: no background work in a library without threads, but staleness is the host's responsibility."],
    p: ["Statistics gathered on an empty or test database are copied to production and mislead plans.", "A bulk load after analysis leaves statistics describing a table a tenth of its size."],
    v: "Load a table, run analyze, read the statistics table to confirm a row exists for each index, then confirm a query plan uses the more selective index.",
    dep: ["index-btree", "schema-load"]
  },
  "automatic-indexes": {
    s: "When a join has no usable index, the planner may build a temporary index on the inner table for the duration of the query, trading build time for repeated lookups.",
    d: "If the cost estimate says scanning the inner table for each outer row is worse than building an index once, the plan includes an ephemeral index on the join column, filled by a pass over the inner table and discarded at the end. The index lives in a temporary tree, possibly spilling to a temp file. This makes some missing-index joins fast without schema changes. The hard part is that it hides a missing permanent index: the work repeats on every execution of the statement.",
    k: ["Build a temporary index vs nested scan: large inner tables become fast at the cost of an upfront build, but small tables lose to the build overhead.", "Enabled by default vs opt-in: queries work without tuning, but developers do not notice that a permanent index is missing."],
    p: ["A frequent query silently rebuilds the same temporary index on every run, wasting time and temp space.", "On very large inner tables, the build exhausts temp storage."],
    v: "Join two unindexed tables, confirm EXPLAIN QUERY PLAN reports an automatic index, then create the permanent index and confirm the plan changes and the runtime drops.",
    dep: ["join-order-search", "cost-model", "index-btree"]
  },
  "subquery-flattening": {
    s: "Rewrites a query that selects from a subquery into one flat query over the underlying tables when the rewrite is provably equivalent, letting the planner optimize them together.",
    d: "If a subquery in a from clause satisfies a long list of conditions, for example no aggregate, no limit mixed with joins in unsafe ways, and compatible join types, its tables are merged into the outer query and its result columns substituted by their expressions. Compound selects and views follow similar rules. Related rewrites turn exists and in subqueries into joins, push where terms into subqueries, and remove unused columns. The difficulty is that every rule has edge cases around nulls and outer joins, so each is guarded by conditions.",
    k: ["Aggressive flattening with many guard rules vs evaluating subqueries as written: much better plans for layered queries, but each rule is a place for subtle wrong results.", "Materialize a subquery vs flatten: materialization is safe and cheap when reused, while flattening lets indexes and ordering flow through."],
    p: ["A rewrite that is correct for inner joins gives wrong results when the same shape appears on the right side of an outer join.", "Flattening a subquery with a nondeterministic function evaluates it a different number of times."],
    v: "Run a query over a subquery with an indexed filter, confirm EXPLAIN shows a single loop nest on the base table, and compare results against the unflattened form with the optimization disabled.",
    dep: ["view-and-cte-expansion", "where-clause-analysis", "parse-tree"]
  },
  "sort-avoidance": {
    s: "Detects when rows will arrive already in the requested order or grouping, because of the chosen index or loop order, so no sort or temporary structure is needed.",
    d: "After choosing loops, the planner checks whether the output order of the outermost loops matches the order-by or group-by terms, considering equality constraints that make columns constant and collation agreement. If so, no sorter is generated, and a limit can stop early. It can also choose a plan whose order satisfies the sort even if its raw cost is higher. When rows cannot be ordered, partial ordering may reduce sort work. The difficulty is matching ordering across collations, descending columns and null placement exactly.",
    k: ["Choose a plan for its order vs for its lookup cost: a slightly costlier access path may remove a large sort and enable early exit, but needs an estimate of the sort it avoids.", "Exact order match only vs partial order reuse: the strict rule is simple, while partial reuse sorts in smaller batches but is more complex."],
    p: ["Using a different collation in the query than in the index makes the sort necessary and the index useless for ordering.", "Order by on an expression that does not match an indexed expression sorts everything."],
    v: "Run a query with ORDER BY on an indexed column and LIMIT, confirm the plan shows no sorter, and measure that only a few rows are read from the table.",
    dep: ["index-selection", "collations", "external-sorter"]
  },
  "statement-code-generator": {
    s: "The top-level routines that turn a resolved and planned statement into a complete bytecode program, including transaction start, schema checks and a final halt.",
    d: "For each statement kind the generator emits a prologue that begins a read or write transaction, verifies the schema cookie, and takes needed table locks, then the body from the specialized generators, then a halt. Jump targets are symbolic labels allocated as the program is built and patched to addresses when it is finished. Registers and cursors are numbered here. Programs for DDL also update the schema table. It is hard because one program must be correct under every error and rollback path, so abort exits must be threaded through all generated code.",
    k: ["Labels patched at the end vs backpatching as emitted: code can be emitted in natural order with forward jumps, but the program is invalid until finalized.", "One program per statement vs shared subprograms: each statement is self-contained and cacheable, but repeated logic is compiled again."],
    p: ["A missed schema-cookie check in a generated prologue lets a statement run against an altered schema.", "An error exit that skips cleanup leaves a cursor open or a lock held."],
    v: "Prepare an insert, dump its program with EXPLAIN, and confirm it begins with a write-transaction opcode, verifies the schema cookie, and ends with a halt reachable from every branch.",
    dep: ["select-loop-generation", "dml-codegen", "bytecode-program"]
  },
  "expression-codegen": {
    s: "Compiles expression trees into register operations: arithmetic, comparison, logic, casts, function calls and subquery evaluation, including three-valued null logic.",
    d: "Each expression compiles to code that leaves its result in a register. Constants may be loaded once outside loops. Comparisons apply affinity conversions to operands first. Boolean tests compile to conditional jumps instead of materializing values when used in a where clause. Subqueries become subprograms run once or per row depending on correlation. The difficulty is null semantics and affinity: each operator has rules for null and for mixed types that must be encoded in the opcode and its flags.",
    k: ["Jump-based boolean evaluation vs materialized booleans: no value is built for filters and short-circuiting is natural, but the code for each test is generated in two forms.", "Hoist constants out of loops vs recompute: less work per row, but needs analysis that an expression has no row dependency."],
    p: ["Applying affinity to the wrong operand changes comparison results for text that looks numeric.", "A function with side effects hoisted out of a loop runs once instead of per row."],
    v: "Evaluate comparisons of null, integer, text and blob values against a truth table of three-valued results and compare each result with the documented rules.",
    dep: ["comparison-and-coercion", "scalar-functions", "registers-and-value-cells"]
  },
  "select-loop-generation": {
    s: "Emits the nested loops for a select: open cursors, seek by the planned index, test remaining terms, then output rows through sorting, grouping, distinct or limit logic.",
    d: "For each table in the planned order the generator emits a loop head that positions a cursor through a seek or a scan start, tests constraints not consumed by the index, and calls the inner loop; after the innermost body it advances. The body writes result registers directly, or feeds a sorter, a distinct set, an aggregate accumulator or a temporary table. Outer joins add a flag so unmatched rows emit nulls. It is hard because the many combinations of grouping, distinct, compound selects and limits each change where code is placed.",
    k: ["Direct nested loops vs materializing intermediate results: constant memory and streaming output, but a subquery used twice may be recomputed.", "Stream results to the caller vs collect first: first rows arrive immediately, but locks and cursors stay open while the caller reads."],
    p: ["A limit applied after a sorter still sorts all rows when the sort could not be avoided.", "Left joins with filters in the wrong clause produce rows that should have been excluded."],
    v: "Run a three-way join with a limit of ten, confirm the first rows arrive without reading all inputs, and confirm the EXPLAIN output shows the nested loop structure with the seeks planned.",
    dep: ["join-order-search", "index-selection", "cursor-table", "external-sorter"]
  },
  "dml-codegen": {
    s: "Generates code for insert, update, delete and upsert: finding rows, running constraint checks and triggers, writing the table row and every affected index entry.",
    d: "An insert evaluates values, checks constraints and writes the record into the table tree and one entry into each index. Update and delete first collect the affected row keys, sometimes into a temporary set, to avoid modifying what the scan is reading, then process them. Conflict clauses, such as replace or ignore, change what happens when a constraint fails. An upsert turns a conflict into an update. It is hard because the same row change must stay consistent across the table, indexes, foreign keys and triggers, in a defined order.",
    k: ["Collect row keys first vs update during the scan: the two-pass approach avoids rows visited twice, while the one-pass plan is faster when the scan cannot be disturbed.", "Replace-on-conflict as delete plus insert vs in-place update: simple semantics, but triggers and rowids behave as a deletion followed by a new row."],
    p: ["Updating an indexed column during a scan of that index can visit the same row twice without the two-pass plan.", "A replace conflict resolution deletes the old row without firing delete triggers unless recursive triggers are on."],
    v: "Update a column that is part of the index used to find the rows and confirm each row is changed exactly once, and the index and table match under the integrity check.",
    dep: ["constraint-checks", "table-btree", "index-btree", "trigger-compilation"]
  },
  "constraint-checks": {
    s: "Compiled checks for not null, check expressions, uniqueness, primary keys and foreign keys, with a conflict policy that decides whether to abort, roll back, fail, ignore or replace.",
    d: "Before writing, the generated code tests each applicable constraint. Not-null and check constraints are expression tests. Uniqueness is tested by seeking the index for an existing equal key. Foreign keys are checked by lookups in the parent or child table, immediately or deferred to commit with a counter. On violation the conflict policy selects an outcome. It is hard to get the order right: the checks must run before any change that cannot be undone within the statement, and the statement journal covers the rest.",
    k: ["Check before writing vs write then detect: failing early avoids undoing work, but the check and the write can then disagree if something changes in between within a statement.", "Immediate vs deferred foreign keys: immediate gives instant error locality, deferred permits temporary violations inside a transaction at the cost of a counter checked at commit."],
    p: ["A unique index comparison treats nulls as distinct, so a unique column can contain many nulls, surprising users.", "A foreign key declared while enforcement is off is not enforced until the setting is turned on, and existing violations are never rechecked."],
    v: "Insert a duplicate into a unique index with each conflict policy and confirm the outcomes (abort, ignore, replace) leave the table and index in the documented state.",
    dep: ["dml-codegen", "index-btree", "foreign-key-enforcement", "halt-and-statement-rollback"]
  },
  "explain-output": {
    s: "A prefix that makes a statement return its program or its high-level plan as rows instead of running it, so developers can see loops, indexes and sorts.",
    d: "The bytecode form lists each opcode with its operands and comment, exactly as the virtual machine would run it. The query-plan form summarizes the planner's decisions: which table is scanned or searched with which index and constraints, where a temporary index or sorter is used, and the nesting of loops. Both are produced by the same code path as normal compilation, so they show what would actually run. It is hard because the plan text is a human aid, not a stable interface, and the opcode listing changes between versions.",
    k: ["Show the real program vs a separate description: the output cannot drift from execution, but it is verbose and tied to internals.", "Human-readable plan strings vs structured output: easy to read in a shell, but tools must parse text that may change."],
    p: ["Scripts that parse plan text break when wording changes in a new release.", "Running explain on a different connection or schema than production shows a different plan."],
    v: "Run the query-plan form on a join and confirm it names an index for each searched table; then execute the same query and confirm timing matches the plan's description.",
    dep: ["statement-code-generator", "index-selection"]
  },
  "bytecode-program": {
    s: "A linear array of fixed-size instructions, each an opcode with a few integer operands, plus a constant pool, that completely describes how to run one SQL statement.",
    d: "An instruction holds an opcode and up to five operands that name registers, cursors, jump targets or constants. The program is created once per statement and is immutable while running. It contains opcodes for opening cursors, seeking, reading columns, arithmetic, comparisons, jumps, building and inserting records, and yielding rows. Operands can include pointers to collation or function structures. Because the instruction set is the contract between compiler and machine, it can change freely between versions. The hard part is that one flawed jump target corrupts execution.",
    k: ["Register bytecode vs a tree-walking interpreter: loops run without recursion or tree traversal and can be inspected and cached, but a code generator and a printable form must be maintained.", "Compile to bytecode vs to native code: the program is portable and small, but each instruction pays dispatch overhead."],
    p: ["A mistake in a jump address makes a rare branch run the wrong instruction stream and corrupt a write.", "A program compiled for one schema version run against another silently misreads columns without the cookie check."],
    v: "Dump a program with EXPLAIN for a simple select and confirm every jump target is within the program and every opened cursor is closed or ended by a halt.",
    dep: ["statement-code-generator", "registers-and-value-cells"]
  },
  "instruction-dispatch": {
    s: "The interpreter loop that fetches the next instruction, switches on its opcode and runs the operation, with checks for interrupts, errors and the next result row.",
    d: "A large switch over the opcode runs each instruction and sets the program counter. Hot paths such as column reads, seeks, comparisons and record building are tuned. At designated points the loop checks an interrupt flag and calls the progress hook. When a result-row opcode executes, the loop returns to the caller, remembering its position, and resumes on the next step. Errors jump to a common exit that rolls back the statement. The hard parts are keeping each opcode correct under out-of-memory, I/O errors and corrupted data, and keeping the loop fast.",
    k: ["Single switch dispatch vs threaded code: portable, compact and easy to reason about, but with less branch prediction than direct-threaded designs.", "Check interrupts only at loop jumps vs every instruction: negligible overhead, but a single long instruction such as a big sort cannot be interrupted."],
    p: ["An opcode that does not handle an out-of-memory result continues with a null pointer.", "Corrupt database content can drive the interpreter into impossible states unless every read is validated."],
    v: "Run a long query, set the interrupt flag from another thread and confirm the query stops within a short time and the statement is rolled back cleanly.",
    dep: ["bytecode-program", "registers-and-value-cells", "cursor-table"]
  },
  "registers-and-value-cells": {
    s: "The machine's working storage: an array of value cells that each hold a null, integer, float, text, blob or pointer, with flags that say what the cell currently contains.",
    d: "Each register is a small structure holding a value, its length, flags for which representations are valid, an encoding, and possibly a destructor. A cell can hold both the integer and text form of a number to avoid repeated conversion. Text and blob values may point into a page in the cache rather than being copied, as long as the page stays referenced. The same structure represents bound parameters and function arguments. Memory management is hard: values may borrow from pages, and an ownership mistake corrupts or leaks.",
    k: ["Borrow data from cache pages vs copy on read: reading columns without copying is much faster, but pages must stay pinned and values become invalid on page eviction.", "Cache multiple representations in one cell vs convert each time: comparison and arithmetic avoid repeated conversion, but flags must be kept consistent."],
    p: ["A value that borrows from a page is kept after the cursor moves, then reads reused memory.", "Converting between text encodings in place can silently change the length semantics of a value."],
    v: "Select a large text column in a loop under a memory limit and confirm peak memory stays near one row, then step the cursor and confirm earlier values were released and not corrupted.",
    dep: ["dynamic-typing", "page-references-and-dirty-list", "memory-allocator"]
  },
  "cursor-table": {
    s: "The array of open cursors in a running program, each wrapping a B-tree cursor, a virtual table cursor, a sorter or a pseudo-table, with cached record and column offsets.",
    d: "A cursor opcode allocates an entry that records the table or index root page, whether it is read or write, and its key information. Column reads use a cached parse of the current record header so repeated reads need not rescan it. Cursors can also wrap an ephemeral table, a sorter, a virtual table cursor, or a single in-memory row. Closing is explicit, and halt closes anything still open. The hard part is that cursors share a tree, so a write through one can move cells under another.",
    k: ["Cache the parsed record header vs reparse per column: multiple column reads from a row are cheap, but the cache must be invalidated when the cursor moves or the row changes.", "Uniform cursor interface over many sources vs specialized ones: one set of opcodes serves tables, sorters and virtual tables, at the cost of an indirection."],
    p: ["Modifying a table through one cursor while another cursor on the same tree is open can leave the second pointing at a moved cell without a save and restore.", "Leaving a read cursor open keeps a page referenced and a read lock held."],
    v: "Open two cursors on one table, delete rows through one and confirm the other either skips the deleted rows or reports a consistent position and the integrity check passes.",
    dep: ["btree-cursor", "external-sorter", "virtual-table-interface"]
  },
  "external-sorter": {
    s: "A sort engine for order by, group by and index builds that sorts in memory, spills sorted runs to temporary files when it outgrows its budget, and merges them.",
    d: "Rows are added as records with their sort keys. When the in-memory list exceeds the configured size, it is sorted and written to a temporary file as a run, and merging proceeds across runs, possibly with multiple threads in a build that allows them. Output is read by cursor. A bulk index build sorts keys first and writes them into the tree in order, which fills pages densely. It is hard because the memory budget, temp file I/O and the comparison function all interact, and a collation callback is called very many times.",
    k: ["Sort in memory then spill sorted runs vs in-place external sort: simple sequential I/O and predictable memory, but temporary files can be large.", "Sort keys then bulk-load an index vs insert row by row: dense, fast, sequential tree building, but needs temporary space and the whole input first."],
    p: ["A sort over a huge table can fill the temporary directory, failing the statement with a disk-full error.", "A slow custom collation multiplies cost, because comparisons run O(n log n) times."],
    v: "Sort a table larger than the sort memory budget, confirm that temp files were created and removed, and that output order matches a reference sort.",
    dep: ["temp-files", "collations", "memory-limits"]
  },
  "halt-and-statement-rollback": {
    s: "The program's exit path: on success it commits the statement and, if autocommit, the transaction; on error it undoes the statement's partial changes using the statement journal.",
    d: "A halt opcode finishes the program. In autocommit mode it triggers the commit of the single-statement transaction. If an error occurred, the machine rolls back the changes of that statement only when inside a larger transaction, using a statement-level savepoint opened at the start of a multi-row write, and may roll back the whole transaction depending on the error class and conflict policy. Pending deferred foreign key violations are checked at commit. It is hard because some errors, such as a full disk or an I/O failure, make the safe choice to roll back everything.",
    k: ["Statement-level rollback vs whole-transaction rollback on error: the application can retry just the failed statement, but severe errors still force a full rollback.", "Open a statement savepoint only when needed vs always: avoids journal cost for single-row writes, but the generator must know when a statement can fail midway."],
    p: ["After an out-of-memory or I/O error the transaction may already be rolled back, and an application that continues issuing statements believes it is still inside it.", "Ignoring the result of finalize hides an error raised at commit."],
    v: "Insert rows in one statement where the last violates a constraint, inside an outer transaction, and confirm none of that statement's rows remain while earlier statements' rows do.",
    dep: ["savepoints", "constraint-checks", "transaction-states"]
  },
  "trigger-frames": {
    s: "A saved set of registers and a return address that lets a trigger subprogram run inside the main program with its own variables and then resume the caller.",
    d: "When the main program invokes a trigger, the machine pushes a frame that records the caller's registers, cursors and program counter, and gives the subprogram a fresh register array with the old and new row values. Frames allow nested triggers, and the nesting depth is limited. A subprogram executes the same instruction set, and returns by popping the frame. Frames are kept in memory attached to the running statement. The difficulty is that cursors and savepoints belong to the whole statement, so the frame must not close or disturb the caller's resources.",
    k: ["Frames with separate register files vs a flat register space: isolated variables make nested triggers safe and recursive, but each call allocates and copies.", "Nesting depth limit vs unlimited recursion: guards against runaway recursion, but legitimate deep chains need the limit raised."],
    p: ["A recursive trigger without a stop condition allocates frame after frame until the depth limit aborts the statement.", "Frames that retain large values keep memory live for the whole statement."],
    v: "Create nested triggers three levels deep, confirm each level sees its own old and new values, and that exceeding the depth limit raises an error with all changes of the statement undone.",
    dep: ["trigger-compilation", "registers-and-value-cells", "halt-and-statement-rollback"]
  }
});
