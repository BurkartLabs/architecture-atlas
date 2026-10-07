// Details for the retrieval-augmented generation plate, part 1: interfaces, evaluation, context assembly.
ATLAS.details("rag-system", {
  "chat-interface": {
    s: "The conversational front end where people ask questions, read streamed answers with their sources, and follow up. It holds the session and displays citations as links to the originals.",
    d: "The interface sends each turn with a session identifier and the user's identity, renders partial text as it arrives, and shows citations as numbered links that open the exact passage in the source document. It also shows when the system declined to answer and why. It is hard because the interface is where trust is won or lost: a citation that opens the wrong page, or a confident answer with no visible evidence, teaches users to ignore the sources entirely.",
    k: ["Inline numbered citations vs a separate sources panel: inline ties each claim to evidence at the cost of clutter; a panel reads cleanly but hides which claim a source supports.", "Showing retrieved passages to the user vs hiding them: exposure builds trust and enables correction, but reveals permission mistakes and poor retrieval immediately."],
    p: ["Citation links that open the document top instead of the cited passage make verification so slow that nobody does it.", "Hiding the abstention reason leaves users rephrasing the same question repeatedly, believing the system is broken."],
    v: "Ask a question whose answer sits on page 40 of a known document, click the citation, and confirm the viewer opens at that exact passage with the text highlighted.",
    dep: ["search-answer-api", "answer-streaming", "conversation-memory"]
  },
  "search-answer-api": {
    s: "The programmatic endpoint that accepts a question, user identity and options, runs retrieval and generation, and returns an answer with citations, scores and a trace identifier.",
    d: "A request carries the query, caller identity, optional filters, a conversation reference and limits such as maximum latency and passages. The response includes the answer, structured citations with document and offset, whether the system abstained, and a trace id linking to every stage's logged input and output. It enforces authentication, rate limits and time budgets, and can return retrieval results alone for callers that do their own generation. The difficulty is a stable contract: internal changes in chunking or ranking must not break clients.",
    k: ["One combined answer endpoint vs separate search and generate endpoints: combined is simpler for clients; separate lets callers reuse retrieval and swap generators.", "Synchronous response vs streamed events: streaming lowers perceived latency but forces clients to handle partial output and late-arriving citations."],
    p: ["Returning only answer text with no trace id makes every bad answer impossible to diagnose later.", "No per-request time budget lets one slow stage hold connections until the gateway times out."],
    v: "Call the endpoint with a known question and confirm the response contains citations with document ids and offsets, an abstain flag, and a trace id that resolves to the stored retrieval and prompt.",
    dep: ["multi-step-retrieval", "prompt-templates", "query-time-filtering", "model-serving-gateway"]
  },
  "conversation-memory": {
    s: "Keeps the earlier turns of a session so follow-up questions can be understood, deciding what history to carry forward, summarize or drop as the window fills.",
    d: "Each turn is stored with the question, the answer, and the sources used. For a follow-up, the system supplies recent turns to the rewriter and may include a rolling summary of older ones. Memory may also hold user preferences or earlier retrieved documents the user pinned. The hard parts are scope and safety: carrying all history crowds out evidence in the window, and remembering a passage a user could see an hour ago may leak it after their permissions change.",
    k: ["Verbatim recent turns plus a summary of older ones vs full history: the first bounds cost, but summaries lose details a later question may need.", "Reusing earlier retrieved passages vs retrieving fresh each turn: reuse is cheaper and consistent, but ignores permission and content changes between turns."],
    p: ["Replaying cached passages after a permission revocation shows content the user can no longer access.", "Summaries that absorb a hallucinated claim make later turns treat it as established fact."],
    v: "Ask a question, then a pronoun-only follow-up such as 'what about its limits?', and confirm the rewritten query names the subject. Revoke access mid-session and confirm the old passages stop appearing.",
    dep: ["metadata-database", "conversational-rewriting"]
  },
  "answer-streaming": {
    s: "Sends the answer to the client as the model produces it, along with citation events, so users see text within a second instead of waiting for the whole response.",
    d: "The server relays generated tokens over a long-lived HTTP response using server-sent events or similar framing, interleaving typed events for citations, status and completion. Post-generation checks such as citation verification and output filtering have to run on partial text or after it. Backpressure, client disconnects and proxy buffering all matter. It is hard because safety checks conflict with streaming: text already shown cannot be unsaid if a later check fails.",
    k: ["Stream immediately vs hold until checks pass: streaming feels fast but may show unsafe or unsupported text; holding is safer but adds seconds of silence.", "Citations emitted inline as tokens vs sent after completion: inline is immediate but unverified; after completion lets verification fix them at the cost of layout shifts."],
    p: ["A proxy that buffers the response delivers everything at once, removing the benefit while latency metrics look fine.", "A client disconnect that does not cancel generation keeps spending model budget on answers nobody reads."],
    v: "Time the first visible token on a long answer and confirm it arrives within about a second while total completion takes much longer, then close the connection and confirm the model call is cancelled.",
    dep: ["model-serving-gateway", "output-filtering"]
  },
  "feedback-capture": {
    s: "Collects explicit ratings, corrections and implicit signals such as copy, reformulation or abandonment, and links each to the trace of the answer it concerns.",
    d: "Explicit signals include thumbs, free-text comments and 'wrong source' flags. Implicit ones include the user rephrasing immediately, clicking a citation, or leaving. Each event is stored with the trace id so analysts can see what was retrieved and generated. Feedback feeds the test sets and triage queues. It is hard because signals are sparse and biased: unhappy users rate more than satisfied ones, and a thumbs-down does not say whether retrieval or generation failed.",
    k: ["Asking for a reason with each rating vs a single click: reasons make triage faster, but far fewer users respond.", "Using feedback directly to train rankers vs only to build evaluation sets: direct use adapts quickly but amplifies the biases of whoever votes."],
    p: ["Feedback stored without the trace is a number nobody can act on.", "Rating buttons that appear on abstentions collect downvotes for correct refusals and mislead tuning."],
    v: "Submit a downvote with a reason, then open the triage view and confirm it shows the question, retrieved passages, prompt version and answer for that exact request.",
    dep: ["metadata-database", "failure-triage"]
  },
  "agent-tool-interface": {
    s: "Exposes retrieval as a callable tool for other programs or language-model agents, with a documented schema, permission inheritance and bounded result sizes.",
    d: "The tool takes a query and optional filters and returns ranked passages with identifiers and source metadata, rather than a finished answer, so the calling agent composes its own response. It carries the end user's identity through so permissions apply to the person, not the agent. Result sizes, call counts and cost per task are capped. The difficulty is that agents call tools with odd, repeated or very broad queries, and the schema description is effectively the only guidance they get.",
    k: ["Returning passages vs returning a generated answer: passages give the caller control and avoid double generation, but push citation and grounding duties to the caller.", "Tool runs as the agent's service identity vs as the end user: a service identity is simpler, but bypasses per-user permissions."],
    p: ["Running under a broad service account lets an agent retrieve documents the requesting user could never open.", "Unbounded result sizes let an agent flood its own window with irrelevant text and degrade its reasoning."],
    v: "Call the tool as a restricted user through an agent and confirm results exclude documents that user cannot open, then call it fifty times in a loop and confirm the call cap triggers.",
    dep: ["search-answer-api", "query-time-filtering", "identity-resolution"]
  },
  "retrieval-test-sets": {
    s: "A curated collection of questions with the passages that answer them, used to measure whether retrieval finds the right evidence independently of what the generator does.",
    d: "Each case holds a question, the relevant chunks or documents, and sometimes a reference answer. Sources include logged real queries labeled by reviewers, synthetic questions generated from chunks, and hard cases from past failures. Cases are tagged by type, such as lookup, multi-document or unanswerable. The set must follow the collection: when chunking changes, chunk-level labels break, so labels are best kept at document and span level. The challenge is realism, because synthetic questions share vocabulary with their source and flatter lexical methods.",
    k: ["Labels at document level vs chunk level: document labels survive re-chunking, while chunk labels measure precisely but must be rebuilt on every change.", "Synthetic questions vs logged real ones: synthetic scale cheaply but are unrealistically easy; real ones are representative but need slow human labeling."],
    p: ["Tuning against one fixed set overfits it, so scores rise while real users see no improvement.", "Including unanswerable questions is forgotten, so a system that never abstains scores perfectly."],
    v: "Run the set against two deliberately different retrievers and confirm the scores differ in the expected direction, then re-chunk the collection and confirm labels still resolve to relevant text.",
    dep: ["feedback-capture", "document-store"]
  },
  "retrieval-metrics": {
    s: "Numbers that score a ranked list against known-relevant passages: recall at k, precision, rank-aware measures and coverage of multi-document answers, computed per stage.",
    d: "Recall at k asks whether the needed passage appears in the top results; rank-aware measures reward placing it first. Metrics are computed after the candidate stage, after fusion and after re-ranking, so a loss can be pinned to one step. For answers needing several passages, coverage measures how many were found. Results are sliced by query type and source. It is hard to choose k well: it should match how many passages the context actually carries, not an arbitrary round number.",
    k: ["Stage-level metrics vs end-to-end only: stage metrics localize regressions, but cost more to compute and need labels at each stage's granularity.", "Binary relevance vs graded relevance: binary labels are cheap and consistent, while graded labels capture partial usefulness but raise annotator disagreement."],
    p: ["Reporting only top-10 recall hides that the right passage sits at rank 9 and is trimmed out of the window.", "Averaging across all queries buries a severe regression on one small but important query class."],
    v: "Plant a known-relevant passage, confirm the metric reports it found at its true rank, then delete it from the index and confirm recall at k drops for exactly those questions.",
    dep: ["retrieval-test-sets"]
  },
  "answer-quality-judges": {
    s: "Automated or human scorers that rate generated answers for correctness, completeness and relevance against references or the retrieved evidence, usually with a model as grader.",
    d: "A grading prompt gives a judge model the question, the answer and either a reference or the supporting passages, and asks for scores on defined criteria with a short reason. Judges are calibrated against human ratings on a sample, and pairwise comparison of two versions is often more stable than absolute scores. Human review covers the sample the judge disagrees with. The difficulty is that judges favor longer, more confident answers, can share the generator's blind spots, and drift when the judge model changes.",
    k: ["Pairwise comparison vs absolute scoring: pairwise is more reliable for choosing between versions, but cannot say whether either is good enough to ship.", "A stronger separate judge model vs the generator grading itself: a separate judge reduces self-preference, but adds cost and another version to pin."],
    p: ["Changing the judge model silently shifts every score, making last month's results incomparable.", "Never checking judge agreement with humans lets a biased judge steer tuning toward verbose answers."],
    v: "Have people rate 100 answers, run the judge on the same set, and confirm agreement is within an agreed threshold, including on a few deliberately wrong but fluent answers.",
    dep: ["retrieval-test-sets", "model-serving-gateway"]
  },
  "groundedness-scoring": {
    s: "Measures what fraction of an answer's claims are supported by the retrieved passages, separating unsupported statements from wrong retrieval.",
    d: "The answer is split into atomic claims, and each is checked against the passages supplied to the generator using an entailment model or a judge prompt. Scores report supported, contradicted and unsupported claims. Run offline it evaluates changes; run online on samples it detects drift. It is distinct from correctness: a claim can be grounded in a source that is itself outdated, and a correct claim from the model's memory scores as ungrounded, which is the intended behavior.",
    k: ["Claim-level checking vs whole-answer scoring: claim-level pinpoints the bad sentence, but depends on a decomposition step that can itself err.", "Checking against supplied passages vs the whole corpus: supplied-only measures faithfulness to what was shown, but cannot tell whether better evidence existed."],
    p: ["Treating grounded as correct passes confident answers drawn from stale or wrong sources.", "Claim splitting that drops qualifiers such as 'only in 2022' scores a misleading answer as supported."],
    v: "Insert one fabricated sentence into a known good answer and confirm the score flags exactly that claim as unsupported while the remaining claims stay supported.",
    dep: ["answer-quality-judges", "claim-verification"]
  },
  "regression-gates": {
    s: "Automated checks that run the evaluation set on every change to chunking, models, prompts or ranking, and block rollout when scores fall below thresholds.",
    d: "A change triggers an evaluation run on a pinned snapshot of the corpus and test sets, compares retrieval, groundedness and answer scores against the current baseline, and reports per-slice differences with confidence intervals. Thresholds are set per metric, and a few critical questions must always pass. Results attach to the change for review. It is hard because language-model output varies between runs, so a gate that is too strict flaps and one that is too loose lets slow degradation through.",
    k: ["Fixed absolute thresholds vs comparison to baseline: absolute floors are simple but go stale; baseline comparison tracks reality but lets slow decline accumulate.", "Gating on aggregate scores vs per-slice scores: slices catch targeted regressions, but multiply the number of comparisons and false alarms."],
    p: ["Evaluating on a corpus that has since changed produces differences that come from the data, not the change.", "Ignoring run-to-run variance lets noise block good changes and approve bad ones."],
    v: "Submit a change that deliberately swaps the embedding model for a weaker one and confirm the gate fails with the affected slices named; resubmit the baseline and confirm it passes.",
    dep: ["retrieval-metrics", "answer-quality-judges", "groundedness-scoring", "index-snapshots"]
  },
  "online-monitoring": {
    s: "Watches live traffic for drift in retrieval scores, abstention rates, empty results, latency and sampled answer quality, and alerts when they move.",
    d: "Each request logs the query, stage timings, top scores, number of passages, whether it abstained and the answer's groundedness on a sample. Dashboards track these by query type and source. Alerts fire on shifts such as a rising empty-result rate, which often means a connector stopped or a permission sync broke. Logs must respect the same access rules as the data. The difficulty is that quality has no direct live metric, so proxies need careful interpretation and periodic human audit.",
    k: ["Sampling answers for full grading vs scoring every one: sampling is affordable, but can miss rare failures; full scoring adds cost and latency to every request.", "Alerting on absolute thresholds vs on change from a moving baseline: thresholds are clear, while baselines adapt to seasonal shifts but can absorb gradual decay."],
    p: ["Logging full queries and passages into a broadly readable system leaks content the retrieval layer protected.", "A silent connector failure shows only as slowly falling freshness, which no latency or error alert catches."],
    v: "Stop one source connector in a test environment and confirm an alert fires on freshness or empty-result rate for the questions that depend on that source within the agreed window.",
    dep: ["cost-latency-tracking", "metadata-database", "groundedness-scoring"]
  },
  "failure-triage": {
    s: "The workflow that takes a bad answer and decides whether parsing, chunking, retrieval, ranking, context assembly or generation caused it, then routes the fix.",
    d: "An analyst opens the trace for a bad answer and checks in order: was the needed text in the source, was it parsed, was it chunked intact, was it retrieved at all, was it ranked high enough, did it fit the window, did the model use it. Each failure class has a typical remedy. Tooling replays a query against any past index snapshot and shows candidate lists at each stage. The challenge is that fixing one query often hurts others, so each fix must become a test case.",
    k: ["Staged diagnosis from the source forward vs starting at the answer: source-forward finds the true cause more often, but takes longer than inspecting the final prompt.", "Turning every fixed failure into a permanent test vs sampling: permanent tests prevent repeats, but grow the suite and its maintenance cost."],
    p: ["Tuning the prompt to fix a retrieval failure hides the real problem and breaks other queries.", "Replaying against today's index instead of the one that served the request misdiagnoses changes made since."],
    v: "Take a known wrong answer, run triage, and confirm the tool names the stage where the right passage was lost, with the candidate list from that stage displayed.",
    dep: ["online-monitoring", "feedback-capture", "index-snapshots", "retrieval-test-sets"]
  },
  "cost-latency-tracking": {
    s: "Attributes time and money to each stage of a request, such as embedding, search, re-ranking and generation, so changes can be judged against budgets.",
    d: "Every stage records its duration, token counts and calls, rolled up per request, user group and feature. Latency is tracked at percentiles, since the slowest requests are usually the multi-step or re-ranking-heavy ones. Cost combines model token prices with index and compute usage. Budgets feed routing decisions such as using a smaller model for simple queries. It is hard because costs and quality trade against each other, and averages hide a long tail.",
    k: ["Per-request cost attribution vs aggregate billing only: attribution reveals the expensive query shapes, but requires instrumenting every stage and call.", "Tracking median latency vs high percentiles: the median describes typical use, while the tail drives timeouts and the complaints that matter."],
    p: ["A retry loop in the multi-step path multiplies model calls on hard queries and appears only in the tail.", "Counting only generation tokens misses large re-ranking and embedding costs at high volume."],
    v: "Run one request through every stage and confirm the trace shows each stage's duration and token count and that the per-stage sums equal the total within a small tolerance.",
    dep: ["model-serving-gateway", "metadata-database"]
  },
  "context-budgeting": {
    s: "Allocates the model's fixed input window among instructions, conversation history, retrieved passages and room for the answer, and decides how many passages fit.",
    d: "The budget is computed in tokens using the same tokenizer as the model. Fixed parts are reserved first: system instructions, the question, and a reserve for output. History and passages share what remains, often by priority or by fixed shares. Passages are admitted in ranked order until the budget is spent, with the last one trimmed or dropped. It is hard because token counts differ across models and languages, and more context is not better: long windows dilute attention and raise cost and latency.",
    k: ["Fixed number of passages vs a token budget: a fixed count is simple but overflows on long passages; a token budget adapts but returns varying evidence depth.", "Using the full window vs a deliberately smaller one: a full window maximizes recall, while a smaller one improves focus, speed and cost."],
    p: ["Counting characters instead of tokens silently truncates the prompt at the wrong place, often cutting the question.", "Reserving too little output room causes answers that stop mid-sentence."],
    v: "Feed passages totaling twice the budget and confirm the assembled prompt stays under the model's limit, keeps the instructions and question intact, and drops only the lowest-ranked passages.",
    dep: ["prompt-templates", "conversation-memory"]
  },
  "passage-dedup-selection": {
    s: "Removes near-duplicate and overlapping passages from the ranked list and chooses the final set so the context carries distinct evidence instead of repeats.",
    d: "Overlapping chunks, copies of the same document in several places, and quotations repeat the same text. The step compares passages by identifiers, offsets, hashes or embedding similarity, merges overlapping spans, and keeps the highest-ranked or most authoritative copy. It may also enforce a cap per document so one long file does not fill the window. The difficulty is deciding what counts as duplicate: two versions of a policy are near-identical text with different meaning.",
    k: ["Aggressive similarity-based removal vs removing only exact duplicates: aggressive saves window space, but can drop a variant that holds the one differing fact.", "Cap per document vs unrestricted: a cap spreads evidence across sources, but may cut the one long document that actually contains the answer."],
    p: ["Collapsing two document versions keeps the outdated one, so the answer cites superseded policy.", "A per-document cap trims a legitimately long answer section into an incomplete excerpt."],
    v: "Retrieve for a query where three chunks overlap the same paragraph and confirm the context contains that paragraph once, with a single citation to its source and span.",
    dep: ["deduplication", "retrieval-cutoffs", "document-versioning"]
  },
  "context-ordering": {
    s: "Decides the order of passages in the prompt, such as best first, best at the ends, or grouped by document, to counter the model's uneven use of long inputs.",
    d: "Models attend unevenly to long inputs and tend to use material at the start and end more than the middle. Ordering strategies place the strongest passages at those positions, or keep passages from one document together in reading order so the model sees connected text. Chronological ordering suits questions about change over time. Order must also stay stable between repeated requests to benefit from prompt caching. The difficulty is that the best order depends on the model and the question, and only evaluation reveals it.",
    k: ["Rank order vs reading order within documents: rank order puts relevance first, but fragments connected text that the model reads more easily intact.", "Edge placement of the best passages vs a plain list: edge placement helps with long windows, but adds logic that needs re-tuning per model."],
    p: ["Randomly ordered equal-scored passages change answers between identical requests and break caching.", "Reordering for a layout benefit separates a table from the heading that explains it."],
    v: "Run the same evaluation set with three orderings and confirm the chosen one scores at least as well on answer quality, and that two identical requests build byte-identical prompts.",
    dep: ["context-budgeting", "passage-dedup-selection"]
  },
  "neighbor-expansion": {
    s: "After a chunk is selected, adds the text around it, such as adjacent chunks or the enclosing section, so the model sees the surrounding sentences the chunk was cut from.",
    d: "Small chunks retrieve precisely but lose context: a pronoun with no antecedent, a table without its caption, a step without the previous one. Expansion uses stored chunk order and parent links to fetch neighbors or the parent section up to a size limit, merging them into one passage. It is applied after ranking so expansion does not distort scores. The difficulty is size: expanding every hit quickly exhausts the window, so it should be selective.",
    k: ["Expand after ranking vs index larger chunks: after-ranking keeps retrieval precise and adds context cheaply, but needs stored order and extra fetches per request.", "Fixed neighbor count vs structure-aware expansion: a count is simple, while structure-aware follows sections but depends on reliable parsing."],
    p: ["Expanding across a document boundary or section break splices unrelated text into one citation.", "Expanding all top hits triples the prompt size and pushes out other relevant sources."],
    v: "Retrieve a chunk beginning with 'It also requires' and confirm the assembled passage includes the preceding text naming the subject, and that the citation points to the combined span.",
    dep: ["parent-child-chunks", "chunk-store", "context-budgeting"]
  },
  "context-compression": {
    s: "Shortens retrieved passages before generation by extracting only relevant sentences or summarizing, so more sources fit in the window at lower cost.",
    d: "An extractive step keeps sentences scoring highly against the question; a generative step rewrites passages into condensed notes. Compression runs per passage or across the set, and keeps source ids so citations survive. It helps when many sources are needed or the model is slow and costly. It is risky: any summary can drop a qualifier, a number or an exception, and generative compression can introduce statements the source never made, which then look grounded.",
    k: ["Extractive selection vs generative summarization: extraction preserves exact wording and citations, but reads disjointedly; summarization is fluent but can alter meaning.", "Compressing always vs only when over budget: always saves cost but adds latency and error to every request; conditional compression keeps short contexts untouched."],
    p: ["A summary drops 'except for contractors', turning a conditional rule into an unconditional one.", "Citing the compressed text rather than the source makes verification fail against the original document."],
    v: "Compress a passage containing an exception clause and confirm the clause remains in the output; compare answers with and without compression on questions that depend on exceptions.",
    dep: ["context-budgeting", "model-serving-gateway"]
  },
  "source-metadata-injection": {
    s: "Labels each passage in the prompt with identifiers and facts such as title, date, section and author, so the model can cite precisely and weigh sources by recency or authority.",
    d: "Each passage is wrapped in a delimited block carrying a short stable id, document title, date, version, section path and sometimes trust level. The prompt instructs the model to cite by id and prefer newer or official sources when they conflict. Delimiters also help separate retrieved text from instructions. The difficulty is the balance: more metadata uses window space and can distract the model, while too little leaves it unable to resolve conflicts or cite the right place.",
    k: ["Short ids mapped back afterward vs full titles in the prompt: short ids save tokens and are easy to verify, but give the model less meaning to reason about.", "Including dates and authority levels vs omitting them: they let the model resolve conflicts sensibly, but invite over-weighting a label that may be wrong."],
    p: ["Reusing ids across requests in the same session makes a citation point to a different passage than the user saw.", "Unescaped delimiters in document text let a passage break out of its block."],
    v: "Ask a question where two dated versions of a policy are retrieved and confirm the answer cites the newer one by its id and the citation resolves to the correct document version.",
    dep: ["prompt-templates", "metadata-enrichment", "document-versioning"]
  },
});
