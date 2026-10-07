// Details for the live streaming plate, part 4: moderation, monetization, monitoring.
ATLAS.details("live-streaming", {
  "chat-automod": {
    s: "Automated filtering of chat messages before they reach viewers, using word lists, pattern rules and classifiers, tuned by each channel's moderation level.",
    d: "Each message passes through checks in a fixed order: blocked terms, link and spam patterns, repeated-text detection, and classifiers for harassment or hate. Results are allow, hold for review, or reject, depending on the channel's settings and the sender's standing. Checks must complete in a few milliseconds, since they sit in the delivery path. The difficulty is evasion and context: users alter spelling to dodge lists, while the same word may be abuse in one channel and a joke in another.",
    k: ["Block outright vs hold for a moderator: fewer harmful messages shown, but holding adds delay and creates a review queue that can overwhelm moderators.", "Platform-wide rules vs per-channel settings: consistent baseline safety, against communities that need different norms."],
    p: ["Users insert spaces or lookalike characters, and the word list matches nothing while abuse flows freely.", "An overly broad pattern blocks legitimate messages, such as place names, and viewers blame the broadcaster."],
    v: "Send a labeled test set of abusive, borderline and normal messages and confirm measured block rate and false-positive rate meet targets, and added delay stays under the budget at peak message volume.",
    dep: ["chat-gateway","identity-and-auth","user-reports-queue"]
  },
  "stream-classification": {
    s: "Analyzes the live video and audio for prohibited or age-restricted content, flagging streams for review or action within seconds.",
    d: "Sampled frames and audio chunks are sent to classifiers that score categories such as violence, nudity or self-harm, alongside text recognition for overlays. Scores combine with context such as channel history and viewer reports to decide whether to alert a human, apply an age gate, or cut the stream. Because content cannot be reviewed beforehand, speed matters, but sampling every stream at full rate is expensive, so frequency rises for new or flagged channels. Errors both ways are costly.",
    k: ["Sample more often vs less: faster detection, against compute cost proportional to the number of streams.", "Automatic cut-off vs human review first: faster harm reduction, but wrongful cuts of legitimate live events are very visible."],
    p: ["A violent moment lasts two seconds between samples and is never seen.", "A classifier trained on one kind of content flags a legitimate sport or game as violence."],
    v: "Feed labeled test streams containing known violations into the pipeline. Measure the time from the first violating frame to a flag, and the false-positive rate on a large set of normal streams.",
    dep: ["thumbnail-generator","abr-ladder","user-reports-queue","event-bus"]
  },
  "moderator-tools": {
    s: "The interface and permissions that let broadcasters and appointed moderators act on chat and viewers in real time: timeouts, bans, deletions and mode changes.",
    d: "A moderator sees a live chat view with user history, and acts through a few quick controls. Actions go through the same message path so they take effect for everyone almost immediately: a deletion removes the message from every client, a ban stops delivery and posting. Roles define what each moderator may do, and every action is logged. The difficulty is speed and scale: in a raid, hundreds of messages arrive per second, and tools need bulk actions, searches and shared context between moderators.",
    k: ["Bulk and pattern actions vs one at a time: fast response to a flood, at a risk of banning many innocent viewers by mistake.", "Broadcaster-appointed moderators vs platform staff only: scalable community control, but uneven quality and the platform remains responsible."],
    p: ["Moderator actions arrive late for viewers behind on delivery, so deleted messages remain visible on some screens.", "A moderator account is compromised and used to ban viewers in bulk."],
    v: "Have a moderator delete a message and ban a user in a channel with 10,000 test viewers, and confirm the message disappears for all within a second, the banned user's further posts are rejected, and audit entries are recorded.",
    dep: ["chat-gateway","identity-and-auth","chat-history"]
  },
  "user-reports-queue": {
    s: "Collects viewer reports about streams, messages and users, prioritizes them and routes them to human reviewers with the evidence attached.",
    d: "A report carries the reporter, the target, a reason and automatic context, such as a clip of the stream at that moment and recent chat. The queue ranks by severity, the number of reporters, the target's audience size and whether automated systems agree. Live content raises priority because harm is ongoing. Reviewers act, and the outcome feeds back to improve classifiers. The challenges are volume, brigading, where groups file false reports to silence a broadcaster, and ensuring evidence is captured before the stream moves on.",
    k: ["Rank by severity and live audience vs first come first served: urgent harm is handled first, but low-priority reports may wait indefinitely.", "Automatic evidence capture vs reviewer fetches: no evidence is lost, but storage and privacy handling are required."],
    p: ["Coordinated false reports bury a legitimate broadcaster's stream in the queue and trigger automatic action.", "Evidence is collected after the stream ends, and the reviewer cannot see what actually happened."],
    v: "File reports of different severity against a live test stream and confirm they are ranked as designed, evidence from the report moment is attached, and the urgent one reaches a reviewer within the target time.",
    dep: ["stream-classification","chat-history","recorder","identity-and-auth"]
  },
  "ban-evasion-detection": {
    s: "Recognizes when a banned person returns under a new account, by comparing signals such as device, network and behavior, and applies the ban again.",
    d: "Bans attach to accounts, which are cheap to create, so the platform correlates signals: device identifiers, network addresses, account age, behavior patterns and message style. A model scores the likelihood that a new account is a returning banned user, and the channel's settings decide whether to block, restrict or hold messages. Signals are probabilistic and shared networks make false matches likely, so the response is graduated. Privacy rules limit which signals may be kept and for how long.",
    k: ["Aggressive matching vs conservative: fewer returning abusers, but more innocent users on shared networks are blocked.", "Platform-wide bans vs channel bans: strong protection for the worst abusers, but requires evidence standards and an appeal path."],
    p: ["A shared university or mobile network matches many innocent users to one banned person.", "Evaders learn which signals are used and rotate them, reducing detection over time."],
    v: "Create test accounts that mimic evasion and legitimate shared-network users, then measure detection rate and false-match rate at the chosen thresholds, and confirm every restriction can be traced to its signals.",
    dep: ["identity-and-auth","chat-automod","takedown-actions"]
  },
  "copyright-detection": {
    s: "Matches live audio and video against fingerprints of protected works, so rights holders' claims are honored or disputed while the stream is still running.",
    d: "The platform computes fingerprints from the stream's audio and sampled video and compares them against a database supplied by rights holders. A match returns the work and its owner's policy: allow, monetize, mute or block. Live detection must be fast but any action on a live stream is disruptive, so platforms often mute only the affected recording segments or restrict the recording rather than the broadcast. Accuracy is hard with background music, short clips and transformed audio.",
    k: ["Block the live broadcast vs only the saved recording: rights holders are satisfied quickly, at the cost of interrupting a stream that may be legitimate.", "Strict matching vs generous: fewer wrongful claims, but more infringement gets through."],
    p: ["Background music at a public venue produces a claim that takes the whole stream offline.", "Fingerprint database updates lag, and newly released content plays freely for days."],
    v: "Play a known protected track at several qualities and volumes in a test stream and confirm the match time, the action taken and that a license-cleared test track produces no claim.",
    dep: ["recorder","audio-transcode","takedown-actions"]
  },
  "takedown-actions": {
    s: "The set of enforcement steps and their machinery: cut a stream, remove a recording, restrict a channel or suspend an account, with consistent propagation and records.",
    d: "An action is decided by a rule, a classifier or a reviewer and recorded with its reason and author. It then has to take effect everywhere: stop the stream at the registry and ingest, revoke tokens at the CDN, hide recordings and clips, remove from directories and search, and notify the broadcaster. Propagation across caches takes time, so removal is not instant. Appeals depend on the audit trail. The difficulty is reversibility: an action must be undoable if it was wrong, including restoring content that was hidden but not deleted.",
    k: ["Hide first and delete later vs delete immediately: reversible if the decision was wrong, but content remains stored and accessible to staff.", "Cut the stream instantly vs warn first: fast protection from harm, against rights of broadcasters who made a mistake."],
    p: ["A stream is cut but its clips and recordings remain available and spread.", "An action propagates to the registry but cached manifests keep serving for minutes."],
    v: "Apply a takedown to a test stream and measure the time until ingest stops, edge requests fail, directory entries vanish and clips become unavailable, and confirm an audit record and notice are generated.",
    dep: ["stream-registry","signed-urls","retention-policy","event-bus"]
  },
  "age-and-region-gating": {
    s: "Restricts who may watch a stream by viewer age and location, applying broadcaster settings, legal limits and rights restrictions before video is served.",
    d: "At playback request time the platform evaluates the viewer's account age, verified status and region, derived from the connection, against the stream's rating and rights territories. If denied, it returns no token and shows an explanation. Regional rights are common for sports and licensed events, and enforcement relies on geolocation of IP addresses, which is imperfect and evaded by tunnels. The gate sits on the access path for everyone, so it must be fast and cached, and rule changes must propagate immediately.",
    k: ["Enforce at token issue vs at the edge: easy to change and audit, but a token already issued stays valid until it expires.", "Strict verification vs self-declared age: legal protection and fewer minors exposed, against friction and heavy data collection."],
    p: ["IP geolocation errors block legitimate viewers or allow restricted regions through a tunnel.", "A rule change does not reach edges, and tokens issued before it keep working for an hour."],
    v: "Request playback from test accounts and networks in allowed and restricted regions and ages. Confirm correct allow and deny results, no token on deny, and that a rule change takes effect within the stated time.",
    dep: ["entitlements","signed-urls","identity-and-auth"]
  },
  "entitlements": {
    s: "The record of who may watch which content, based on subscription, purchase, ticket, region or gift, checked at playback start and renewed during viewing.",
    d: "An entitlement service answers one question quickly: can this account play this stream now. It combines active subscriptions, one-time purchases, channel memberships, bans and rights rules, and its answer is turned into a signed token. It must respond in tens of milliseconds at peak, so results are cached and entitlement data is replicated near the edge. Consistency matters in both directions: a lag after payment sends a paying viewer to an error page, and a lag after cancellation gives free access.",
    k: ["Cache entitlement decisions vs check each time: fast and resilient under a surge, but changes such as refunds apply late.", "Fail open vs fail closed when the service is down: viewers keep watching, against giving access to people who have not paid."],
    p: ["A payment completes but the entitlement is not visible for a minute, and the buyer sees a paywall.", "The service outage at event start blocks every paying viewer because the default is to deny."],
    v: "Purchase access in a test account and measure time until playback is allowed. Cancel and measure time until denial. Then stop the service and confirm the chosen failure mode applies and is alerted.",
    dep: ["identity-and-auth","subscriptions","revenue-ledger"]
  },
  "subscriptions": {
    s: "Recurring payments that give a viewer access or benefits for a channel or the platform, with billing cycles, renewals, grace periods and cancellation.",
    d: "A subscription record has a plan, a state and billing dates. A payment service charges on schedule and reports success or failure; failures enter retry and a grace period before access ends. Platform stores and web checkouts both create subscriptions, so the same person may hold several and the platform reconciles them. Revenue is split between the platform and the broadcaster, and the benefits, such as emotes, ad removal and chat badges, are granted through entitlements. The difficulty is state: renewals, upgrades, refunds and chargebacks all change it asynchronously.",
    k: ["Grace period after a failed payment vs immediate revoke: fewer lost customers from temporary card issues, but some free viewing.", "One subscription system across all purchase routes vs per-route handling: consistent behavior, but stores report events differently and late."],
    p: ["A webhook from the payment provider is missed and a cancelled subscriber keeps access for months.", "Proration errors on upgrades produce wrong charges and support load."],
    v: "Run a test subscription through purchase, renewal, a failed payment, grace period, recovery and cancellation, and confirm entitlements, ledger entries and notifications match the expected state at each step.",
    dep: ["entitlements","identity-and-auth","revenue-ledger","event-bus"]
  },
  "tips-and-virtual-goods": {
    s: "One-time payments from viewers to broadcasters, either as direct tips or as purchased tokens spent on animated effects and gifts during the stream.",
    d: "A viewer buys a balance, spends it in the channel, and the platform shows the gift on screen and in chat while crediting the broadcaster. Spending is a ledger operation that must be atomic and idempotent, since duplicate clicks and retries are common, and visible effects must fire in the right moment across viewers with different delays. Fraud is the central risk: stolen cards produce chargebacks after the broadcaster has been credited, so payouts are delayed and flagged for review.",
    k: ["Platform currency vs direct payments: lower fees on small amounts and easier spending, but regulatory obligations and a liability for unspent balances.", "Show gifts immediately vs after payment confirmation: instant feedback, against the risk of effects for payments that later fail."],
    p: ["A retry double-charges a viewer because the spend request was not idempotent.", "Chargebacks arrive weeks after the broadcaster was paid, leaving the platform with the loss."],
    v: "Send 1,000 gifts including retries and duplicates and confirm the viewer balance, broadcaster credit and ledger sum agree exactly, each gift shows once on screen, and a simulated chargeback reverses the credit.",
    dep: ["revenue-ledger","identity-and-auth","timed-metadata-sync","chat-fanout"]
  },
  "ad-decisioning": {
    s: "Chooses which ad, if any, to show a viewer at an ad break, from available campaigns, targeting rules, bids and the viewer's context.",
    d: "At a break, the platform asks an ad server for a decision using the stream, region, device and any consented viewer information. Advertisers compete in an auction or through direct campaigns with delivery goals, and the response names a creative with tracking events. The decision must arrive in a few hundred milliseconds, before the break starts, so it is requested ahead of time and cached. It also enforces rules such as category exclusions and frequency limits, and handles no-fill gracefully rather than showing silence.",
    k: ["Auction in real time vs pre-fetched decisions: higher prices from fresh bids, against the risk of the answer arriving after the break begins.", "Contextual targeting vs personal targeting: fewer privacy obligations, against lower revenue where personal data is allowed."],
    p: ["The ad server is slow during a spike and breaks run with no ad, losing revenue invisibly.", "A creative is longer than the break and cuts into content."],
    v: "Trigger 10,000 breaks with a throttled ad server. Confirm decisions return within the deadline for at least 99%, no-fill falls back to a house ad, and impression reports match the breaks played.",
    dep: ["ad-break-markers","frequency-capping","identity-and-auth","event-bus"]
  },
  "server-side-ad-insertion": {
    s: "Stitches ad video into the stream on the server, so each viewer receives one continuous stream in which ads look like content and cannot be skipped by blocking requests.",
    d: "On a break marker, the insertion service replaces the live segments with ad segments chosen for that viewer, rewriting each viewer's manifest. Ads are prepared in the same ladder and keyframe alignment as the stream to switch smoothly. Because manifests become per-viewer, caching of manifests weakens and the service must scale with viewers, though media segments remain shared. Tracking beacons are fired by the server or the player. Mismatched formats or timing at the join are the common visible faults.",
    k: ["Server-side insertion vs client-side: harder to block and smoother playback, but per-viewer manifests cost compute and weaken caching.", "Personalized ads for each viewer vs one ad per cohort: higher value per ad, but more manifest variants and less cache sharing."],
    p: ["An ad encoded with different keyframes or audio parameters causes a glitch or silence at the transition.", "Per-viewer manifest generation overloads at the start of a break when everyone requests at the same moment."],
    v: "Play through 100 breaks and confirm each transition has no gap or freeze longer than one frame, audio stays continuous, tracking events fire once per ad, and manifest service latency stays in budget at peak.",
    dep: ["ad-decisioning","ad-break-markers","hls-manifests","keyframe-alignment"]
  },
  "frequency-capping": {
    s: "Limits how often a viewer sees the same ad or how many breaks they get per hour, so advertising stays tolerable and campaign promises are met.",
    d: "A counter store records ad impressions per viewer and campaign, queried by the ad decision service for each break. Caps exist per campaign, per advertiser and per platform policy, such as a maximum number of ad minutes per hour. The store must answer in milliseconds and tolerate a very high write rate. Identity makes it harder: viewers who are not signed in or who use several devices cannot be counted reliably, so caps are enforced only approximately.",
    k: ["Strict global counters vs approximate local counters: accurate caps, but a shared store on the critical path and higher cost.", "Cap by account vs by device: account caps follow the person, but exclude signed-out viewers who are most of the audience."],
    p: ["Counters update after the break, so a viewer sees the same ad several times in one session.", "A counter store outage resets caps and floods viewers with ads."],
    v: "Simulate one viewer through ten breaks against a campaign capped at three impressions per hour, and confirm exactly three are served, then reset after the window, with counts matching the impression log.",
    dep: ["ad-decisioning","identity-and-auth"]
  },
  "revenue-ledger": {
    s: "The authoritative, append-only record of every payment, ad impression, gift and refund, from which payouts, taxes and reports are computed.",
    d: "Each financial event becomes a ledger entry with amount, parties, currency and a unique identifier, so a retry cannot create a duplicate. Entries are immutable: corrections are new entries that reverse earlier ones. Balances are derived by summing entries. Inputs arrive from payment providers, ad networks and the platform itself, and each reports in its own format, currency and time. The ledger must reconcile with external statements, and the difficulty is late, duplicated and out-of-order events.",
    k: ["Append-only entries vs mutable balances: complete history and easy audit, but balances require aggregation and compaction.", "Real-time posting vs batch reconciliation: live balances for broadcasters, but external statements can disagree and require adjustments later."],
    p: ["A duplicated provider event is posted twice, overpaying a broadcaster.", "Currency conversion applied at different times by different services leaves totals that do not match the bank."],
    v: "Replay a day of provider events including duplicates and out-of-order ones into a test ledger, and confirm totals match the provider statement to the cent and every entry traces to a source event.",
    dep: ["object-storage","event-bus","identity-and-auth"]
  },
  "payouts": {
    s: "Periodically transfers earned money to broadcasters after holds, fees, taxes and thresholds are applied, with records for each payment.",
    d: "A scheduled job reads each broadcaster's ledger balance, subtracts holds for chargeback risk, applies minimum thresholds and tax withholding, and sends instructions to payment partners. Eligibility depends on verified identity and tax forms, and rules vary by country. Failures, such as an invalid bank account, return asynchronously and must be handled without paying twice. Every payment is traceable back to the entries it covers. Fraud checks apply: a broadcaster paid for fake views or stolen-card tips represents a loss.",
    k: ["Longer holds vs faster payouts: protects against chargebacks and fraud, but broadcasters wait and may leave.", "One payout run for everyone vs rolling: simple reconciliation, but concentrated load and cash needs on one date."],
    p: ["A payout job retried after a timeout pays the same broadcaster twice.", "Missing tax information blocks payments silently, and broadcasters think the platform is withholding money."],
    v: "Run a payout cycle in a sandbox with failing accounts and retries. Confirm each broadcaster is paid once, failed payments are returned to balance, and the ledger shows entries for fees, holds and transfers.",
    dep: ["revenue-ledger","identity-and-auth","takedown-actions"]
  },
  "ingest-health-metrics": {
    s: "Measurements of the incoming stream itself: bitrate, frame rate, keyframe interval, dropped frames and connection quality, computed as the stream arrives.",
    d: "The ingest server computes per-stream metrics every second: received bitrate against target, gaps in timestamps, keyframe spacing, audio-video drift and retransmission rate. These feed dashboards, alerts and the feedback shown to the broadcaster. They are the earliest warning, since every downstream problem begins with a bad source. The metrics must be cheap and per stream, so they are computed inline and aggregated over short windows. The hard part is thresholds: normal variation differs by encoder and content.",
    k: ["Per-second metrics vs sampled: catches brief faults, against the storage and cost of high-frequency series for every stream.", "Fixed thresholds vs baselines per stream: simple and predictable, but noisy for streams whose normal behavior differs."],
    p: ["Averaging over a minute hides a ten-second stall that viewers saw clearly.", "A metric for bitrate alone passes a stream whose video froze while the encoder kept sending padding."],
    v: "Throttle a test source, inject a keyframe drift, and stop video while audio continues. Confirm each fault appears in the metrics within a few seconds and triggers the matching alert.",
    dep: ["rtmp-ingest","srt-ingest","webrtc-ingest","alerting-and-slos"]
  },
  "synthetic-viewers": {
    s: "Automated players run from many locations that watch streams continuously and report what a real viewer would see, including startup time and stalls.",
    d: "Probes run real player code against live and test streams from many networks and regions. They measure join time, rendition reached, stalls, delay behind the live edge and whether video is advancing, by decoding and checking frames. Because they watch constantly, they detect problems before enough real viewers report them, and in places with few viewers. They are the only monitoring that tests the path end to end from outside. Their cost and limits are coverage: probes are not real devices or real home networks.",
    k: ["Probes from datacenters vs from real consumer networks: easy and stable, but miss last-mile problems that most viewers experience.", "Watch a dedicated test stream vs real channels: controlled and always present, but may not exercise the same code paths."],
    p: ["Probes run inside the same cloud as the origin and never see a failure of the public path.", "A probe only checks that segments download, so a frozen picture with valid segments passes."],
    v: "Break delivery for one region, such as returning stale manifests, and confirm probes there alert within a minute while other regions stay green, and that a frozen-frame detection triggers on a looped input.",
    dep: ["media-decode-path","multi-cdn-steering","alerting-and-slos"]
  },
  "viewer-qoe-metrics": {
    s: "Aggregated measures of what viewers experience: time to first frame, rebuffering ratio, average quality, error rate and delay, broken down by network, device and CDN.",
    d: "Player beacons are aggregated into rates and percentiles by region, network provider, device, CDN and stream. These show who is affected and where the cause may lie. The key metrics are join failures, join time, rebuffering as a share of watch time, bitrate and exit before video starts. Averages hide tails, so percentiles matter. The challenge is attribution: a high rebuffer rate in one provider's customers may be the access network, a CDN peering problem or a bad release.",
    k: ["Few headline metrics vs a large set: focus and clear targets, but fewer clues when a problem appears.", "Weight by watch time vs by session: reflects what matters to long viewers, but hides startup failures of those who never started."],
    p: ["A failing player never reports, so the error rate looks fine while many viewers see nothing.", "An aggregate across all regions hides a severe problem in one that is small by share."],
    v: "Throttle a test group of players and compare the computed rebuffer ratio and join time with values measured on those test devices directly. Differences should be within a few percent, and the slice view should isolate the group.",
    dep: ["player-beacons","realtime-analytics","cdn-log-pipeline"]
  },
  "cdn-log-pipeline": {
    s: "Collects request logs from every delivery network, normalizes them and makes them queryable, giving the server-side view of traffic, errors, hit ratios and cost.",
    d: "Each CDN writes logs in its own format, delivered with delays from seconds to minutes. The pipeline ingests them, converts to a common schema, joins them with stream and session identifiers, and loads them for analysis. They show request volumes, cache hit ratios, error codes and bytes by region, which drive steering, capacity and billing checks. Volume is enormous, so sampling and pre-aggregation are used. The main difficulty is latency and trust: logs lag the events they describe, and different vendors count things differently.",
    k: ["Real-time streaming logs vs batch delivery: faster detection, but higher cost and less complete data than batch files.", "Sample logs vs keep all: manageable volume for dashboards, but misses rare errors and weakens billing reconciliation."],
    p: ["Logs arrive ten minutes late, so an incident is only visible after viewers have already left.", "Different vendors define cache hit differently, making their numbers incomparable."],
    v: "Generate a known number of requests with a known error rate against each CDN and confirm the pipeline reports the same counts and error rate within its stated tolerance, with data available within the stated delay.",
    dep: ["object-storage","event-bus","edge-cache"]
  },
  "realtime-analytics": {
    s: "A streaming computation that turns events from players, chat and servers into live counts, rates and distributions that dashboards and automated controls consume within seconds.",
    d: "Events enter a stream-processing layer that windows them by time, aggregates by stream, region and device, and writes results to a fast store for dashboards and APIs. The same data drives viewer counts, health alerts and steering. Windows must handle late and out-of-order events and survive restarts without double counting. Cardinality, the number of distinct streams and sessions, is the cost driver. Real-time numbers are approximations; final numbers are rebuilt later from the full data for billing and reports.",
    k: ["Approximate real-time results with later exact recomputation vs one exact path: low delay now and correct numbers later, at the cost of two pipelines to keep consistent.", "Pre-aggregate on the way in vs store raw events: cheap and fast queries, but questions not planned for cannot be answered."],
    p: ["Late events after a window closes are dropped, so counts for a mobile-heavy audience are consistently low.", "High-cardinality labels explode storage and slow every dashboard during large events."],
    v: "Replay a recorded event stream with known counts, including late and duplicated events, and confirm live aggregates are within tolerance, final recomputed numbers match exactly, and dashboard delay stays below the target.",
    dep: ["event-bus","player-beacons","object-storage"]
  },
  "av-sync-checks": {
    s: "Automated analysis of the produced stream for audio-video offset, frozen video, silence, black frames and mismatched renditions, independent of what the encoder claims.",
    d: "A checker decodes output renditions and examines the actual content: whether motion continues, whether audio is present and at a plausible level, whether lips and sound align by comparing a test pattern's flash and beep, and whether renditions match one another in timing. It catches faults that metrics of bitrate cannot, such as an encoder sending valid frames of a frozen picture. Running on every stream is expensive, so deep checks are sampled while cheap ones run continuously.",
    k: ["Check the decoded content vs trust metadata: finds real faults, but requires decoding and compute for each checked stream.", "Check every rendition vs one: catches faults in a single rung, but multiplies the cost."],
    p: ["A stream with a frozen frame but valid bitrate passes every check that only reads packet statistics.", "Offset thresholds are too loose, and a 300 ms drift is not noticed until viewers complain."],
    v: "Feed test streams with injected faults: frozen video, silence, a 200 ms audio shift and a missing rendition, and confirm each is reported within the target time with the right classification.",
    dep: ["media-decode-path","abr-ladder","alerting-and-slos"]
  },
  "alerting-and-slos": {
    s: "Defined targets for viewer experience, and alerts that fire when a stream, region or the whole platform is burning through its allowed failure faster than planned.",
    d: "Service level objectives state targets such as 99.5% of sessions start within four seconds and rebuffering under 0.5% of watch time. Alerts trigger on the rate at which the error budget is consumed, with fast and slow windows, rather than on single thresholds. Each alert links to a runbook and an owner. During large events extra rules apply and staff are present. Good alerting is mostly restraint: too many pages cause ignored pages, and alerts that depend on the failing system do not fire when needed.",
    k: ["Alert on viewer-visible symptoms vs on causes: pages that matter to users, but less direct guidance on what is broken.", "Per-event stricter targets vs one standard: more protection for premium events, but more rules and special cases to maintain."],
    p: ["Alert delivery depends on the same network that is failing, and no one is told.", "Hundreds of alerts fire for one cause, and the real signal is lost in the noise."],
    v: "Inject a known fault, such as raising stalls in one region, and confirm exactly one actionable alert reaches the on-call within the target time, with a runbook link and the affected scope named.",
    dep: ["viewer-qoe-metrics","ingest-health-metrics","synthetic-viewers"]
  },
  "broadcaster-health-feedback": {
    s: "Messages and dashboards that tell broadcasters about their stream's health, such as an unstable uplink or a poor encoder setting, while they are live and able to fix it.",
    d: "The ingest and quality systems turn raw metrics into plain statements shown in the broadcaster's dashboard: dropped frames, bitrate too high for the connection, keyframe interval wrong, audio missing. Suggestions are specific, such as lowering bitrate to a stated value. Feedback also covers delivery: viewer count, buffering rates and chat. It reduces support load and improves overall quality because most faults begin at the source. It must be timely and not alarm needlessly over brief blips.",
    k: ["Specific automatic advice vs raw metrics: easy for casual broadcasters, but advice can be wrong for unusual setups.", "Immediate warnings vs smoothed ones: faster fixes, but more false alarms from transient blips."],
    p: ["Advice to lower bitrate arrives after the audience has already left because of buffering.", "A warning about a harmless condition trains broadcasters to ignore all warnings."],
    v: "Degrade a test uplink and confirm the dashboard shows a specific warning within ten seconds, names the fix with a number, and clears after the stream recovers, while a brief one-second dip raises none.",
    dep: ["ingest-health-metrics","viewer-qoe-metrics","encoder-guidance"]
  },
  "capacity-forecasting": {
    s: "Estimating how much ingest, encoding, delivery and chat capacity will be needed, from schedules, history and growth, in time to provision it.",
    d: "Forecasts combine baseline growth, daily and weekly cycles, scheduled events, and signals such as broadcaster follower counts and promotion plans. They produce expected peaks for concurrent streams and viewers, from which bandwidth, encoder slots and gateway counts are derived. Lead times differ: CDN commitments take weeks, hardware encoders months, cloud instances minutes. Unscheduled spikes cannot be forecast, so the forecast sets the floor and the elasticity and degradation plans handle the rest.",
    k: ["Provision for the peak vs the average: safe for spikes, but costs money every hour when capacity sits idle.", "Statistical forecast vs asking event organizers: automatic and broad, but misses a one-off event that the organizer knows about."],
    p: ["The forecast uses historical averages and misses that a single event will exceed the previous record by five times.", "Capacity is planned for bandwidth but encoder session slots run out first."],
    v: "Compare forecast with actual peak concurrent viewers, streams and bandwidth for past events and report the error by metric. The error should be inside the planned safety margin on at least 95% of events.",
    dep: ["realtime-analytics","stream-registry","pre-warming"]
  },
  "pre-warming": {
    s: "Preparing capacity, caches and connections ahead of a known audience surge, instead of waiting for scaling to react once the load has arrived.",
    d: "For a scheduled event the platform starts extra encoders, scales packagers and origins, raises CDN allocations and opens connections before the start. Caches can be primed by fetching the first segments through each tier. It may also reserve ingest and chat gateway capacity and notify CDN partners. Pre-warming is needed because reactive scaling takes minutes while the audience arrives in seconds. It requires knowing about the event in advance, and costs money whether or not the audience comes.",
    k: ["Warm for the forecast peak vs scale reactively: the audience never meets a cold system, but unused capacity is paid for.", "Warm every tier vs only the bottleneck: complete readiness, but more to coordinate and verify before each event."],
    p: ["The event starts 30 minutes early, and the pre-warm window had not yet begun.", "A warmed tier is verified, but a tier no one thought of, such as the license service, is not."],
    v: "Run a load test at the forecast peak before the event with the pre-warm in place and confirm every tier meets its targets without scaling during the ramp, and compare the actual start-of-event load with the test.",
    dep: ["capacity-forecasting","autoscaling-workers","origin-shield","control-plane-api"]
  },
  "autoscaling-workers": {
    s: "Adds and removes servers for transcoding, packaging, chat and other services as load changes, based on measured demand and its lead time.",
    d: "Rules look at real-time capacity measures, such as concurrent streams, encoder slots in use or connections per gateway, and add machines ahead of need. Stream workloads are stateful and long-lived, so scaling in must wait for streams to end or move them, and new machines take a minute or more to start and become ready. Autoscaling therefore works best with headroom and forecasts. Using CPU as the only signal misleads, since limits are often sessions or network throughput.",
    k: ["Scale on leading signals vs lagging: new capacity is ready before saturation, but requires accurate measures of demand and lead time.", "Drain before removing vs terminate quickly: no interrupted streams, but slower scale-in and extra cost."],
    p: ["Scale-in terminates a machine still carrying live streams, interrupting broadcasts.", "Scaling reacts to CPU while the real limit, network throughput, is already reached."],
    v: "Ramp load from 10% to 100% of target in five minutes in staging and confirm new capacity is ready before any service-level breach, and that scale-in drains without interrupting a stream.",
    dep: ["transcode-scheduler","control-plane-api","capacity-forecasting"]
  },
  "join-storm-control": {
    s: "Spreads out the burst of viewers who all start playing in the same second, such as at a kickoff or an announcement, so no single system is overwhelmed.",
    d: "When a popular stream starts or a notification goes out, hundreds of thousands of players request manifests, tokens and licenses simultaneously. Defenses include randomized delays in clients, queueing at the gateway, caching entitlement results, serving a precomputed manifest to everyone and staggered notifications. Services handling the first requests, such as authentication and licensing, are typically the first to fail, not video delivery. Controls need to keep the viewer experience acceptable by showing a waiting screen rather than errors.",
    k: ["Client-side random delay vs server-side queue: simple and no server state, but clients are not obliged to follow it.", "Admit everyone slowly vs reject some quickly: everyone eventually plays, but a long wait is as bad as a failure for many."],
    p: ["Players retry at fixed intervals, and the retries synchronize into repeated spikes.", "The authentication service is sized for steady traffic and collapses at the start of an event."],
    v: "Release 500,000 simulated viewers within ten seconds and confirm login, license and manifest services stay within latency limits, queueing is orderly, and join success is above target within one minute.",
    dep: ["identity-and-auth","drm-license-client","entitlements","chat-gateway"]
  },
  "load-shedding": {
    s: "Deliberately refusing or simplifying low-priority work when demand exceeds capacity, so core playback keeps working instead of everything failing together.",
    d: "Requests are classified by importance: playback of existing sessions first, then new joins, then chat, thumbnails, analytics and recordings. When a service nears saturation it rejects or delays the lowest classes with a clear response that tells clients to back off. Shedding happens as early as possible, at the edge, since work rejected after being half done is wasted. The design needs priorities agreed beforehand, and clients that respect backoff signals, or retries make overload worse.",
    k: ["Protect existing viewers vs admit new ones: those already watching stay happy, but new arrivals are refused during the peak.", "Shed at the edge vs deep in the stack: cheap early rejection, but needs the edge to know the state of services behind it."],
    p: ["Retries from rejected clients amplify the overload instead of reducing it.", "Shedding is switched on late, after queues have grown so long that every request has already timed out."],
    v: "Overload a test environment to 150% of capacity and confirm priority classes shed in the defined order, existing playback is unaffected, and the system returns to normal within a minute after load drops.",
    dep: ["degraded-modes","control-plane-api","edge-network"]
  },
  "degraded-modes": {
    s: "Predefined reduced-service states, such as dropping top renditions, disabling chat features or turning off recording, that keep the core stream alive when capacity or components fail.",
    d: "Each mode names what is turned off and in what order: remove the highest rung to cut bandwidth, extend segment length, disable thumbnails and previews, stop optional analytics, switch from low-latency to standard delivery. Modes can be set by operators or automatically from alerts. Their value comes from being designed and tested ahead of time. Each mode also needs a clear way back, since leaving a platform in a reduced state after the incident is a failure of its own.",
    k: ["Automatic degradation vs manual: reacts in seconds, but may trigger on a false signal and lower quality unnecessarily.", "Fine-grained modes vs a single emergency switch: precise responses, but more states to test and understand under stress."],
    p: ["A degraded mode has never been tested, and enabling it breaks the player on some devices.", "The platform stays in the reduced state for days because nobody was notified to restore it."],
    v: "Enable each degraded mode in production-like conditions and confirm the intended features are off, playback continues for current viewers, the mode's effect on bandwidth is as predicted, and disabling it restores full behavior.",
    dep: ["load-shedding","control-plane-api","latency-tiers"]
  },
  "regional-failover": {
    s: "Moving ingest, processing, origins and control functions to another region when one fails, with streams continuing or recovering within a defined time.",
    d: "Regions hold independent copies of services and data needed to run streams. On a regional failure, ingest points steer broadcasters elsewhere, transcode jobs restart on available capacity, origins serve from replicas, and the registry reassigns streams. Live streams in flight usually reconnect, causing a short interruption, but viewers should continue from the CDN's cached and replicated content. The spare capacity needed is large, so platforms often run all regions at moderate utilization. Dependencies on one region's shared services are the usual hidden single point.",
    k: ["Active-active regions vs primary with standby: fast recovery and capacity always in use, but state must be replicated continuously.", "Automatic failover vs human decision: fast but risks switching on a false alarm, which can itself cause an outage."],
    p: ["A global service, such as authentication, is hosted in the failed region, and failover cannot start.", "Failover shifts all load to one region that has no capacity for it and fails in turn."],
    v: "In a planned exercise, isolate a region and measure time until broadcasters are reconnected elsewhere, viewers' playback resumes and the registry is consistent, and confirm capacity in the remaining regions holds.",
    dep: ["stream-registry","origin-replication","edge-network","control-plane-api"]
  },
  "egress-cost-controls": {
    s: "Limits and policies that keep delivery bandwidth, the largest cost, within budget by capping quality, steering traffic to cheaper paths and avoiding wasted bytes.",
    d: "Egress is billed per gigabyte, with different prices per network, region and commitment. Controls include capping the top rendition for small audiences, preferring cheaper delivery networks when quality is equal, limiting bandwidth for background or muted tabs, stopping streams that no one watches, and avoiding duplicate copies between regions. Policies are set from cost per viewer hour and revenue by stream. The trade-off is direct: every control lowers cost and risks quality or reach, so the effects must be measured on viewer experience.",
    k: ["Cap top quality for most streams vs deliver all: lower bills, but visibly less sharp video for viewers on fast connections.", "Steer to cheaper networks vs to the best-performing: savings at scale, at some cost in performance and cache efficiency."],
    p: ["A cap meant for tiny streams applies to a large event and reduces quality for millions.", "Savings from steering are outweighed by commitments, so traffic moves away from a contract that charges for unused volume."],
    v: "Apply a cost policy to a test segment of traffic and compare bytes delivered, bill estimate and viewer quality metrics against a control group, confirming savings were achieved without exceeding the quality loss allowed.",
    dep: ["multi-cdn-steering","abr-ladder","cdn-log-pipeline"]
  },
  "stream-registry": {
    s: "The source of truth for every stream's state: who owns it, whether it is live, where it is being processed and which origin and playback addresses it uses.",
    d: "When a broadcaster connects, the registry records the stream, assigns it processing locations and publishes the playback address. Every other service reads it: the scheduler to place jobs, the player service to locate manifests, moderation to act, analytics to label data. It has strong consistency requirements for ownership, since two ingests for one channel must not both win, and must respond very fast to a very high read load, so reads are cached. State changes, like going live or offline, are broadcast as events.",
    k: ["Strongly consistent single writer vs eventually consistent: prevents duplicate streams on one channel, but a regional partition can block going live.", "Cache reads aggressively vs always read the source: fast and cheap, but a stale entry points viewers to a stream that has ended."],
    p: ["A stale cache entry sends viewers to an origin that no longer carries the stream.", "A registry outage prevents new streams from starting even though existing ones keep running."],
    v: "Start the same channel from two ingests simultaneously and confirm exactly one wins, state changes propagate to readers within a second, and killing the primary node does not interrupt existing streams.",
    dep: ["event-bus","identity-and-auth","object-storage"]
  },
  "control-plane-api": {
    s: "The internal and external interface through which streams, encoders, origins and settings are created, configured and observed, kept separate from the media path.",
    d: "The control plane handles requests such as starting a stream, changing a channel's latency mode, creating a clip or setting a degraded mode, and orchestrates the services involved by writing state and emitting events. Keeping it separate from the data plane means a control plane outage does not stop video that is already flowing. It is authenticated and rate limited, and its operations must be idempotent and safe to retry. Operators and automation use it too, so it also needs auditing and safe rollout of configuration changes.",
    k: ["Separate control and media paths vs integrated: media keeps flowing when control fails, but state must be synchronized between them.", "Declarative desired state vs imperative commands: the system can converge and repair itself, but debugging why it has not converged takes tooling."],
    p: ["A configuration push reaches all regions at once, and a bad value takes down every region together.", "Non-idempotent operations create duplicate streams when clients retry after a timeout."],
    v: "Stop the control plane while streams are running and confirm video continues for the planned duration. Then submit the same start request twice and confirm one stream results, with every change in the audit log.",
    dep: ["stream-registry","event-bus","identity-and-auth"]
  },
  "event-bus": {
    s: "A durable publish-subscribe channel that carries events such as stream started, segment published, message posted and payment received between independent services.",
    d: "Producers write events to named topics and consumers read them at their own pace, with ordering within a key such as a stream identifier and retention for replay. It decouples services, absorbs bursts and is the basis for analytics, moderation, recording and notifications. The difficulties are throughput at event scale, partition imbalance on popular channels, duplicates under retries that require idempotent consumers, and lag, where a slow consumer falls behind and acts on old information. Live-critical paths avoid depending on it in the hot path.",
    k: ["Ordering per stream key vs global order: scales across partitions, but cross-stream ordering is not available.", "At-least-once delivery vs exactly-once: simple and fast, but consumers must handle duplicates."],
    p: ["A single popular channel concentrates events on one partition, which becomes the bottleneck.", "A consumer falls hours behind and moderation acts on events long after the stream ended."],
    v: "Publish a burst at ten times the expected peak, including duplicates, and confirm all consumers receive every event in per-key order, lag returns below the target, and consumers ignore duplicates.",
    dep: ["edge-network","object-storage"]
  },
  "object-storage": {
    s: "Large-scale durable storage of immutable files, used for segments, recordings, clips, thumbnails and logs, accessed over HTTP and replicated across sites.",
    d: "Objects are written once and read many times, addressed by key, with replication or erasure coding for durability and tiers by access speed. For live video, the origin may write segments here every few seconds, and recordings and clips read them back. Listing and request rates matter as much as capacity, since millions of small objects are normal. Consistency after write and the time before an object is visible to readers affect live delivery, and lifecycle rules handle expiry and tiering.",
    k: ["Many small segment objects vs consolidated files: simple addressing and serving, but heavy request costs and metadata load.", "Replicate across regions vs a single region: survives regional loss, but costs transfer and adds replication delay."],
    p: ["Request-rate limits on a hot prefix throttle writes of live segments during a surge.", "A listing operation across millions of objects is slow, and a job built on it is unusable."],
    v: "Write segments at the full platform rate for an hour and confirm every object is readable within the stated delay, write latency stays within the budget, and a deleted region's data is available from its replica.",
    dep: ["edge-network"]
  },
  "identity-and-auth": {
    s: "Accounts, sign-in and tokens that identify viewers, broadcasters, moderators and services, and the permission checks that every other component relies on.",
    d: "Users sign in with credentials or federated providers and receive tokens with limited lifetimes and scopes. Services validate tokens locally using public keys, avoiding a call per request, and check roles such as broadcaster, moderator or staff. Anonymous viewers are the majority and have lightweight identities for rate limits and analytics. Service-to-service calls use their own credentials. Because every part of the platform depends on it, availability is essential, and so is revoking tokens quickly after account compromise or a ban.",
    k: ["Self-contained signed tokens vs lookup on each request: fast and scalable, but revocation waits for expiry.", "Anonymous viewing allowed vs sign-in required: lowest friction and most reach, but weaker rate limiting, bans and personalization."],
    p: ["A compromised account keeps working until its token expires because verification is local.", "An outage of the identity service stops all new sessions, chat and purchases at once."],
    v: "Issue tokens for each role and confirm permitted actions succeed and forbidden ones fail. Revoke an account and measure the time until each service rejects its token, comparing with the stated bound.",
    dep: ["edge-network","object-storage"]
  },
  "clock-and-timecode": {
    s: "Synchronized time sources across servers, and the timecode scheme that labels every frame, so components agree on when something happened.",
    d: "Servers synchronize with a network time protocol or a hardware time reference to within milliseconds, and monitoring checks offsets. Media carries presentation timestamps relative to the stream's start, and the platform records the wall-clock time at which each segment's first frame was captured. Players use a time-sync endpoint to learn the server time without depending on their own clock. The foundation matters because everything depends on it: segment names, manifest availability times, ad markers, chat replay mapping and log correlation all fail subtly when clocks differ.",
    k: ["Network time sync vs hardware time sources: simple and adequate for most, but hardware gives tighter accuracy needed for frame-accurate alignment across sites.", "Players use server time vs device clock: reliable alignment regardless of the device's own error, but needs an extra request."],
    p: ["One server's clock drifts by seconds, and its segments appear to come from the future.", "Leap or daylight-time handling in one component causes an hour offset in a log or schedule."],
    v: "Measure each server's offset against the reference continuously and confirm all are within a few milliseconds, then compare timestamps for the same frame across ingest, packager and player to confirm they agree.",
    dep: ["edge-network"]
  },
  "edge-network": {
    s: "The physical and virtual network that connects broadcasters, data centers, delivery sites and viewers, including peering, private links and the routing that decides which path traffic takes.",
    d: "The platform operates or rents backbone links between sites, peers with access networks to reach viewers directly, and uses anycast or DNS steering to direct clients to nearby locations. Capacity at interconnection points is a primary constraint for live events, since traffic is concentrated at the same moment. Packet loss, congestion and routing changes on the public internet cannot be controlled, only measured and worked around. The design determines cost, as transit is priced much higher than direct peering.",
    k: ["Private backbone between sites vs public transit: predictable loss and delay, but costly to build and operate.", "Direct peering with access networks vs transit: better performance and lower cost per byte, but many agreements and ports to manage."],
    p: ["An interconnect link saturates at the start of an event and traffic spills onto a more expensive path.", "A routing change at a transit provider sends traffic on a long path with high loss for hours."],
    v: "Measure loss, delay and throughput on each link and peer continuously, and during a test confirm traffic shifts to alternates within the planned time with no sustained loss above the target.",
    dep: []
  },
});
