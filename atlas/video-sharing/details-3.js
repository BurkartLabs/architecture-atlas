// Details for the video sharing plate, part 3: community, monetization, trust and safety.
ATLAS.details("video-sharing", {
  "comments-service": {
    s: "Stores and serves threaded comments for every video, handling very high write volume, replies, edits, deletions and per-video settings such as disabled or held-for-review comments.",
    d: "Comments are written to a store partitioned by video id, with parent ids for replies and counters for likes and reply counts. Reads fetch a page of top-level comments plus a few replies, sorted by a ranking function. Creators can disable comments, hold them for approval or block words. Popular videos create hot partitions with thousands of writes per second. Hard because one viral video overloads one shard, counters are contended, and deletion must reach caches, search and exports.",
    k: ["Partition by video versus by comment id: by video keeps a page of comments in one place for fast reads; it concentrates load for viral videos.", "Exact reply and like counts versus approximate counters: exact counts need coordination; approximate counters stay fast under bursts and are corrected later."],
    p: ["A viral video's comment shard saturates and comments fail for every other video on the same shard.", "Deleted comments remain visible in cached pages or in notification previews."],
    v: "Post, reply to, edit and delete comments on a test video while load testing a hot video. Each action is visible or gone to other viewers within the target time, and unrelated videos stay within normal latency.",
    dep: ["data-sharding", "catalog-database", "user-reporting"]
  },
  "comment-ranking": {
    s: "Orders comments so the most useful appear first, using likes, replies, author reputation, creator interaction and recency, while demoting spam and abuse.",
    d: "A scoring function combines engagement counts, the age of the comment, whether the creator replied or pinned it, subscriber status of the author and classifier scores for toxicity and spam. Ranking is computed at write time into an ordered structure or at read time for the top few thousand. Hard because early comments gain an advantage that persists, brigading changes the order quickly, and a score that hides disagreement can make a discussion look one-sided.",
    k: ["Ranking at write time versus at read time: at write time reads are cheap; it lags as likes accumulate and is costly to recompute on every change.", "Engagement-weighted versus recency-first order: engagement surfaces substance and rewards controversy; recency shows the live conversation but amplifies spam."],
    p: ["Coordinated accounts like a comment in a burst and push abusive content to the top.", "Early comments win permanently because later better comments never accumulate enough visibility."],
    v: "Seed a test video with comments of known quality, spam and abuse, then inject a coordinated like burst. Spam and abuse stay out of the top of the list, and ordering updates within the stated delay.",
    dep: ["comments-service", "reactions", "policy-classifiers"]
  },
  "reactions": {
    s: "Likes, dislikes and other lightweight signals attached to videos and comments, stored per user to prevent double counting and shown as aggregated counts.",
    d: "Each reaction is a user-and-target record, written idempotently so repeated taps do not double count. Aggregated counts are updated asynchronously and displayed with some delay or rounding. Reactions feed ranking and recommendation, and may be hidden from public view while remaining private signals. The write volume is large and bursty. Hard because accounts can be created in bulk to inflate counts, and users expect to see their own tap instantly even when the global count lags.",
    k: ["Per-user records with derived counts versus counters alone: records prevent duplicates and support undo; counters alone are cheaper but cannot detect repeated or fake votes.", "Showing the dislike count publicly versus privately: public counts help judge quality; they invite brigading and harassment of creators."],
    p: ["Counts drift from the per-user records because an asynchronous aggregator dropped events and was never reconciled.", "A tap shows success locally but the write failed, so it vanishes on reload."],
    v: "Like, unlike and re-like from one account many times, and from many test accounts. The record holds one state per account, and the displayed count converges to the number of records within the stated delay.",
    dep: ["data-sharding", "catalog-database", "stream-aggregation"]
  },
  "subscription-graph": {
    s: "The relationships between viewers and channels, with notification preferences, powering subscription feeds, subscriber counts and alerts for new uploads and live streams.",
    d: "Each subscription is an edge from a viewer to a channel with a notification level. Two lookups matter: channels a viewer follows, for feeds, and viewers who follow a channel, for fan-out when a video publishes. Channels with millions of followers make fan-out expensive, so feeds are often assembled at read time and alerts sent in batches. Hard because the follower lists are huge, subscriber counts are watched closely by creators and scrutinized for fakes, and a new upload must notify quickly.",
    k: ["Fan-out on write versus assembling at read: write-time fan-out makes feeds fast; for a channel with millions of followers it is slow and bursty, so large channels use read-time assembly.", "Subscribing as a strong signal versus a weak one: strong signals surface subscribed content reliably; they lock out other content and are gamed with purchased subscribers."],
    p: ["A publish by a very large channel triggers a notification surge that delays alerts for everyone else.", "Bulk-created accounts subscribe to inflate counts, which later vanish and surprise the creator."],
    v: "Subscribe test accounts to a channel and publish a video. Subscribers with alerts on receive notification within the target time, feed order reflects the upload, and an unsubscribed viewer receives nothing.",
    dep: ["catalog-database", "data-sharding"]
  },
  "user-reporting": {
    s: "The flows that let viewers flag a video, comment or channel for a reason, capturing context and routing the report to automated checks or human review.",
    d: "A report records the target, reason category, timestamp in the video and the reporter. The system deduplicates repeated reports, adds context such as the content's history and the reporter's track record, and routes to the appropriate queue by severity. Reporters may be told the outcome. Hard because reports are a weapon as well as a safeguard: groups mass-report content they dislike, so counts cannot be treated as evidence and urgent reports about harm must jump the queue.",
    k: ["Treating report volume as a signal versus using it only to route: volume helps find real problems quickly; it lets coordinated groups trigger demotions or removals.", "Anonymous reporting versus identified: anonymity encourages reports of sensitive abuse; identified reports allow reporter reputation and abuse tracking."],
    p: ["A coordinated campaign reports a creator's videos until an automated threshold hides them.", "Urgent reports sit behind a backlog of low-severity ones because queues are first in, first out."],
    v: "File reports in several categories, including a self-harm one, on test content. Each lands in the intended queue, the urgent one is handled within its service target, and duplicates merge.",
    dep: ["review-queues", "comments-service", "metadata-store"]
  },
  "creator-moderation-tools": {
    s: "Controls that let creators manage their own space: hold, hide or delete comments, block users and words, set channel-level rules and appoint moderators.",
    d: "Creators set word lists and approval modes that apply before a comment becomes visible, and see a review queue of held comments. Trusted moderators receive limited permissions. Actions apply across the channel's videos and live chat. Hard because settings must be enforced at the point of write and on every surface that shows comments, and because blocked or hidden users should not know, to avoid retaliation, yet creators need transparency about what was hidden.",
    k: ["Pre-publication holding versus post-publication removal: holding prevents abuse from ever appearing; it delays ordinary conversation and creates a backlog for the creator.", "Shadow hiding versus visible removal: hiding quietly avoids escalation; it is opaque to the person affected and can be seen as deceptive."],
    p: ["A blocked word list matches inside harmless words or other languages and hides legitimate comments.", "Moderator permissions are too broad and a compromised moderator account deletes a channel's discussion."],
    v: "Add a blocked word, hold-for-review mode and a moderator account to a test channel. Matching comments are held, the moderator can approve or delete only what the permission grants, and live chat honors the same rules.",
    dep: ["comments-service", "policy-classifiers", "live-chat"]
  },
  "ad-decisioning": {
    s: "Chooses which advertisement, if any, to show for a viewing opportunity, based on targeting, bids, pacing and the viewer's context, within a few hundred milliseconds.",
    d: "When a viewer starts or passes a break point, a request describes the video, viewer context and available slots. Eligible campaigns are filtered by targeting, suitability and budget, then ranked by a bid and predicted outcomes in an auction. The winner is returned as a tag or a media reference. Hard because the call sits in the playback path and every millisecond delays the viewer, budgets must be spent evenly across many servers without overspending, and fraudulent traffic distorts bids.",
    k: ["Real-time auction per slot versus pre-reserved guaranteed placements: auction maximizes revenue; guaranteed deals give advertisers certainty but reduce flexibility.", "Strict global budget enforcement versus local approximations: strict never overspends; local budgets are fast and occasionally overspend slightly."],
    p: ["A slow ad request delays the start of the video and viewers abandon before the first frame.", "Distributed budget counters lag, and a campaign overspends by a large margin during a traffic spike."],
    v: "Send ad requests for a test campaign at production volume. Responses arrive within the deadline, spend stops within a small tolerance of the budget, and a suitability-excluded video never receives that campaign.",
    dep: ["advertiser-suitability", "revenue-ledger", "view-counting"]
  },
  "ad-insertion": {
    s: "Places the chosen advertisement into playback either in the player, on the device, or stitched into the stream on the server, with tracking beacons for each quartile viewed.",
    d: "With client-side insertion the player requests an ad, plays it from a separate stream and returns to the content. With server-side insertion a stitching service replaces segments in the manifest with ad segments, so the viewer sees one continuous stream that resists blockers. Both fire tracking events at start, quartiles and completion. Hard because the ad and content have different encodings and timing, so splices cause stalls or quality jumps, and tracking must survive caching and device quirks.",
    k: ["Client-side versus server-side insertion: client-side is simple and can be interactive; server-side gives a seamless stream and fewer blocked ads but defeats shared caching and needs per-viewer manifests.", "Normalizing ads to the content ladder versus using advertiser files as supplied: normalizing prevents splice artifacts; it adds a transcoding delay before a campaign can run."],
    p: ["Ad and content segments with mismatched timestamps cause a freeze or audio gap at the transition.", "Tracking beacons fire from cached manifests and over-report impressions."],
    v: "Play a test video with pre-roll and mid-roll breaks on each device class. The ad transitions without a stall, beacons for start, each quartile and completion each arrive once, and a skipped ad reports as skipped.",
    dep: ["ad-decisioning", "manifest-parser", "segmenting-and-packaging", "playback-event-collection"]
  },
  "advertiser-suitability": {
    s: "Classifies each video and channel for how safe it is for brands, and enforces advertiser exclusions such as topics, languages and categories.",
    d: "Classifiers read titles, transcripts, frames and comments to assign suitability tiers, for example fully suitable, limited and unsuitable. Advertisers choose which tiers and topics they accept, and decisioning filters on them at request time. Creators can appeal limited ratings. Hard because context decides meaning, classification must be done quickly for live and new content, and errors have money at stake in both directions: unsafe placements lose advertisers, false restrictions lose creator income.",
    k: ["Classify at upload versus at ad request: at upload is cheap per request and can be reviewed; at request time can use fresh context but adds latency and compute.", "Conservative ratings versus permissive: conservative protects advertisers; permissive preserves revenue and may place ads next to harmful material."],
    p: ["A video is reclassified after ads have already run, and advertisers demand refunds for past placements.", "Classifier errors on a minority language systematically demonetize those creators."],
    v: "Run a labeled set of videos across tiers and languages. Misclassification stays under the target rate, and an advertiser exclusion for a topic causes no ad from that campaign on matching test videos.",
    dep: ["policy-classifiers", "chapters-and-auto-tags", "metadata-store"]
  },
  "revenue-ledger": {
    s: "An append-only record of every billable and payable event, such as impressions, subscriptions and adjustments, reconciled so that advertiser charges and creator earnings are exact.",
    d: "Impression and subscription events from decisioning, ad insertion and billing providers are validated, deduplicated and written as ledger entries with their rates. Daily and monthly roll-ups produce invoices and earnings. Corrections arrive later as adjustments for invalid traffic or disputes, never as edits. Hard because inputs are large and imperfect, auditors require every number to be traceable, and a single double-count multiplies across millions of rows.",
    k: ["Append-only entries with adjustments versus mutable balances: append-only keeps a full audit trail and allows replay; mutable balances are simpler to read but lose history.", "Real-time earnings display versus finalized monthly numbers: real-time numbers are engaging; they change after invalid traffic is removed and cause disputes."],
    p: ["Duplicate delivery of an event double-credits a creator and is only caught at month-end reconciliation.", "A rate change is applied retroactively without an adjustment entry, and totals no longer reconcile with invoices."],
    v: "Replay a day of recorded events twice into a test ledger. Totals equal the single-replay result, every invoice line traces to source events, and an injected invalid-traffic adjustment appears as its own entry.",
    dep: ["view-counting", "ad-insertion", "data-sharding"]
  },
  "creator-payouts": {
    s: "Calculates each creator's share of revenue, applies taxes, holds and thresholds, and pays them through banking partners on a schedule.",
    d: "Monthly, the payout system reads finalized ledger totals, applies revenue-share rules by product, subtracts adjustments and holds, and creates payments in the creator's region and currency. It collects tax and identity information, verifies it, and handles failures such as closed accounts. Hard because rules differ by country, payments are irreversible once sent, and a policy action such as a claim from a rights holder redirects revenue after the fact.",
    k: ["Payment threshold and monthly batch versus continuous small payouts: batching cuts fees and fraud exposure; creators wait longer for money.", "Holding revenue during a dispute versus paying and clawing back: holding avoids recovery problems; it penalizes creators who are in the right."],
    p: ["A payout is sent to a hijacked account before the account takeover is detected.", "Currency conversion rounding differs between the statement and the bank, causing support tickets at scale."],
    v: "Run a payout cycle in a sandbox with test creators across regions, a claim, a hold and a failed bank account. Amounts match the ledger to the cent, held funds are not sent, and failures are retried or reported.",
    dep: ["revenue-ledger", "rights-registry", "strikes-and-enforcement"]
  },
  "memberships-and-paid-content": {
    s: "Lets creators charge viewers through channel memberships, one-time rentals, purchases and tips, and gates perks and videos behind entitlements.",
    d: "A billing integration handles payment methods, recurring charges, refunds and tax. Entitlements are recorded per viewer and checked when a video is played, a chat badge is shown or a perk is delivered. Paid video is protected with encryption and short-lived authorization. Hard because purchases cross payment, catalog and playback systems that must stay consistent, because app stores take their own cut and impose rules, and because refunds and chargebacks need to revoke access cleanly.",
    k: ["Entitlement check at playback time versus at page load: at playback is strict and revocable; at page load is cheaper and lets a leaked link keep working.", "Using the platform's own billing versus device-store billing: own billing keeps more revenue; store billing is required on some devices and splits the customer relationship."],
    p: ["A refund is processed but the entitlement is not revoked, so the viewer keeps access.", "Membership status lags a payment failure and perks remain visible to former members."],
    v: "Buy, renew, refund and cancel a test membership. Perks and gated videos are available exactly while the entitlement is valid, and a lapsed payment removes access within the stated grace window.",
    dep: ["signed-url-authorization", "content-decryption", "revenue-ledger", "catalog-database"]
  },
  "content-fingerprinting": {
    s: "Computes compact audio and video signatures of every upload and matches them against reference files from rights holders, finding copies even after trimming, re-encoding or overlays.",
    d: "Signatures are derived from features that survive compression, pitch and speed shifts, cropping and mirroring, and are indexed for fast approximate lookup. Each upload is compared with the reference index; partial matches report the matched time ranges and the claimed work. Matching runs on upload and when new references are added, so old videos are rechecked. Hard because the reference index holds many millions of items, false positives remove legitimate content, and adversaries deliberately distort media to evade.",
    k: ["Match at upload before publishing versus after publishing: before publishing prevents infringement; it delays every upload, while after publishing is faster but exposes rights holders briefly.", "Strict thresholds versus loose: strict thresholds avoid false claims; loose catch more evasion and generate more disputes."],
    p: ["Public domain, licensed or short fair-use clips match references and are wrongly claimed.", "A newly added reference is not matched against the existing back catalog, so old copies stay unclaimed."],
    v: "Upload test clips that are exact copies, re-encoded, cropped and pitch-shifted versions of a reference, plus an unrelated clip. The copies match with correct time ranges and the unrelated one does not.",
    dep: ["rights-registry", "container-probing", "object-store"]
  },
  "rights-registry": {
    s: "The database of who owns what, which policy each owner chose for matches (block, monetize, track), territories and exceptions, and the claims applied to videos.",
    d: "Rights holders supply reference files with metadata and a policy per territory. A match creates a claim linking the video, the reference, the matched span and the action: block the video, mute audio, run ads and share revenue, or only report. Claims can be released, disputed or expire. Hard because ownership is layered and disputed, policies vary by country, and an incorrect registration can claim a whole catalog that belongs to someone else.",
    k: ["Automatic action on any match versus manual review first: automatic scales and protects rights holders; manual review reduces wrongful claims but cannot keep up with volume.", "Trusting registered owners by default versus verifying: trust is quick for partners; verification stops fraudulent registrations of others' works at the cost of onboarding friction."],
    p: ["A fraudulent owner registers someone else's original work and takes its revenue.", "Territory rules are applied to the wrong region because viewer location is estimated wrongly."],
    v: "Register a reference with a block policy in one territory and monetize in another, then upload a matching video. Playback is blocked in the first, shows ads in the second, and the claim record names the matched span.",
    dep: ["content-fingerprinting", "catalog-database", "age-and-region-gating"]
  },
  "dispute-and-appeals": {
    s: "The process by which creators contest claims or removals and rights holders or moderators review, with deadlines, evidence, reinstatement and escalation.",
    d: "A creator files a dispute with a reason; the claimant or a reviewer accepts, rejects or lets it lapse within a deadline. Rejection may lead to an appeal and, for repeated cases, a human reviewer. Accepted disputes release the claim and restore monetization. The system records every step for audit and legal requests. Hard because the process must be fair and fast to many small creators, while claimants may ignore disputes, and bad faith appears on both sides.",
    k: ["Claims released automatically if the claimant does not respond versus kept: automatic release protects creators from neglect; it lets disputed infringement through when a claimant is merely slow.", "Single appeal versus several levels: one appeal limits delay; several levels improve accuracy but leave videos in limbo."],
    p: ["Disputed videos stay blocked while the clock runs, costing creators the entire early window of a time-sensitive video.", "Creators are not told the reason or deadline and lose rights to appeal by default."],
    v: "File disputes on test claims and let one lapse, one be rejected and one accepted. Each ends in the correct state within its deadline, with notices sent and monetization restored for the accepted case.",
    dep: ["rights-registry", "review-queues", "strikes-and-enforcement"]
  },
  "policy-classifiers": {
    s: "Models that score uploads, comments, thumbnails and live segments for policy categories such as violence, nudity, hate and spam, and decide what is blocked, restricted or sent to a person.",
    d: "Classifiers analyze frames, audio, text and metadata with models per policy. Scores above a high threshold take automatic action, scores in a middle band go to review, and low scores pass. Models are retrained on reviewer decisions and measured by precision and recall per category and language. Hard because policy definitions are subtle and change, contexts such as news or education alter meaning, and classifiers drift as adversaries adapt.",
    k: ["Automatic action at high confidence versus always human review: automatic action is fast and scales; errors at scale hurt creators and need an appeal path.", "One multi-label model versus a model per policy: one model is cheaper to run; per-policy models can be updated independently when a rule changes."],
    p: ["A new type of harmful content is invisible to classifiers until reviewers label enough examples.", "Accuracy differs by language and dialect, so enforcement falls unevenly on some communities."],
    v: "Score a labeled evaluation set per policy and language. Precision and recall meet the thresholds for each, and items in the middle band reach a review queue within the service target.",
    dep: ["video-state-machine", "known-harm-hash-matching", "review-queues"]
  },
  "known-harm-hash-matching": {
    s: "Compares uploads against shared lists of fingerprints of material that is always prohibited, so exact and near-duplicate copies are blocked and reported without human viewing.",
    d: "Perceptual hashes of images and video frames are compared with lists from industry and legal bodies. A match blocks the upload, preserves evidence as the law requires, and triggers mandatory reporting. The matching runs at ingest before anything is published and on stored content when lists are updated. Hard because the lists are sensitive, access is tightly controlled, hash collisions and manipulated copies cause misses, and legal duties around retention and reporting are strict.",
    k: ["Block at ingest versus after processing: at ingest stops distribution and storage of the file; it requires fast checks before the expensive pipeline and leaves little time for review.", "Perceptual hashes versus exact: perceptual hashes catch edits; they can produce false matches that need human confirmation."],
    p: ["A list update is applied only to new uploads, leaving matching material in the existing archive.", "Evidence is deleted by lifecycle rules before it is preserved for legal process."],
    v: "Upload synthetic test items registered in the test list, original and edited. They are blocked before publication, evidence is retained under the legal hold policy, and a report record is created.",
    dep: ["upload-api", "container-probing", "lifecycle-policies"]
  },
  "review-queues": {
    s: "Work queues where trained reviewers judge flagged content against policy, with prioritization by severity and reach, tooling for context, and wellness limits on exposure.",
    d: "Items enter from classifiers, reports and claims, are prioritized by severity, expected views and age, and are routed to reviewers with the right language and training. Reviewers see the video with context, choose an action and cite a policy. Decisions feed back into training data and quality audits, where a second reviewer samples work. Hard because volume exceeds capacity, harmful material harms reviewers, and consistency between reviewers is difficult to achieve.",
    k: ["Prioritize by predicted reach versus first in, first out: reach-based ordering stops the most harm first; low-reach items can wait very long.", "In-house reviewers versus outsourced: in-house reviewers get deeper training and tighter control; outsourced capacity scales and covers languages at the cost of consistency."],
    p: ["Queue backlogs grow during a breaking event and the highest-risk items wait behind routine ones.", "Reviewers see graphic content without blurring or time limits, causing harm and turnover."],
    v: "Inject test items with known severity and language. They are routed to qualified reviewers in priority order, decisions are recorded with policy references, and a sampled audit measures agreement between reviewers.",
    dep: ["policy-classifiers", "user-reporting", "strikes-and-enforcement"]
  },
  "age-and-region-gating": {
    s: "Restricts who may watch a video based on viewer age, account settings and country, applied at every surface and in the delivery authorization.",
    d: "Metadata carries an age rating and a set of blocked or allowed territories from policy, rights claims and legal orders. At request time the viewer's age signals and estimated location are compared with those flags. The result decides whether to show the video, show a warning, require sign-in or block. The check must be enforced in search, recommendations, embeds, direct segment access and downloads alike. Hard because location and age are estimates, and gaps between surfaces leak restricted content.",
    k: ["Enforcing at the application layer versus in segment authorization: application checks give friendly messages; segment authorization stops direct access to files but needs the decision in every token.", "Signed-in age verification versus inferred age: verification is more accurate; it adds friction and privacy cost, while inference can be wrong in both directions."],
    p: ["A restricted video's segments are fetched directly by a copied URL because only the page checked restrictions.", "Location is derived from a proxy address, and region rules are bypassed or wrongly applied."],
    v: "Request a restricted test video from allowed and blocked regions, as signed-out, minor and adult accounts, through page, embed and direct segment URL. Only permitted combinations succeed on every path.",
    dep: ["metadata-store", "signed-url-authorization", "rights-registry"]
  },
  "strikes-and-enforcement": {
    s: "Applies consequences for violations: warnings, strikes, demonetization, suspension of features or termination, with escalation rules, expiry and notices to the creator.",
    d: "Each confirmed violation records a strike with policy, date and evidence. Thresholds in a window trigger restrictions, such as disabling uploads or live for a period, and repeated or severe violations end the account. Strikes expire and can be removed through appeal. Actions propagate to payouts, recommendations, channels and linked accounts. Hard because actions are consequential and must be consistent, explainable and reversible, while evasion through new accounts needs detection.",
    k: ["Escalating strikes versus case-by-case judgment: strikes are predictable and consistent; case-by-case handles context but invites uneven treatment.", "Linking accounts to catch repeat offenders versus privacy: linking stops evasion; it risks penalizing innocent people who share devices or networks."],
    p: ["An enforcement action is applied but not propagated to payouts, so a terminated channel is still paid.", "A wrongly applied strike is reversed late and the lost monetization is never restored."],
    v: "Apply, appeal and expire strikes on a test channel through the threshold levels. Restrictions switch on and off at the stated times, notices are sent, and the payout and recommendation systems reflect each state.",
    dep: ["review-queues", "metadata-store", "catalog-database"]
  },
});
