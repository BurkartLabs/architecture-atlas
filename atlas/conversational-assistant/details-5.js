// Details for the conversational assistant plate, part 5: analytics, testing and platform.
ATLAS.details("conversational-assistant", {
  "conversation-logging": {
    s: "Captures each turn with its understanding, decisions, tool calls, latency and versions into a searchable log for debugging, analytics and improvement.",
    d: "Every turn emits a structured event: normalized and raw input, recognized text and confidence, intent and entities, policy decision, retrieved sources, tool calls and results, the reply, timings and the versions of models, prompts and flows. Events flow through a pipeline that redacts sensitive data, enriches them and writes to storage for search and analysis. Logs are the raw material for everything in the analytics layer. They differ from the history store in being optimized for analysis and allowed shorter retention. The challenge is capturing enough to reproduce a failure without storing data that should not be kept.",
    k: ["Log everything with redaction versus log selectively: everything makes failures reproducible, while selective logging reduces risk and misses the case you later need.", "Structured events versus free-text logs: structured events enable analysis and alerting, but require a schema that evolves with the assistant."],
    p: ["Logs lack the model and prompt version, so a regression cannot be tied to a change.", "Logging is synchronous and a slow log store adds delay to every turn."],
    v: "Run a test conversation and reproduce one turn's decision from its log alone: input, scores, retrieved passages, chosen action, and the versions in effect. Confirm sensitive fields appear only in redacted form.",
    dep: ["pii-redaction", "event-bus"]
  },
  "outcome-metrics": {
    s: "The measures of whether conversations achieved their purpose, such as task completion, containment, handoff rate, repeat contact, satisfaction and time to resolution.",
    d: "A conversation is labeled with an outcome: resolved by the assistant, handed off, abandoned or failed, using flow completion events, explicit feedback and follow-up signals such as the same person contacting again within days. Containment, the share not reaching a human, is easy to measure and easy to game, because a person who gives up looks contained. Better metrics tie to goals: did the refund happen, did the question get a correct answer. Metrics are segmented by intent, channel, language and version. The hard part is measuring correctness at scale, since most conversations have no ground truth.",
    k: ["Containment versus verified resolution: containment is cheap and rewards hiding the human option, while verified resolution measures real outcomes and needs follow-up data.", "Per-conversation outcome versus per-turn quality: conversation outcomes reflect user value, while turn-level quality locates where it went wrong."],
    p: ["Containment rises after the handoff button is hidden, and nobody notices that repeat contacts rise as well.", "Averages across languages hide a failing one."],
    v: "Pick fifty conversations labeled contained and review them by hand. Confirm what share were truly resolved, and compare it to repeat-contact rates from the same period.",
    dep: ["conversation-logging", "feedback-capture"]
  },
  "failure-clustering": {
    s: "Groups failed or poor conversations by cause, such as misrecognized names or a missing intent, so the team fixes the largest and most fixable problems first.",
    d: "Candidate conversations come from fallbacks, handoffs, negative feedback, repeated rephrasing and low-score turns. A model or embedding groups them by similarity and labels each cluster by topic, such as 'asking about delivery to a new address with no matching flow'. Clusters are ranked by volume and impact and linked to example transcripts. They become tickets: new training examples, a flow change, a knowledge article, a pronunciation entry. It is hard because clusters must be specific enough to act on, and because a growing taxonomy of causes needs maintenance.",
    k: ["Automatic clustering versus manual tagging: automatic scales to all traffic and gives rough groups, while manual tags are accurate and cover a small sample.", "Cluster by user words versus by failure cause: user-word clusters reveal new needs, while cause clusters point to the component to fix."],
    p: ["The largest cluster is vague ('other') and hides several distinct problems.", "Clusters are reviewed monthly, so a regression from a release goes unnoticed for weeks."],
    v: "Seed a test log with known failure types in known proportions. Confirm clusters recover them with matching volumes, each cluster links to examples, and a new failure type appears as a new cluster within a day.",
    dep: ["conversation-logging", "fallback-handler"]
  },
  "transcript-review": {
    s: "Tools for people to read, label and annotate sampled conversations, producing ground truth for quality measurement and examples for improvement.",
    d: "Reviewers see a conversation with its internal decisions, label whether each turn was correct, tag the failure cause, correct the intended intent or reply, and flag policy problems. Sampling is a mix of random, low-confidence, negative and high-risk cases. Reviewer agreement is measured and guidelines are refined. The labels feed evaluation sets and training data. Access is restricted and personal data masked. It is hard to keep consistent across reviewers, to produce enough labels, and to keep sensitive content protected, since reviewers see real conversations.",
    k: ["Internal reviewers versus an outside labeling service: internal reviewers know the domain and the policy, while outside services scale but see sensitive data and need clear instructions.", "Random sampling versus targeted: random is unbiased but finds rare failures slowly, while targeted finds problems and gives a skewed picture."],
    p: ["Reviewers disagree on what counts as a correct answer, so labels are noise.", "Sampling concentrates on failures and the assistant's rate of good answers is never measured."],
    v: "Have two reviewers label the same fifty conversations. Confirm agreement meets the target, disagreements are resolved into guideline updates, and the labels flow into the evaluation set with their reviewer and date.",
    dep: ["conversation-logging", "pii-redaction", "nlu-evaluation-sets"]
  },
  "feedback-capture": {
    s: "Collects the person's own signals on quality, such as thumbs, ratings, comments and corrections, and links each to the exact turn and versions involved.",
    d: "Feedback can be explicit (thumbs, a post-conversation survey, a 'wrong answer' report with a reason) or implicit (rephrasing the question, asking for a human, abandoning). Each signal attaches to a turn identifier, so it can be joined to the log and the versions in use. Prompts for feedback are placed sparingly. Feedback is biased toward the extremes and toward certain users, and a thumbs-down seldom says why. It is most useful when it triggers action: routing flagged answers to review, correcting content and closing the loop where possible.",
    k: ["Explicit ratings versus implicit signals: ratings are direct and sparse and biased, while implicit signals cover all conversations and need interpretation.", "Ask after every conversation versus sample: asking always gives volume and fatigue, while sampling reduces annoyance and gives noisier segments."],
    p: ["Feedback is stored without the turn identifier and cannot be linked to what the assistant said.", "A satisfaction score is reported without noting that only a small share of people answered."],
    v: "Submit a thumbs-down with a reason on a specific reply. Confirm it appears linked to that turn with versions, reaches the review queue, and counts in the segment's metrics with the response rate shown.",
    dep: ["conversation-logging", "transcript-review"]
  },
  "cost-latency-monitoring": {
    s: "Tracks spend and response time per turn, flow, model and tenant, and alerts when they exceed budget or drift upward.",
    d: "Each turn's log includes tokens in and out by model, speech minutes, tool calls, retrieval queries and stage latencies. Dashboards aggregate by flow, intent and version, show percentile latency and cost per resolved conversation, and compare against budgets. Alerts fire on spikes, such as a prompt that grew tenfold or a retry storm. It informs routing to cheaper models and cache decisions. It is hard because costs are spread across vendors and metrics, because averages hide slow tail turns, and because quality changes made to cut cost need measuring in parallel.",
    k: ["Cost per turn versus cost per resolved conversation: per turn is easy to measure, while per resolved conversation includes retries and handoffs and shows the real expense.", "Real-time budget enforcement versus after-the-fact reports: enforcement prevents runaway spend and can cut service, while reports leave a gap for abuse to run."],
    p: ["A prompt change doubles input size and nobody sees it until the invoice.", "Percentile latency is measured at the server and misses time spent in the channel."],
    v: "Deploy a prompt change that adds a long instruction. Confirm the dashboard shows the token increase per flow within minutes, cost per conversation rises, and the budget alert fires.",
    dep: ["conversation-logging", "turn-tracing", "model-gateway"]
  },
  "drift-detection": {
    s: "Watches for changes in what people ask, how they phrase it, and how the models behave, so decay in quality is noticed before users complain.",
    d: "It compares recent traffic with a reference period: intent mix, out-of-scope rate, score distributions, vocabulary, language mix, answer length and refusal rate. It also runs a fixed probe set against the live system on a schedule to catch silent model or content changes. Drift has several causes: seasonal topics, new products, marketing campaigns, a model provider update, a knowledge base change. Alerts point to the shifted segment. It is hard to separate meaningful drift from noise, and to decide what response follows: retrain, add content, or recalibrate thresholds.",
    k: ["Monitor inputs versus monitor outputs: input monitoring warns early without ground truth, while output monitoring shows actual quality and lags.", "Scheduled probe set versus passive traffic stats: probes catch silent model changes quickly with a small fixed set, while traffic shows real use and moves with the audience."],
    p: ["A model provider changes behavior silently, and quality falls for days because only traffic volume was monitored.", "Alerts fire on every holiday spike until people ignore them."],
    v: "Replay a fixed probe set daily and confirm scores are stable. Simulate a launch campaign that shifts the intent mix, and confirm an alert names the shifted intents within a day.",
    dep: ["conversation-logging", "nlu-evaluation-sets", "outcome-metrics"]
  },
  "scripted-dialogue-tests": {
    s: "Authored conversations with expected behavior at each step, run automatically to verify flows, slot handling, tool calls and wording on the paths that must not break.",
    d: "A test lists user turns and assertions about what the assistant does: the intent chosen, the slots filled, the tool called with these arguments, the reply containing required wording, the state at the end. Backends are replaced with fakes returning fixed results, and the model call is either recorded or stubbed for deterministic runs. Tests exist for each flow's main paths, error branches and escalation. They run on every change. It is hard because natural language varies, so assertions on exact reply text are brittle, and tests on generated text need looser checks.",
    k: ["Assert on actions and state versus on wording: actions and state are stable and meaningful, while wording assertions catch tone changes and fail on harmless edits.", "Stubbed model versus live model in tests: stubs are fast and deterministic and skip the model's real behavior, while live calls test it and are slow and variable."],
    p: ["Tests assert exact reply text, so every wording improvement breaks fifty tests.", "Fakes drift away from backend behavior and tests pass while production fails."],
    v: "Break a flow deliberately by removing a required confirmation step. Confirm the matching scripted test fails and names the missing step, and restoring the step passes it.",
    dep: ["flow-definitions", "dialogue-state-tracker"]
  },
  "simulated-users": {
    s: "Automated conversational partners, often model-driven, that play personas with goals to exercise the assistant at scale and find failures no one scripted.",
    d: "Each simulated user has a goal ('change my delivery date'), a persona (terse, confused, adversarial), facts it knows and behaviors such as typos, topic changes and refusing to confirm. It converses with the assistant until the goal is met, abandoned or a turn limit is reached, and a checker judges the result. Runs cover thousands of conversations before a release. Adversarial personas test guardrails. It is hard because simulated users are too cooperative and fluent compared with real ones, so they miss the messy failures, and their results need calibrating against real transcripts.",
    k: ["Model-driven users versus scripted users: model-driven give variety and coverage, but are less reproducible, while scripted users are exact and narrow.", "Simulate from real transcripts versus invented personas: transcript-derived users are realistic and limited to what has been seen, while invented personas explore new ground."],
    p: ["Simulated users succeed at tasks that real people routinely fail, and give false confidence.", "A simulator and the assistant use the same model and share its blind spots."],
    v: "Run a thousand simulated conversations across personas before release. Compare their failure categories with those in real traffic, and confirm the simulator rediscovers three known bugs seeded into a test build.",
    dep: ["scripted-dialogue-tests", "model-graded-evaluation"]
  },
  "regression-suites": {
    s: "A growing set of past failures and important cases, rerun on every change to make sure fixed problems stay fixed and key behavior does not erode.",
    d: "Every real incident, reviewed failure and important scenario becomes a test: the conversation or utterance, the expected behavior and a note on why it exists. The suite runs in the release pipeline with pass thresholds, and results are compared against the previous version, showing which cases changed. It combines exact checks (tool calls, policy decisions) with graded checks for generated text. Suites cover languages and channels. It is hard to keep fast as it grows, to retire obsolete cases, and to separate a real regression from a harmless change in wording or model variance.",
    k: ["Hard pass-fail gates versus trend thresholds: hard gates stop bad releases and block on noise, while trend thresholds tolerate variance and let slow decay through.", "Run the full suite on every change versus a fast subset plus nightly full runs: full runs catch everything and slow development, while subsets are fast and miss interactions."],
    p: ["Cases come only from engineers' imagination and not from real failures.", "Flaky generated-text checks teach the team to ignore failing runs."],
    v: "Reintroduce the cause of a past incident in a test build. Confirm the matching regression case fails the pipeline, the report links it to the incident, and the fixed build passes.",
    dep: ["scripted-dialogue-tests", "transcript-review", "bot-versioning-release"]
  },
  "nlu-evaluation-sets": {
    s: "Labeled, held-out examples of real user messages with correct intents, entities and answers, used to score understanding models and set thresholds.",
    d: "Sets are sampled from real traffic, labeled by reviewers, and kept separate from training data so scores are honest. They include out-of-scope and hard cases, are balanced by language and channel, and for voice use real transcripts with recognition errors. Scoring reports precision, recall, confusion between intents and calibration. Evaluation sets must be refreshed as language and products change. It is hard because labels are expensive, because taxonomy changes invalidate old labels, and because teams unconsciously tune against the set until it stops measuring anything.",
    k: ["Real traffic samples versus synthetic examples: real samples reflect actual phrasing and need privacy handling, while synthetic examples are easy to create and miss real messiness.", "One shared set versus per-flow sets: a shared set gives a single score, while per-flow sets give depth on important tasks and more to maintain."],
    p: ["Examples from the evaluation set leak into training, and scores look better than real performance.", "The set is two years old and no longer resembles current requests."],
    v: "Score the live model on the set and on fresh labeled traffic from this week. Confirm the two results agree closely, and that no evaluation example appears in the training data by an overlap check.",
    dep: ["transcript-review"]
  },
  "model-graded-evaluation": {
    s: "Using a language model with a rubric to score open-ended replies for correctness, grounding, tone and policy compliance at scale, calibrated against human labels.",
    d: "A judge prompt receives the conversation, the reply, the supplied facts and a rubric, and returns scores with reasons. It scales evaluation to thousands of cases where exact matching is impossible. The judge is itself evaluated: its scores are compared with human labels on a sample, and its known biases (preferring longer answers, its own style) are measured. Pairwise comparison of two versions is usually more reliable than absolute scores. It is hard because judges are inconsistent, can be fooled, and share weaknesses with the system being judged, so they supplement and never replace human review.",
    k: ["Judge model different from the assistant's model versus the same: a different model reduces self-preference, while the same one is simpler and rates its own style higher.", "Absolute scores versus pairwise comparison: pairwise is more reliable for choosing between versions, while absolute scores are needed for thresholds and trends."],
    p: ["The judge rewards longer, more confident answers, so the team optimizes toward verbosity.", "The judge is never recalibrated after its model changes."],
    v: "Have the judge and two human reviewers grade a hundred replies including deliberately wrong ones. Confirm judge-human agreement meets the target and every planted error is scored as incorrect.",
    dep: ["transcript-review", "model-gateway"]
  },
  "voice-test-harness": {
    s: "An environment that places test calls with recorded or synthesized speech, noise and accents, and measures recognition, timing, interruption handling and audio quality end to end.",
    d: "Test callers play audio into the telephony gateway or microphone path, add controlled noise, packet loss and different accents or speaking rates, and record what the assistant says back with timestamps. The harness measures word error rate on key phrases, task completion, response delay, barge-in behavior and whether the synthesized reply was complete and intelligible. It runs for each release and on a schedule against production. It is hard because text-only tests miss the audio problems that dominate voice failures, and because realistic audio data across accents and devices is expensive to collect.",
    k: ["Synthesized test speech versus recordings of real people: synthesized is cheap and consistent but unrealistically clean, while real recordings reflect users and need collection and consent.", "Test through the real phone network versus simulate it: the real network finds true audio problems and is slower and costs money, while simulation is repeatable."],
    p: ["All test audio is studio-quality, so the first noisy call in production is a surprise.", "The harness does not test interruption, and barge-in bugs reach users."],
    v: "Call the assistant with a script of ten tasks under clean and noisy audio. Confirm completion rates for each condition, report response delay percentiles, and confirm an interruption cuts the reply within the target.",
    dep: ["telephony-gateway", "streaming-recognizer", "barge-in-handling"]
  },
  "canary-and-experiments": {
    s: "Releasing a change to a small share of real traffic and comparing it with the current version, to catch regressions and measure improvement before full rollout.",
    d: "Traffic is split by session or person so each conversation sees one version throughout. Versions are compared on outcome metrics, handoff rate, latency, cost and safety flags, with sample sizes that give meaningful differences. Guardrail metrics trigger automatic rollback. The same machinery runs experiments on prompts, models, flows or wording. Offline evaluation precedes it and cannot replace it, because real users reveal failures that test sets do not. It is hard because conversations are long, outcomes are delayed, traffic for rare intents is small, and a poor experience still costs the people who received it.",
    k: ["Split by conversation versus by turn: by conversation keeps experience coherent and halves the number of samples, while by turn is statistically larger and confusing to users.", "Automatic rollback versus manual review: automatic rollback limits harm quickly, but can trigger on noise and needs careful thresholds."],
    p: ["A canary served only easy intents by chance and the new version looks better than it is.", "Outcomes are checked after one hour, before the delayed signals arrive."],
    v: "Release a deliberately worse version to five percent of test traffic. Confirm assignment is sticky per session, the metrics comparison shows the degradation, and the guardrail triggers rollback within the stated time.",
    dep: ["bot-versioning-release", "outcome-metrics", "cost-latency-monitoring"]
  },
  "turn-orchestrator": {
    s: "The service that runs each turn through the pipeline: load state, understand, decide, call tools, generate, filter, send and save, enforcing timeouts and order.",
    d: "It receives a normalized turn, acquires the session, loads state and memory, calls understanding and retrieval (in parallel where independent), runs the dialogue policy, executes validated tool calls, builds and checks the reply, sends it, and writes state and logs atomically. It enforces per-stage timeouts, step limits and the fallback chain, and ensures one turn at a time per session. Streaming turns require it to coordinate partial outputs. It is the central coordinator and a single point of failure, so it is kept thin: no business logic, only sequencing. It is hard to keep fast, and to ensure partial failures leave consistent state.",
    k: ["Central orchestrator versus components calling each other: central coordination makes ordering, tracing and timeouts explicit, while peer calls reduce the bottleneck and spread control into hard-to-follow chains.", "Serialize turns per session versus allow concurrency: serializing prevents state races and delays rapid follow-ups, while concurrency answers faster and needs merging rules."],
    p: ["A failure after the tool call and before the state save repeats the action on retry.", "Business rules are added to the orchestrator until it becomes impossible to change."],
    v: "Inject a failure at each stage of a turn in turn. Confirm a consistent outcome every time: no duplicate actions, state matches what the person saw, and the failure is traced with its stage.",
    dep: ["session-state-store", "event-bus", "turn-tracing"]
  },
  "session-affinity": {
    s: "Routing so messages of one conversation reach a server that can process them in order with the right state, whether through sticky routing or shared state.",
    d: "Voice calls and streaming connections hold a long-lived link to one server, while text turns can land anywhere if state is external. The router keeps a session-to-server mapping where needed, rebalances when servers join or leave, and moves a session by reloading its state elsewhere. It also provides per-session ordering: a second message that arrives before the first is done is queued, not run in parallel. It is hard during deploys and failures: draining connections without dropping calls, and recovering a call whose server died, which for voice usually means reconnecting with context.",
    k: ["Sticky routing versus stateless any-server handling: sticky routing allows local caches and streaming and complicates failover, while stateless is resilient and pays a state read per turn.", "Queue per session versus reject overlapping messages: queuing preserves intent, while rejecting is simpler and loses what the person typed."],
    p: ["A deploy restarts servers and drops every active call.", "Messages for one session are handled in parallel on two servers and produce contradictory replies."],
    v: "Send ten rapid messages to one session across several servers. Confirm replies are produced in order, none lost, and killing the serving server mid-stream moves the session with state intact.",
    dep: ["session-state-store", "autoscaling-concurrency"]
  },
  "event-bus": {
    s: "The messaging backbone that carries turn events, callbacks, job completions and log events between components, with delivery guarantees and replay.",
    d: "Components publish events such as turn completed, handoff requested, job finished or content updated, and others subscribe. The bus provides durable queues, ordering within a conversation key, retry and dead-letter handling, and replay for recovery or new consumers. It decouples slow work (logging, analytics, memory extraction) from the live turn and delivers external callbacks to the right session. Delivery is usually at least once, so consumers must handle duplicates. It is hard to size and monitor, and to keep ordering guarantees where they matter without serializing all traffic.",
    k: ["At-least-once delivery with idempotent consumers versus exactly-once attempts: at-least-once is practical and demands care in every consumer, while exactly-once claims are costly and narrow.", "Partition by conversation versus by event type: by conversation preserves order for a session, while by type spreads load and can reorder one person's events."],
    p: ["A consumer crash loops on one bad event and blocks everything behind it.", "Slow analytics consumers back up the queue shared with live handoff events."],
    v: "Publish the same event twice and kill a consumer mid-processing. Confirm no duplicate effect, the event is redelivered, a poison event moves to the dead-letter queue, and replay restores a new consumer's state.",
    dep: []
  },
  "bot-versioning-release": {
    s: "Treats the assistant's flows, prompts, models, thresholds and content as versioned releases that can be promoted, pinned per session and rolled back as a set.",
    d: "A release bundles the flow definitions, prompt templates, model identifiers, thresholds, knowledge index version and policies, each version recorded and signed off after tests pass. Environments (development, staging, production) are promoted in order. A conversation is pinned to a version for its whole length, so a deploy never changes behavior midway. Rollback restores the previous bundle quickly. Because content and prompts change more often than code, they need the same discipline as code: review, tests, history. It is hard to keep the bundle coherent when parts change at different speeds, and to migrate sessions in progress.",
    k: ["One bundle versioned together versus independent component versions: bundles are reproducible and easy to roll back, while independent versions allow faster changes and combinations nobody tested.", "Pin sessions to their start version versus move to the latest: pinning keeps conversations coherent and runs several versions at once, while moving is simpler and can break in-flight flows."],
    p: ["A prompt is edited in production without a version and nobody can say what ran yesterday.", "Rollback restores flows but not the knowledge index, so behavior stays wrong."],
    v: "Promote a release, then roll back. Confirm every conversation shows which bundle it ran under, sessions started before promotion finish on the old version, and rollback restores prompts, flows, thresholds and index together.",
    dep: ["config-and-secrets"]
  },
  "config-and-secrets": {
    s: "Central storage for settings, feature flags and secrets such as keys and tokens, with scoping, access control, rotation and change history.",
    d: "Settings control thresholds, limits, tool availability, regions and tenant options, and are changed without redeploying, within validation rules. Secrets for models, telephony and backends live in a vault, fetched by services at start or on demand, never in code, prompts or logs. Changes are recorded and reversible, and scoped per environment and tenant. Rotation must work without downtime. It is hard because configuration changes behavior as much as code does, so unreviewed changes cause incidents, and because secrets spread into logs, traces and prompts unless actively kept out.",
    k: ["Dynamic configuration versus configuration baked into releases: dynamic changes are fast and can bypass testing, while baked-in configuration is reproducible and slow to change.", "Per-tenant overrides versus global defaults: overrides fit customers and multiply combinations to test."],
    p: ["A threshold is changed live during an incident and never recorded, so the next deploy undoes it.", "A secret appears in a debug log and a trace."],
    v: "Change a threshold through the configuration system and confirm it applies within seconds with an audit entry and an easy revert. Rotate a model key and confirm no dropped turns and no copy of the old key remains.",
    dep: []
  },
  "autoscaling-concurrency": {
    s: "Adding and removing capacity as load changes, and limiting concurrent work on models, speech and backends, so peaks are absorbed without failure or runaway cost.",
    d: "Load is bursty: a campaign or outage makes thousands of people arrive at once. Stateless services scale on request rate and latency; model and speech capacity is limited by quotas, so the system queues, prioritizes (live voice over background jobs) and sheds load by refusing low-priority work. Concurrency limits per dependency stop one slow backend from consuming every worker. Voice adds hard limits on simultaneous calls. It is hard because scaling takes minutes while spikes take seconds, because external quotas cap what scaling can achieve, and because cold starts for models add delay.",
    k: ["Scale reactively versus pre-scale for known events: reactive scaling is automatic and slow for spikes, while pre-scaling is reliable for planned peaks and wasteful otherwise.", "Queue excess load versus reject it: queuing keeps requests and increases waits, while rejecting protects latency for those admitted."],
    p: ["A model quota is exhausted at peak and every conversation fails together.", "Background analytics jobs compete with live turns for the same capacity."],
    v: "Ramp synthetic load past capacity. Confirm instances are added within the target time, live voice keeps its latency while background work is shed, and a slowed backend does not stop other flows.",
    dep: ["model-gateway", "event-bus"]
  },
  "turn-tracing": {
    s: "Following a single turn through every stage and dependency with timing and decisions attached, so a slow or wrong reply can be explained after the fact.",
    d: "Each turn carries a trace identifier through channel, recognition, understanding, retrieval, model calls, tools, filters and delivery. Each stage records start, end, status and key attributes such as model, intent, retrieved sources and chosen tool. Traces are sampled, with errors and slow turns kept in full, and linked to the conversation log. Engineers search by conversation or user report to see where time went and why a decision was made. It is hard to propagate identifiers across asynchronous boundaries and vendors, and to hold sensitive content in traces to the same standards as logs.",
    k: ["Trace every turn versus sample: full tracing explains any complaint and costs storage, while sampling is cheap and may miss the one a user reports.", "Include content in traces versus metadata only: content makes debugging possible, while metadata only keeps traces free of personal data."],
    p: ["The trace identifier is dropped at the model call, so the slowest stage is invisible.", "Traces store prompts with personal data under looser access than logs."],
    v: "Take a user complaint about a slow answer, find its trace, and read where the time went by stage, which model and tools ran, and why. Confirm sensitive fields follow the same redaction as logs.",
    dep: ["conversation-logging"]
  }
});
