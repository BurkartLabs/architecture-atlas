// Details for the regular expression engine plate, part 3: literal optimization, strategy, lazy DFA.
ATLAS.details("regex-engine", {
  "literal-extraction": {
    s: "Analyzes the tree to find literal strings that every match must contain or begin with, as the input to prefilters.",
    d: "A bottom-up pass computes sets of literals for each node: concatenation takes the cross product of its parts' sets, alternation takes the union, optional parts add the empty string. The sets are capped in count and length to avoid explosion, and the engine keeps either prefixes, suffixes or inner required literals. Case-insensitive literals expand to variants. The result says: any match starts with one of these strings. The hard part is deciding when a set is too large or too short to be a useful filter.",
    k: ["Prefix literals versus inner required literals: prefixes tell where to start the automaton, while an inner literal can be rarer but forces a reverse scan to find the start.", "Exact sets versus truncated sets: exact are precise but may explode, while truncated sets stay small but weaker as filters."],
    p: ["A very common one-byte literal chosen as the filter, which fires constantly and costs more than it saves.", "Extracting a literal through a lazy repeat or alternation and wrongly treating it as required."],
    v: "Extract literals from patterns with alternation, optional parts and case-insensitivity and confirm every match in a large corpus contains at least one extracted literal at the expected place.",
    dep: ["ast-nodes", "tree-simplifier", "property-analysis"]
  },
  "prefix-scan": {
    s: "Skips ahead in the haystack to the next position where a match could begin, using the first possible bytes or a literal prefix, and only then starts the matcher.",
    d: "If the pattern's possible first bytes are few, a byte scan finds the next candidate position quickly; if a literal prefix exists, a substring search finds it. The matcher then starts at that position, and if it fails the scan resumes just after. This turns a per-byte automaton step into a fast skip over most of the input. The work is bounded because the scan never goes backward beyond the candidate. The difficulty is deciding when the scan is worth it, since with many candidate bytes it adds overhead.",
    k: ["First-byte set scan versus full literal prefix: first-byte scans work for any pattern, while a literal prefix filters far more strongly when it exists.", "Restarting the matcher at each candidate versus continuing the automaton through gaps: restarting is simple, while continuing preserves state but cannot skip."],
    p: ["Scanning for a prefix after a failed candidate from the beginning of the window, producing quadratic time.", "Using the scan with an anchored pattern, where it can only mislead."],
    v: "Search a megabyte of text with a rare literal prefix and confirm the matcher is invoked only at candidate positions, with counters showing thousands of skipped bytes per automaton start.",
    dep: ["literal-extraction", "substring-search", "vector-byte-scan", "property-analysis"]
  },
  "substring-search": {
    s: "Finds a fixed string inside a larger text quickly, using skip tables, rare-byte heuristics or vectorized comparison.",
    d: "The searcher compiles the needle into a structure that lets it skip bytes: classic bad-character shift tables, a scan for the rarest byte of the needle followed by verification, or a vectorized check of several positions at once. Short needles and long needles want different algorithms. Case-insensitive search runs on folded variants. The result is a candidate position verified by the engine. The hard part is choosing the algorithm per needle and avoiding worst-case behavior on repetitive text.",
    k: ["Rare-byte scan with verification versus skip tables: rare-byte uses vector hardware well, while skip tables give worst-case guarantees on long needles.", "Building the searcher at compile time versus lazily: compile time keeps first search quick, while lazy avoids work for unused patterns."],
    p: ["A needle chosen with a rare byte guessed from a general frequency table that is not rare in the actual data.", "Quadratic worst-case on text such as long runs of the same byte."],
    v: "Search for needles of lengths one to one hundred in text of repetitive and random content, confirm results equal a naive search, and that throughput stays within a fixed range of memory speed.",
    dep: ["vector-byte-scan", "vector-dispatch"]
  },
  "vector-byte-scan": {
    s: "Uses wide vector instructions to compare many bytes against one or several target bytes in a single step, finding candidate positions at memory speed.",
    d: "The scanner loads a block of bytes into a vector register, compares it against the target byte or a set, converts the result to a bitmask and extracts the position of the first hit. Unaligned heads and tails are handled by overlapping loads or scalar loops. Different instruction widths are chosen at runtime. It underlies prefix scan, substring search and line counting. The hard part is correctness at block edges, page boundaries and tiny haystacks, where reading past the end is illegal.",
    k: ["Runtime dispatch among instruction widths versus a fixed baseline: dispatch uses the fastest available hardware, at the cost of several code paths to test.", "Reading overlapping blocks at the tail versus a scalar tail loop: overlap is faster but needs the haystack to be at least one block long."],
    p: ["Loading a full vector past the end of the haystack and crossing into an unmapped page.", "A scalar fallback that is never tested because every test machine has the vector path."],
    v: "Scan haystacks of every length from zero to several blocks with the target at every offset, on each instruction path, and confirm the returned position equals the scalar result in all cases.",
    dep: ["vector-dispatch"]
  },
  "multi-substring-search": {
    s: "Finds any of many literal strings in one pass, using an Aho-Corasick style automaton or a bucketed vector approach for small sets.",
    d: "When a pattern or set has many literal alternatives, a single pass must check them all. A trie with failure links visits each input byte once; for small sets of short strings, a vectorized scheme hashes a few leading bytes into buckets and verifies candidates. The matcher reports which literal and where. It serves as a prefilter for alternations and as the core of set matching for literal-only sets. The hard part is memory for large dictionaries and the choice between exact trie and fast approximate buckets.",
    k: ["Full automaton versus bucketed vector filter: the automaton is exact and handles thousands of strings, while buckets are faster for tens of strings but verify candidates.", "Reporting all matches versus leftmost only: all matches are complete but cost more, while leftmost-first aligns with regex semantics."],
    p: ["Building a trie for a very large dictionary that exceeds cache and runs slower than the engine it was meant to speed up.", "Reporting overlapping literal matches where the regex semantics would pick one."],
    v: "Search a corpus for a set of one thousand words and confirm match positions equal those from running each word separately, in one pass, with time independent of the number of words.",
    dep: ["literal-extraction", "vector-byte-scan", "arena-allocation"]
  },
  "prefilter-heuristics": {
    s: "Rules that decide whether a literal prefilter is worth using, based on literal length, frequency and how many candidates it is likely to produce.",
    d: "A prefilter that fires on every few bytes costs more than it saves, because each hit must be confirmed by the automaton. Heuristics reject filters that are one byte long, common in typical text, or too many in number. They estimate byte frequency from static tables, and some engines measure on first use and adapt. They also choose among prefix, suffix and inner literals. The hard part is that the right answer depends on input data the compiler has never seen.",
    k: ["Static frequency ranking versus runtime adaptation: static is simple and predictable, while adaptive handles unusual data but adds state and variability.", "Aggressive use of filters versus conservative: aggressive speeds typical text, while conservative avoids slowing inputs where the filter fires constantly."],
    p: ["A filter on a letter common in the input giving a search several times slower than the plain automaton.", "Adaptive switching that thrashes between strategies on mixed inputs."],
    v: "Benchmark patterns with rare, common and one-byte literals on text with matching frequency profiles and confirm the heuristic enables filtering only where it beats the plain automaton.",
    dep: ["literal-extraction", "prefix-scan", "engine-selector"]
  },
  "anchored-fast-paths": {
    s: "Special handling for patterns that must match at the very start or end of the input, which avoids scanning for candidate positions at all.",
    d: "A pattern starting with a text-start anchor can only match at position zero, so the engine runs the matcher once and stops. A pattern ending with an end anchor can be run in reverse from the end. Patterns that are entirely literal reduce to a comparison. The analysis comes from property analysis and applies after simplification. The hard part is multiline mode, where line anchors can match at many positions, and iteration with a start offset, where start of text is not the offset.",
    k: ["Detecting anchors in the tree versus at the automaton: the tree is easy but misses forms that only appear after rewriting.", "Reverse search for end-anchored patterns versus forward scan: reverse touches little of a large input, but needs the reverse program compiled."],
    p: ["Treating a start anchor as matching at the search offset in an iterator instead of text start, so repeated matches never stop.", "Applying the fast path in multiline mode, where anchors match at every line."],
    v: "Search a gigabyte-scale input with a start-anchored pattern and an end-anchored pattern and confirm work done is proportional to match length, not input size.",
    dep: ["property-analysis", "reverse-program", "search-window"]
  },

  "engine-selector": {
    s: "Chooses which matching engine or combination to use for a pattern and a search, based on the features, size and what the caller asked for.",
    d: "At compile time the selector builds only the engines the pattern needs and permits: a lazy DFA when the pattern is within limits, a thread simulation for captures, a bounded backtracker for small patterns and inputs, and a full backtracker for features nothing else supports. At search time it picks according to whether captures are wanted and the input length. Choices are encoded in a strategy object. The hard part is that engines must agree exactly, and a wrong selection is a speed or memory bug, not a correctness bug, which is easy to miss.",
    k: ["Selecting once at compile time versus per search: compile time is cheap and predictable, while per search adapts to input size and whether captures are requested.", "Hiding selection from callers versus exposing a switch: hiding keeps the API small, while exposing allows forcing an engine for testing and constrained deployments."],
    p: ["Silently selecting a slow engine for a pattern after a small change makes latency jump with no error.", "Engines that disagree on edge cases, so results change with input length that triggers a different engine."],
    v: "Force each engine in turn on a pattern corpus and confirm identical results; then in default mode record the chosen engine per pattern and confirm it matches the documented selection table.",
    dep: ["feature-detection", "lazy-dfa", "nfa-thread-simulation", "bounded-backtracker", "backtracking-matcher", "search-pipeline"]
  },
  "search-pipeline": {
    s: "The sequence of steps that one search runs: prefilter, forward scan for the match end, reverse scan for the start, and a capture pass on the narrow span.",
    d: "A search first uses the prefilter to find a candidate or rejects the haystack outright. A forward DFA finds where the earliest-ending match ends; a reverse DFA locates the start; and only if captures were requested does a slower engine run on just that span. Each step narrows the work of the next. This gives linear time overall with expensive stages applied to tiny regions. The hard part is keeping the stages semantically aligned and managing the cases where a stage gives up and the pipeline restarts at a slower step.",
    k: ["Staged narrowing versus one engine that does everything: staging puts fast engines on most bytes, but adds consistency requirements between stages.", "Running captures on the exact span versus the whole input: the span is much cheaper, but needs exact bounds from earlier stages."],
    p: ["The forward and reverse stages disagree on semantics and the capture stage sees a span that no longer matches.", "Rerunning from the start after a stage gives up, producing quadratic time on a long input with many matches."],
    v: "Trace a search and confirm each stage runs on the expected region: prefilter on the whole text, DFA on candidates, capture engine on only the final span, with timing shares matching.",
    dep: ["prefix-scan", "lazy-dfa", "reverse-dfa-scan", "bounded-backtracker", "nfa-thread-simulation", "fallback-chain"]
  },
  "scratch-cache-pool": {
    s: "Reusable working memory for searches, such as DFA caches and state sets, handed out per thread and returned after use so the compiled pattern can stay shared and immutable.",
    d: "Matchers need mutable scratch space: a DFA state cache, sparse sets, a backtrack stack. Allocating it per search would dominate cost for short inputs, and storing it inside the compiled pattern would force locking. A pool gives each search exclusive scratch, from a per-thread slot, a lock-free stack or a caller-supplied object. Scratch is created on first use and reset between searches. The hard part is a thundering herd of threads each allocating their own large cache, and memory held by idle scratch space.",
    k: ["Internal pool versus caller-owned scratch: an internal pool is convenient, while caller-owned scratch gives control over memory and thread affinity.", "One scratch per thread versus a shared pool: per thread avoids contention, while a shared pool bounds total memory across many threads."],
    p: ["A cache shared without exclusion, so two searches corrupt each other's DFA state.", "Memory growing with thread count times pattern count in a service with thousands of patterns."],
    v: "Run a hundred threads searching with one compiled pattern and confirm results are correct, the number of scratch allocations is bounded by thread count, and no allocation occurs after warmup.",
    dep: ["dfa-state-cache", "sparse-state-set", "thread-sharing", "memory-accounting"]
  },
  "fallback-chain": {
    s: "The ordered list of engines to try when a faster one gives up, ending in one that always finishes within known bounds.",
    d: "A lazy DFA may give up when its cache thrashes; a bounded backtracker refuses large haystacks; a backtracker may exceed its budget. The chain moves to the next engine, which is slower but has different limits, finishing at the thread simulation, which has bounded memory and linear time. Each handoff must carry what is already known, such as a verified match end, to avoid redoing work. The hard part is guaranteeing the final stage actually covers every feature, and that handoffs preserve semantics exactly.",
    k: ["Chain with a linear last resort versus failing at the first limit: the chain keeps patterns working at some speed cost, while failing exposes slowness immediately.", "Restarting from scratch versus resuming: restart is simple and safe, while resuming saves time but must transfer state faithfully."],
    p: ["A fallback to an engine that does not support a feature, causing a wrong answer or error late in a search.", "Repeated give-ups causing the engine to rebuild and abandon work on every search."],
    v: "Force the DFA cache to a tiny size and confirm searches complete through the fallback with the same results, with a counter showing the handoff, and with time bounded by the linear engine.",
    dep: ["cache-eviction", "nfa-thread-simulation", "bounded-backtracker", "step-counters"]
  },
  "cancellation-and-timeouts": {
    s: "Lets callers stop a long search by deadline or signal, returning a distinct result rather than hanging a thread.",
    d: "Matchers check a flag or a clock at coarse intervals, such as every few thousand bytes or steps, and return a cancelled or timed-out result. The check cost must be tiny, so a counter gates the clock read. Cancellation is the safety net for engines without a linear guarantee, and for linear engines on enormous inputs. Partial work is discarded, and scratch space must be left reusable. The hard part is the interval: too coarse and a deadline is missed, too fine and the inner loop slows.",
    k: ["Checking a flag set by another thread versus reading the clock: a flag is nearly free but needs a timer thread, while clock reads are self-contained but cost more.", "Returning an error versus a partial result: an error is unambiguous, while a partial result may be mistaken for a final answer."],
    p: ["Treating a timeout as no match and silently accepting dangerous input.", "A check placed only in the outer loop so one long inner scan ignores the deadline."],
    v: "Run a catastrophic pattern with a ten millisecond deadline and confirm the call returns the timed-out result within a small multiple of the deadline, and the same scratch space works on the next search.",
    dep: ["step-counters", "scratch-cache-pool", "backtracking-matcher"]
  },

  "lazy-dfa": {
    s: "A deterministic automaton whose states are built from sets of NFA states only when the input first reaches them, giving one table lookup per byte.",
    d: "Each DFA state is a set of NFA states. On a byte not yet seen from a state, the engine computes the next set by stepping the NFA, looks it up in the cache, and records the transition. After warmup, each byte costs one indexed load. Because only visited states are built, the full exponential automaton is never created. The DFA reports match ends without captures. The hard part is the cache: it must stay bounded, and rebuilding states repeatedly can make it slower than simulation.",
    k: ["Lazy construction versus building the full DFA ahead of time: lazy avoids exponential blowup and wasted work, while full has no runtime construction cost but may not fit memory.", "DFA for spans only versus tracking captures in it: spans keep states small and fast, while captures would multiply states and need a second engine."],
    p: ["Input that visits a new state on nearly every byte keeps the cache churning, so throughput collapses below the thread simulation.", "Treating DFA speed on typical text as a guarantee for adversarial input."],
    v: "Run the DFA on a megabyte of text and confirm one load per byte after warmup, with cache hit rate above 99 percent. Run on adversarial input and confirm give-up engages.",
    dep: ["thompson-construction", "dfa-state-cache", "byte-equivalence-classes", "cache-eviction", "dfa-start-states"]
  },
  "dfa-state-cache": {
    s: "The table of already built DFA states keyed by their NFA state sets, with a transition table that grows as new states are discovered.",
    d: "States are interned by their sorted set of NFA states, plus context flags, so the same set always maps to the same state. The transition table is a dense array indexed by state and byte class, with unfilled entries marking transitions yet to be computed. Memory use is states times classes times pointer size. A byte budget caps the table. The hard part is memory layout: a dense table is fast but wasteful for sparse states, and keys must be hashed cheaply during construction.",
    k: ["Dense transition rows versus sparse maps: dense is a single load per byte, while sparse saves memory when most transitions are never used.", "Hashing NFA state sets for interning versus comparing sorted lists: hashing is fast on large sets, while comparison avoids hash collisions and extra memory."],
    p: ["Context flags omitted from the state key, so two states differing only in the previous byte class merge and give wrong assertion results.", "A cache budget too small for the pattern, causing endless rebuilds."],
    v: "Run a pattern on text and confirm every distinct NFA state set has exactly one DFA state, and that the memory used by the table equals states times class count times entry width.",
    dep: ["lazy-dfa", "byte-equivalence-classes", "arena-allocation", "memory-accounting"]
  },
  "cache-eviction": {
    s: "What the DFA does when its state budget is exhausted: clear the cache and continue, or give up and hand the search to another engine.",
    d: "A counter tracks bytes of states built. When the limit is reached, the cache is cleared and the current state is rebuilt, which is safe because states are derived data. If clearing happens too often relative to bytes scanned, the DFA is thrashing and the engine abandons it and falls back to the simulation. The ratio is a heuristic threshold. The hard part is picking a threshold that prevents slowdowns without giving up on patterns that merely need a warm cache.",
    k: ["Clearing everything versus evicting least recently used states: clearing is simple and fast, while selective eviction keeps hot states but costs bookkeeping.", "Give-up threshold by clears per byte versus total clears: a rate adapts to input length, while a total is easy to reason about but penalizes long inputs."],
    p: ["Clearing the cache while other pointers still hold state identifiers, which then index invalid states.", "No give-up path, so adversarial input drives continuous rebuilds at far lower speed than linear simulation."],
    v: "Set a tiny cache, run text that needs many states, and confirm clears are counted, results stay correct, and the engine gives up after the threshold with the fallback finishing the search.",
    dep: ["dfa-state-cache", "fallback-chain", "memory-accounting"]
  },
  "byte-equivalence-classes": {
    s: "Groups the 256 byte values into classes that the pattern never distinguishes, so DFA transition rows are a few entries wide instead of 256.",
    d: "Two bytes are equivalent if every transition in the NFA treats them identically. Computing the classes from the boundaries of all byte ranges in the program gives typically a few to a few dozen classes. The matcher first maps each input byte through a 256-entry lookup to a class, then indexes the transition row by class. Rows become tiny, so the whole table fits cache. The hard part is the extra lookup per byte, and that one large class in a pattern can split many classes.",
    k: ["Mapping bytes to classes versus indexing by raw byte: classes shrink the table drastically, while raw indexing saves one lookup but multiplies memory.", "Computing classes once per pattern versus per DFA: once is cheaper, while per DFA could be finer but costs more."],
    p: ["Forgetting that assertions such as line terminators need their own class, so a state transition conflates a newline with other bytes.", "Class count growing large with Unicode patterns and erasing the memory savings."],
    v: "Compile patterns and confirm class count equals the number of distinct byte behaviors, and that transitions computed by class equal transitions computed per raw byte for all 256 values.",
    dep: ["program-instructions", "utf8-automata"]
  },
  "reverse-dfa-scan": {
    s: "Runs a DFA built from the reversed pattern backward from a known match end to find where the leftmost match begins.",
    d: "After the forward scan reports the end of a match, the reverse DFA starts at that end and reads bytes backward until it can no longer extend, recording the earliest accepting position. This costs time proportional to the match length plus any dead prefix scanned. Anchored mode ensures it does not wander beyond the search start. For a failed candidate the reverse scan is not needed. The hard part is semantic equivalence with leftmost-first rules and bounded work on repeated matches in the same text.",
    k: ["Reverse scan anchored at the match end versus unanchored: anchored is exact and bounded, while unanchored could find a different, earlier start.", "Lazy reverse DFA versus building it eagerly: lazy saves memory for patterns where only a boolean test is needed."],
    p: ["Reverse scans that go back to the start of the text for every match, giving quadratic time on many short matches.", "Mismatch between forward and reverse semantics resulting in a start after the end."],
    v: "For a corpus of matches found by the forward DFA, run the reverse scan and confirm the start equals the start found by a captures simulation, and that bytes scanned backward never exceed the match length by more than the searched prefix.",
    dep: ["reverse-program", "lazy-dfa", "match-semantics-modes"]
  },
  "full-dfa-precompile": {
    s: "Builds the complete DFA ahead of time, optionally minimized, for patterns small enough, so searches need no construction and the table can be stored or embedded.",
    d: "Determinization enumerates all reachable state sets up front. The result is a table that can be searched with no cache, no mutation and no locks, and it can be serialized. It is practical for patterns with bounded classes and no heavy Unicode, such as protocol tokens. It can also be minimized. The cost is compile time and memory that may be exponential in pattern size, so a state limit applies. The hard part is deciding which patterns qualify and where compile-time work ends.",
    k: ["Full DFA versus lazy DFA: full has predictable steady state and no mutation, while lazy handles patterns whose full DFA would not fit memory.", "Minimizing the DFA versus leaving it as built: minimizing shrinks memory, but costs compile time that short-lived patterns never recover."],
    p: ["Attempting determinization of a pattern whose state count is exponential, hanging compilation unless limited.", "Assuming a full DFA is faster than a warm lazy DFA; once warm they are the same speed."],
    v: "Precompile a small pattern set, serialize and reload the DFAs in a fresh process, and confirm identical results with no state construction counted at search time.",
    dep: ["thompson-construction", "byte-equivalence-classes", "program-size-limit", "automaton-serialization"]
  },
  "match-semantics-modes": {
    s: "The rule for choosing among several possible matches: leftmost-first as in backtracking dialects, or leftmost-longest as in the POSIX standard.",
    d: "When alternation or repetition allows more than one match at the same start, the dialect fixes which is returned. Leftmost-first prefers the earliest alternative and greedy or lazy repeats, matching a backtracker. Leftmost-longest returns the longest. Automata implement the first by priority ordering of NFA states and the second by continuing to scan until states die. Every engine and the reverse scan must use the same rule. The hard part is that priority must survive determinization, so DFA states are ordered sets, not plain sets.",
    k: ["Leftmost-first versus leftmost-longest: first matches backtracking programmers' expectations and allows early stop, while longest follows POSIX and requires scanning to the end of possibility.", "Ordered DFA state sets versus unordered: ordered preserve priority and can cut off lower-priority threads at a match, while unordered are smaller but cannot express leftmost-first."],
    p: ["A DFA that unions state sets without order returns a longer match than the backtracker for the same pattern.", "Mixing semantics across engines selected by input length."],
    v: "Match alternations such as a short branch before a long branch against inputs with both options and confirm the span equals the chosen dialect's rule in every engine.",
    dep: ["priority-ordering", "lazy-dfa", "flavor-compatibility"]
  },
  "multi-pattern-dfa": {
    s: "A DFA over several patterns together, whose states record which patterns have matched, used for set matching and for lexer-like scanning.",
    d: "The construction unions the start states of all patterns and keeps pattern identifiers on accepting NFA states. States of the combined DFA therefore carry the set of identifiers that matched at that point. Scanning gives all matches in one pass. State count can grow with the number of patterns, so lazy construction and cache limits matter even more. Patterns can share prefixes and literals. The hard part is semantics for overlapping matches and which identifier wins when several patterns match at the same place.",
    k: ["A single combined automaton versus several smaller groups of patterns: one is the fastest for each byte, while groups bound state growth and cache size.", "Reporting every match versus the first by priority: all matches serve filtering use, while one match serves tokenizing."],
    p: ["Combining thousands of patterns and exceeding the cache, so every byte becomes a state construction.", "Pattern identifiers lost when the combined automaton is minimized."],
    v: "Combine a thousand patterns, scan a large text and confirm the set of identifiers matched equals that from scanning with each pattern separately, at a throughput close to the single-pattern rate.",
    dep: ["lazy-dfa", "dfa-state-cache", "set-match-api"]
  },
  "dfa-start-states": {
    s: "Chooses the correct initial DFA state depending on what precedes the search position, such as start of text, start of a line, a word character or anything else.",
    d: "Assertions at the search start depend on the preceding byte, which the DFA does not see. So the engine builds several start states, one per context: text start, line start, previous byte a word character, previous byte not. At each search it inspects the byte before the window and selects the start state. Anchored and unanchored searches have separate start states. The hard part is getting context right for iteration and streaming, where the previous byte exists but is outside the window.",
    k: ["Several start states by context versus one start with assertion fixups: several are fast and exact, while one is simple but needs extra checks at the first byte.", "Looking at the previous byte directly versus caller-supplied context: direct is automatic, while caller context supports chunked input where the byte is not in memory."],
    p: ["Picking the text-start state when searching from an offset, making start anchors match mid-text.", "Ignoring the previous byte for word boundaries at a chunk start."],
    v: "Search from every offset in a string that has line breaks and word characters and confirm the start state used and the boundary results match a table of expected behavior at each position.",
    dep: ["lazy-dfa", "empty-assertion-compilation", "search-window"]
  }
});
