// Details for the text editor plate, part 6: cross-cutting concerns.
ATLAS.details("text-editor", {
  "text-coordinate-systems": {
    s: "The choice of unit for naming positions in text, byte, code unit, code point, grapheme or display column, and where conversions between units happen.",
    d: "Files are bytes, many protocols count UTF-16 code units, the buffer may index code points, users move by grapheme clusters, and the screen shows display columns affected by tabs and wide characters. Every component picks one and converts at its edges. The decision affects the buffer's indexes, cursor logic, the language client, search, parsers and rendering. It is hard because the units agree for ASCII, so mistakes pass every simple test and fail only for accented text, emoji or tabs.",
    k: ["One internal unit with conversion at boundaries vs. each component choosing its own: one unit prevents mixing, but every protocol edge pays a conversion.", "Store offsets vs. line and column: offsets are compact and comparable, while line and column match what users and tools report."],
    p: ["Using code unit counts where code points were meant offsets every later position on lines with emoji.", "Testing only with ASCII hides every unit bug until real users type in other languages."],
    v: "Run the whole test suite on a corpus containing accents, emoji, tabs, wide characters and mixed line endings, and check that cursor, search hit, diagnostic and parser positions all land on the same characters.",
    dep: []
  },
  "process-and-threading-model": {
    s: "Which processes and threads own which state: interface, buffers, extensions, language servers, search and terminals, and how they communicate without sharing mutable text.",
    d: "A typical split puts the interface and buffers on one thread, extensions in a separate host process, language servers and debug adapters in their own processes, and heavy work in workers on snapshots. Communication is by messages tagged with versions. The decision limits what can be synchronous and decides how crashes propagate. It is hard because each boundary adds latency and copying, and some state, such as the document, must exist in several places and stay equal.",
    k: ["Many processes with message passing vs. one process with threads: processes isolate failures and hangs, while threads share data cheaply but share failures too.", "Document owned in one place with mirrors vs. shared memory: mirrors need synchronization, but shared memory brings races."],
    p: ["A synchronous call across a process boundary stalls typing when the other side is busy.", "Mirrors that are not versioned drift apart after one dropped message."],
    v: "Kill each non-interface process in turn during a typing session. The editor never freezes, affected features recover or are marked unavailable, and the buffer's text is unchanged.",
    dep: ["extension-host","language-client","background-workers"]
  },
  "latency-budgets": {
    s: "Explicit time limits for the paths users feel, such as key press to pixel, scrolling frames, opening a file, and completion, and the discipline of measuring them continuously.",
    d: "Typing must show the character within a frame or two, scrolling must hold the display's refresh rate, a file must show its first screen quickly, and popups must appear in tens of milliseconds. Each budget is divided among components, so a keystroke's path through input, buffer, layout and render must fit in total. Work that does not fit moves to a later frame or a worker. It is hard because budgets are consumed by many small additions, and the slowest path is usually one an extension added.",
    k: ["Strict budgets enforced in tests vs. best effort: enforcement catches regressions early, but needs stable measurement infrastructure.", "Do work on the typing path vs. defer: doing it gives immediate results, while deferring protects latency but shows stale information briefly."],
    p: ["Measuring only the average hides the occasional long frame that users actually notice.", "A feature that adds two milliseconds to every key looks harmless until ten of them exist."],
    v: "Record key-to-paint latency and frame times during a scripted typing and scrolling session on reference hardware. The ninety-ninth percentile stays within the stated budget, and a regression fails the build.",
    dep: ["frame-scheduling","startup-budget"]
  },
  "immutability-and-snapshots": {
    s: "The decision to treat text and derived data as immutable versions that background readers can hold, instead of mutable structures guarded by locks.",
    d: "If the buffer and its indexes are persistent structures, a snapshot is a pointer, and search, parsing, saving and language analysis can run on it while the user edits. Results carry the version they used, and stale ones are dropped. The alternative, mutable shared state with locks, is faster for single operations but invites races and stalls. The decision shapes the buffer structure, the undo model, the worker design and the language client. It is hard because immutability costs allocation and complexity in every structure.",
    k: ["Persistent structures with cheap snapshots vs. mutable arrays with copy on demand: persistent structures make concurrency simple, but cost more per edit and per read.", "Version tags on every result vs. cancellation only: tags make staleness explicit, but require every consumer to check them."],
    p: ["One component that holds a snapshot forever pins old text and quietly grows memory.", "A derived structure updated in place breaks the guarantee that readers see one consistent version."],
    v: "Run background search, parse and save concurrently with heavy typing and undo. Each background result corresponds to a single, identified version of the text, and memory returns to baseline when they finish.",
    dep: ["buffer-snapshots","background-workers"]
  },
  "extensibility-vs-stability": {
    s: "How much of the editor extensions may change, balanced against the editor's ability to improve its internals, stay fast and keep working across releases.",
    d: "A wide API makes the editor a platform and lets the community build everything, but every exposed behavior becomes a promise. A narrow API protects performance and the ability to refactor, but limits what extensions can do, pushing authors to fork or to patch internals. The decision determines contribution points, versioning rules, process isolation and what can be replaced. It is hard because the right width is learned only after the ecosystem exists, and narrowing later breaks users.",
    k: ["Wide, powerful API vs. narrow, stable API: wide APIs build an ecosystem faster, but freeze internals and make performance depend on strangers' code.", "Core features as extensions vs. built in: building on the same API proves it, but makes core behavior depend on loading and activation."],
    p: ["Extensions that patch undocumented internals break on every release, and users blame the editor.", "An API that lets any extension run on every keystroke makes typing as slow as the slowest extension."],
    v: "Build several core features, such as the outline and a language mode, only with the public API. They work, and the release process runs the most-used extensions and reports each API they depend on.",
    dep: ["extension-api","api-versioning","contribution-points"]
  },
  "trust-and-security": {
    s: "Treating files, workspaces, extensions, remote content and pasted text as untrusted input, and limiting what each can make the editor execute or reveal.",
    d: "A text editor reads text from strangers all the time. Opening a project can run tasks, settings can name programs, extensions run with the user's rights, links in hover text can run commands, and deceptive text such as direction controls can hide code from reviewers. Defenses include workspace trust, restricted modes, extension signing and permissions, safe rendering of markup, and visible display of hidden characters. It is hard because convenience features are exactly the ones that execute things.",
    k: ["Restrict by default vs. trust by default: restriction protects users from hostile projects, but adds friction that leads people to approve without reading.", "Make hidden characters visible vs. render faithfully: showing them reveals tricks in code, but adds noise for legitimate multilingual text."],
    p: ["A single feature that runs a configured program on folder open undoes every other defense.", "Trusting a parent folder trusts everything later cloned beneath it."],
    v: "Open a crafted project containing a task that runs on open, a setting pointing to a program, a hover link running a command, and a source file with direction-control characters. Nothing executes, and the hidden characters are shown.",
    dep: ["workspace-trust","extension-permissions","settings-layering"]
  },
  "graceful-degradation": {
    s: "Planning how each feature behaves when the input is too large, too long, malformed or slow, by reducing function in a visible way instead of freezing or failing.",
    d: "Real files include gigabyte logs, single-line megabytes, binary data, invalid encodings and unbalanced syntax. Real environments include slow disks, absent servers and dead extensions. Each feature declares a fallback: highlighting turns off above a size, wrapping switches to a window, folding falls back to indentation, a missing server leaves the grammar highlighting in place. It is hard because every feature must be written twice, the full version and the fallback, and the fallback must say that it is active.",
    k: ["Automatic limits with a notice vs. user-chosen modes: automatic limits prevent hangs without any action, but sometimes disable what the user wanted.", "Degrade per feature vs. one global safe mode: per-feature degradation keeps as much as possible, while a global mode is simpler to explain and test."],
    p: ["A limit that counts file size but not line length lets a small minified file hang the editor.", "Silent feature loss looks like a bug, so each degradation must be visible."],
    v: "Open a two-gigabyte file, a megabyte-long single line, a binary file and a file with broken syntax, with the language server stopped. Each opens quickly, remains editable or clearly read-only, and names the features disabled.",
    dep: ["large-file-mode","grammar-tokenizer","language-client"]
  }
});
