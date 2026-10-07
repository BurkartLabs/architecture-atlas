// Details part 4: privacy and consent, fraud and quality, reporting and billing.
ATLAS.details("ad-exchange", {
  "consent-string": {
    s: "A compact encoded record of what the user agreed to, covering purposes and named vendors, passed along with every request so each party can see the user's choices.",
    d: "The page's consent dialog records the user's choices as bit fields for each purpose and each vendor, encodes them into a short string with a version and timestamp, and stores it in a first-party cookie or the app's storage. The wrapper reads it and adds it to every request. Receivers decode it and check their own vendor and purpose bits. It is only a claim: the string says what the user chose, and nothing proves the dialog was fair or that the string was not altered.",
    k: ["A signed or verifiable string vs an unsigned one: signed strings resist tampering and need key management; unsigned strings are simple and trust the sender.", "Per-vendor consent vs per-purpose only: per-vendor is precise and produces very long strings; per-purpose is short and gives users little control over who gets data."],
    p: ["A page that sends requests before the dialog completes sends an empty or default string that receivers treat as consent.", "Strings too long for a request field are truncated and decoded as something else."],
    v: "Decline a purpose in a test dialog and capture the next request. Decode its string and confirm the purpose bit is off, the timestamp is current and the version is the one receivers accept.",
    dep: ["ad-request-trigger"]
  },
  "consent-enforcement": {
    s: "The checks at each party that read the consent signal and drop data, identifiers, bids or whole requests that the user has not allowed.",
    d: "At the exchange, requests with no valid consent have identifiers and precise location stripped, or are not sent to bidders that lack the user's permission. At the bidder, the signal gates segment lookups, profile updates and bids that use personal data. Enforcement points are many, and any one that is missed leaks data. The rules differ by region, which means the system must first decide which regime applies from the user's location, and then apply that regime's logic.",
    k: ["Enforcing at the exchange only vs at every party: exchange-only is central and cannot see what downstream parties do; enforcing everywhere is thorough and relies on each one being correct.", "Blocking requests with missing signals vs treating as no consent: blocking is safe and loses traffic; treating as no consent keeps contextual revenue and strips data."],
    p: ["A cache keyed only by user identifier returns a profile built before consent was withdrawn.", "A region lookup based on a wrong address applies the weaker regime to users who are covered by a stricter one."],
    v: "Send identical requests with consent granted, denied and absent from a user in each regime. Confirm identifiers and segments appear only in the granted case, and the bidder's log records the consent decision for each.",
    dep: ["consent-string", "data-minimization", "opt-out-signals"]
  },
  "opt-out-signals": {
    s: "Browser, device or regional signals in which the user states they do not want to be tracked or have personal data sold, which parties must honor.",
    d: "Signals include a header sent by the browser, a flag on the device's advertising settings, and a regional string recorded when a user opts out of data sale. The request carries them in dedicated fields. Receivers check them as part of enforcement, and stop using the user's identifier for targeting. Some signals are legally binding in certain jurisdictions and advisory in others. The hard part is propagating an opt-out that was recorded after data already moved to other parties.",
    k: ["Treating opt-out as stripping identifiers vs dropping the request: stripping keeps contextual bids and risks leakage through remaining fields; dropping is safest and cuts revenue.", "Honoring signals globally vs where required: global is simple and costs some targeting; regional meets the law with more rules to maintain."],
    p: ["A signal read only at the exchange never reaches the bidder, which keeps profiling the user.", "An opt-out stored per cookie disappears when cookies are cleared, which re-enrolls the user."],
    v: "Send requests with each opt-out signal set. Confirm identifiers are removed from outgoing requests, bidders return only contextual bids, and later requests from the same user remain opted out.",
    dep: ["consent-enforcement"]
  },
  "data-minimization": {
    s: "The practice of sending, storing and using only the fields a purpose needs, and removing, rounding or hashing the rest before data leaves a party.",
    d: "Rules decide which fields go in each request: for example truncated network addresses, coarse location, no precise device details. Retention limits delete logs and profiles after a stated time. Within the exchange, data is stripped as it moves toward parties who do not need it. Minimization is a design constraint that reduces both risk and signal, so every field removed makes some bids less accurate. Measuring that cost is what lets teams decide how much to remove.",
    k: ["Stripping at the source vs at the exchange: source stripping minimizes exposure everywhere and loses data the exchange could use legitimately; exchange stripping is flexible per buyer and sees the full data.", "Rounding values vs removing them: rounding keeps some utility; removal is simple and total."],
    p: ["A field removed from the schema returns in an extension field and bypasses the rule.", "Logs retained for debugging contain full requests long after the policy period."],
    v: "Inspect a day's outgoing requests and stored logs against the data inventory. Every field must have a stated purpose, precision limit and retention period, and any field outside the inventory is a failure.",
    dep: ["bid-request-schema", "extension-fields"]
  },
  "child-and-sensitive-data-rules": {
    s: "Stricter rules for impressions involving children or sensitive categories such as health, precise location, religion and politics, which usually bar targeting or require explicit consent.",
    d: "Publishers flag child-directed sites and apps, and requests carry the flag. The exchange then removes identifiers and blocks personalized bids. Sensitive categories are excluded from audience segments and from targeting rules by policy lists. Enforcement depends on correct flags and on classification of content and segments. Mistakes are costly, since penalties are large. The challenge is incompleteness: sites are rarely labeled with perfect accuracy, and segments built from behavior can reveal sensitive traits indirectly.",
    k: ["Blocking all personalized bids when uncertain vs allowing: blocking is safe and drops revenue on mislabeled traffic; allowing keeps revenue and creates legal exposure.", "Banning sensitive segments outright vs reviewing each: bans are clear and exclude legitimate uses; review is flexible and slow and subject to error."],
    p: ["A general-audience site with a children's section is not flagged and personalized ads reach children.", "A segment named neutrally actually encodes a health condition and passes review."],
    v: "Send requests flagged as child-directed. Confirm no identifier, precise location or personalized bid appears, and audit segment names and definitions against the sensitive-category list for any match.",
    dep: ["consent-enforcement", "audience-segments"]
  },
  "on-device-interest-signals": {
    s: "Interest groups or topics computed inside the browser or device and used in the auction without the user's browsing history leaving it.",
    d: "The browser or operating system records which topics a user's activity relates to, or lets advertisers add the user to a group, and exposes a few coarse topics or runs a local auction between interest groups. The data stays on the device and only a limited result is revealed. This moves part of the decision to the client, which creates latency and reporting problems, and removes data that buyers used to see. Support varies by browser, so the exchange must run both old and new paths.",
    k: ["On-device auction vs server-side auction with coarse signals: on-device keeps data local and complicates the flow and reporting; coarse server-side signals are simple and carry less information.", "Frequent topic updates vs stable topics: frequent topics follow interest and leak more over time; stable topics protect privacy and go stale."],
    p: ["Reporting that arrives aggregated and delayed breaks optimization loops that expected immediate results.", "Supporting two paths doubles the test matrix and one drifts without notice."],
    v: "On a browser that supports it, join a test interest group, then load a page. Confirm the group's ad can win in the local auction, no history leaves the device, and the aggregate report arrives with the stated delay.",
    dep: ["consent-enforcement", "ad-request-trigger"]
  },
  "data-subject-requests": {
    s: "The process for handling a person's requests to see, correct, export or delete the data held about them, across every store where it lives.",
    d: "A person requests access or deletion through a portal or a partner. The exchange resolves their identifiers, finds records in logs, profiles, mapping tables and downstream partners, and deletes or returns them within the legal deadline. Ad data is hard to find because it is keyed by pseudonymous identifiers the person may not know, and partners copied it. Without a complete data inventory, requests can only be partially satisfied, so the inventory is the foundation.",
    k: ["Delete on request across all stores vs rely on expiry: deletion meets the law quickly and needs an index of where data lives; expiry is cheap and delays compliance.", "Forwarding requests to partners vs only deleting locally: forwarding is thorough and depends on partner cooperation; local only is simple and incomplete."],
    p: ["Backups and archived logs keep the deleted data and restore it later.", "Requests identified by an email cannot be linked to the pseudonymous profile, so nothing is deleted."],
    v: "Create a test profile with records in each store, submit a deletion request and then search every store by the test identifiers. No record may remain after the deadline and partners must confirm deletion.",
    dep: ["id-mapping-tables", "event-log-storage", "data-minimization"]
  },
  "invalid-traffic-filter": {
    s: "A pipeline stage that removes requests, impressions and clicks that are not from real people, before they are bid on or billed, and credits them back if found later.",
    d: "Rules and models score each request using signals such as network reputation, device consistency, behavior patterns and known bad sources. Obvious invalid traffic is dropped before the auction; subtler cases are caught after the fact by offline analysis, which results in adjustments to bills. The two stages differ in cost and certainty. The hard problem is the adversary: every filter teaches fraudsters what to avoid, so rules must be updated continuously and kept partly secret.",
    k: ["Pre-bid filtering vs post-bid detection: pre-bid saves buyers' money and must be fast and conservative; post-bid is accurate and finds fraud only after payment.", "Blocking suspicious traffic vs flagging it: blocking protects buyers and risks cutting honest publishers; flagging keeps revenue and leaves buyers exposed."],
    p: ["A rule triggered by a large legitimate event, like a news spike, blocks real traffic for hours.", "Credits for invalid traffic issued months later cause disputes over already paid publishers."],
    v: "Inject a labeled mix of known bot and human traffic into a test environment. Measure the share of bots removed and humans wrongly removed, and confirm the post-bid pass finds the remainder and issues the credits.",
    dep: ["bot-detection", "ip-and-device-reputation", "domain-spoofing-detection"]
  },
  "bot-detection": {
    s: "Distinguishing automated software from human users using signals like browser behavior, input patterns, headless-browser traces and network characteristics.",
    d: "Detection runs in the page, in the request pipeline and on logs. In the page, scripts test for automation markers and behavior such as mouse movement and timing. In logs, models look for unnatural regularity, huge request volume per device and impossible combinations of attributes. Bots range from simple scripts in data centers to real browsers driven by software on infected household devices, which are the hardest to catch. Detection is a continuous contest.",
    k: ["Client-side detection vs server-side: client-side sees behavior and can be bypassed by the bot's operator; server-side is hard to evade and sees less.", "Strict thresholds vs tolerant: strict catches more bots and challenges real users, tolerant protects users and lets fraud through."],
    p: ["Bots running on real consumer devices pass every device check and are only exposed by group behavior.", "Detection scripts added to pages slow them and are blocked by privacy tools, so coverage is uneven."],
    v: "Run a set of known automated browsers and a panel of real users through the detector. Report detection and false-positive rates for each bot class and confirm detected sessions are excluded from billing.",
    dep: ["ip-and-device-reputation", "stream-processing"]
  },
  "ip-and-device-reputation": {
    s: "Scores for network addresses and devices based on past behavior and known categories, such as data center, proxy or previously fraudulent, used to weigh trust in each request.",
    d: "A reputation service holds lists of data-center ranges, anonymizing networks and addresses linked to earlier invalid traffic, and per-device histories. Lookups are by address or device identifier, held in memory and updated every few minutes. Reputation affects filtering and bids. It is imperfect: addresses are shared by many users, and fraudsters rotate through residential addresses. It also overlaps with privacy because it relies on long-lived device identifiers.",
    k: ["Blocking whole network ranges vs scoring individual addresses: ranges are cheap and coarse and block honest users on shared networks; individual scores are precise and need history.", "Sharing reputation across partners vs private: shared lists give coverage and propagate mistakes; private lists are accurate for you and slow to build."],
    p: ["Corporate or school networks behind one address are scored by the worst user and all are blocked.", "A list that is not aged out keeps a clean address blocked after it has been reassigned."],
    v: "Look up a set of known data-center, proxy and residential addresses. Confirm each gets the expected category and score, and that an address reported clean for the stated period is no longer penalized.",
    dep: ["in-memory-config-cache"]
  },
  "domain-spoofing-detection": {
    s: "Detecting requests that claim to come from a premium site or app but originate somewhere else, so buyers do not pay premium prices for low-quality inventory.",
    d: "Fraudsters label requests from poor sites with the domain of a valued one. Checks compare the claimed domain with the authorized seller file, the supply chain, the page address seen by a measurement script, and traffic patterns. A mismatch lowers trust or blocks the request. Verification in the page confirms where the ad rendered, and logs from different parties are compared afterward. Spoofing is detectable in aggregate and almost never provable for a single request.",
    k: ["Matching the declared domain to the rendered domain: very accurate and needs a measurement script in the creative; declared-only checks are cheap and trust the seller.", "Blocking mismatches vs discounting them: blocking is firm and hurts honest sellers with sloppy setups; discounting keeps volume and lowers price."],
    p: ["Legitimate redirects and embedded players make the rendered domain differ from the declared one, causing false mismatches.", "Spoofers copy supply chain objects from real publishers, passing checks that compare only chain syntax."],
    v: "Send requests claiming a known site from an unauthorized source and from the real one. Confirm the unauthorized one is flagged by the authorization check, the rendered-domain report shows the mismatch, and the genuine request passes.",
    dep: ["seller-authorization-files", "supply-chain-object", "viewability-measurement"]
  },
  "seller-file-crawler": {
    s: "A scheduled service that fetches and parses the authorization files of publishers and keeps a current index of who may sell what.",
    d: "The crawler visits each domain and app listing seen in traffic, downloads its authorization file, parses entries, validates syntax and stores a versioned index. Bidders and the exchange read the index instead of fetching live. It has to be polite and fast: tens of millions of domains, with redirects, timeouts, large files and malformed entries. Changes should be visible within hours, and failures must not silently clear the list.",
    k: ["Crawling every domain on a schedule vs crawling on first sight: scheduled gives fresh data for everything and wastes effort on idle domains; on first sight is efficient and slow to see changes.", "Replacing a list when the fetch fails vs keeping the old one: keeping prevents sudden loss of authorization and hides real removals."],
    p: ["A temporary server error is parsed as an empty file and the publisher's whole inventory is marked unauthorized.", "Redirects to a different domain are followed, which authorizes sellers for the wrong publisher."],
    v: "Change a test publisher's file and confirm the index shows the change within the stated interval. Then make the file return an error and confirm the previous version is kept with a stale flag.",
    dep: ["event-log-storage"]
  },
  "click-fraud-detection": {
    s: "Finding clicks that are accidental, scripted or paid for by the page owner, using timing, patterns and post-click behavior, so advertisers are not billed for them.",
    d: "Clicks are scored on signals such as time from render to click, repeated clicks from one device, uniform click positions, and what happens on the landing page. Real clicks lead to engagement; fraudulent ones bounce instantly or never load the page. Models run in a stream pass over events, and results feed credits and publisher scoring. Many accidental clicks are on mobile ads placed near buttons, which are not fraud and have the same low value.",
    k: ["Charging per click vs per impression: click charging aligns cost with action and attracts click fraud; impression charging removes it and charges for unseen ads.", "Filtering in real time vs in batch: real time stops the charge and misses patterns that need hours of data; batch is accurate and issues credits later."],
    p: ["Clicks that never reach the landing page are charged because the click was recorded before redirect.", "A publisher with a sudden jump in click rate is penalized when the cause was a legitimate promotion."],
    v: "Generate clicks with scripted timing and positions alongside real clicks in a test. Report the detection of each pattern and confirm flagged clicks are excluded from the billing totals.",
    dep: ["stream-processing", "event-collection", "bot-detection"]
  },
  "brand-safety-classification": {
    s: "Classifying pages, apps and videos by content risk, such as violence or adult material, so advertisers avoid appearing beside content they consider unsuitable.",
    d: "Classifiers read page text, images, video and links and assign risk categories and levels, with results keyed by page address or app. Buyers choose which categories to exclude. Classification runs outside the auction and the results are carried in a lookup table or in the request. User-generated content changes constantly, making accuracy and freshness hard; language and context, such as news about a conflict, confuse models.",
    k: ["Classifying whole sites vs individual pages: sites are cheap and block good pages; pages are precise and demand crawling at scale.", "Strict categories vs adjustable thresholds: strict is simple and over-blocks news; adjustable respects each advertiser and is harder to explain and audit."],
    p: ["Blocking all news pages with the word attack removes legitimate journalism and drives revenue away from publishers.", "A page changed after classification, such as a comment section, serves ads beside new content."],
    v: "Run a labeled set of safe and unsafe pages through the classifier and report precision and recall per category. Confirm that a campaign excluding a category receives no bids on pages labeled with it.",
    dep: ["inventory-classification", "blocklists-and-allowlists"]
  },
  "event-collection": {
    s: "The endpoints that receive impression, click, view and conversion events from browsers, apps and servers, validate them and write them for later processing.",
    d: "Light HTTP endpoints accept beacons, check signatures or tokens, attach receive time and location, and write to a durable queue. They must stay up under spikes, since a lost event is lost revenue, and answer immediately, with processing elsewhere. Beacons arrive from untrusted clients, so validation and abuse limits are needed. Clock differences between client and server make time ordering unreliable, and so event time and receive time are both stored.",
    k: ["Acknowledging after durable write vs after receipt: durable is safe and slower; receipt is fast and loses events if the node dies.", "Signed event URLs vs open endpoints: signed URLs block forged events and need key handling; open endpoints are simple and accept fraud."],
    p: ["Collectors overloaded during a traffic spike drop events at exactly the time spend is highest.", "Retries by clients after timeouts produce duplicate events that arrive far apart."],
    v: "Send a known number of events at peak rate with some retries and invalid signatures. Confirm every valid event reaches the queue once, invalid ones are rejected and counted, and the collector latency stays under its limit.",
    dep: ["event-log-storage", "edge-load-balancing"]
  },
  "impression-deduplication": {
    s: "Removing repeated records of the same impression or click, caused by retries, reloads and multiple reporting paths, so each is counted and billed once.",
    d: "Every impression carries a unique identifier created at auction time. The pipeline keeps a window of seen identifiers and drops repeats, in streaming and again in batch. Different parties dedupe differently, which causes mismatched counts. Windows must be long enough to catch late duplicates and short enough to fit in memory, and some duplicates come as new identifiers when a page reloads an ad, which identifier checks cannot catch.",
    k: ["Streaming dedupe window vs exact batch dedupe: streaming is timely and misses late repeats; batch is exact and delays results.", "Dedupe by auction identifier vs by user, creative and time: identifier is exact for retries; the second catches reloads and risks removing real repeats."],
    p: ["A window shorter than the longest retry delay lets duplicates through and inflates revenue for a day.", "Identifiers reused after a bug produce collisions that delete real impressions."],
    v: "Send the same impression events repeatedly with delays up to the documented maximum. Confirm each is counted once in streaming totals and batch totals, and that distinct impressions sharing a user and creative are all counted.",
    dep: ["event-collection", "stream-processing"]
  },
  "log-pipeline": {
    s: "The chain of queues, processors and stores that turns raw auction and event records into clean, joined datasets used for reports, billing, models and audits.",
    d: "Auction logs, win notices, impressions and clicks are written to queues, joined by auction identifier, enriched with seat, seller and campaign data, deduplicated, and written to a warehouse in batches and as streams. The same data feeds dashboards within minutes and finance within days. Joins across sources that arrive at different times are hard, and so are replays after a bug, because corrected data must not double count.",
    k: ["One shared pipeline vs separate ones for reporting and billing: shared avoids discrepancies and couples their uptime; separate lets billing be slow and exact and risks different numbers.", "Event time vs processing time for windows: event time is correct and needs late data handling; processing time is simple and shifts numbers on replays."],
    p: ["A schema change in one upstream source silently turns a column to null for days.", "Late-arriving impressions after a daily close are never counted unless the close is reopened."],
    v: "Inject a set of events with known counts and delays through the pipeline. Confirm warehouse totals equal the injected counts after the late-data window and that rerunning a day produces identical totals.",
    dep: ["event-log-storage", "stream-processing", "impression-deduplication"]
  },
  "attribution": {
    s: "Linking a conversion, such as a purchase, to the ads a person saw or clicked earlier, and deciding which ad or campaign gets the credit.",
    d: "Conversion events from the advertiser carry an identifier that is matched against stored impressions and clicks within a lookback window. A rule assigns credit: the last click, the last view or a split across touches. Matching needs identifiers that survive from the ad to the purchase, which is less often possible. Reported conversions therefore underestimate true effect, and experiments with holdout groups are used to estimate real incrementality.",
    k: ["Last-touch credit vs multi-touch models: last-touch is simple and favors lower-funnel ads; multi-touch spreads credit and rests on assumptions that cannot be verified.", "Deterministic matching vs modeled conversions: deterministic is exact where identifiers exist; modeled fills gaps and cannot be audited."],
    p: ["A conversion credited to a retargeted ad that the person would have seen anyway overstates its value.", "A long lookback window credits old impressions for purchases unrelated to them."],
    v: "Run a test where a known user sees an ad and then converts. Confirm the conversion is attributed within the window to the correct campaign, and that a conversion outside the window is not.",
    dep: ["log-pipeline", "id-mapping-tables", "win-and-impression-beacons"]
  },
  "reporting-api": {
    s: "The interface through which buyers, sellers and finance read spend, impressions, win rates, prices and errors, in aggregates and sometimes in raw logs.",
    d: "Queries by date range, seat, campaign, seller and dimension run against pre-aggregated tables for speed, with fresher streaming numbers for the current hour. Reports must reconcile with billing, so the same definitions of impression and spend apply. The interface limits the cost of queries, applies privacy thresholds that hide small groups, and exports files. Differences between near-real-time and final numbers are expected and must be labeled.",
    k: ["Pre-aggregated tables vs queries on raw data: aggregates are fast and fixed in dimensions; raw queries are flexible and expensive and slow.", "Showing provisional numbers vs only final: provisional gives control during a day and gets revised; final is trustworthy and late."],
    p: ["Dashboard numbers that differ from the invoice by definition lead to disputes nobody can explain.", "Unbounded queries by one customer slow reporting for everyone."],
    v: "Compare the report for a closed day against a direct sum over the warehouse and against the invoice. All three must agree within the stated tolerance, and an hour still open must be labeled provisional.",
    dep: ["log-pipeline", "discrepancy-reconciliation"]
  },
  "discrepancy-reconciliation": {
    s: "The process of comparing the counts and money reported by buyer, exchange and seller, finding why they differ, and agreeing on a single number.",
    d: "Each party counts its own events: the exchange records auction wins, the buyer's ad server counts impressions it served, and the seller counts what its page rendered. Differences of five to fifteen percent are normal because of lost beacons, timing, blocking and differing definitions. Reconciliation compares totals by day and dimension, investigates large gaps, and applies a rule for which count is billable. Automated checks flag drifts early, before the invoice.",
    k: ["The exchange's count as the billable one vs a third-party count: the exchange's count is simple and distrusted by buyers; a third party is neutral and adds a cost and a dispute path.", "Tolerance threshold vs line-by-line review: a threshold is cheap and lets small errors accumulate; line-by-line is exact and expensive."],
    p: ["A change in a beacon implementation raises the gap quietly and is discovered at month end.", "Gaps between regions or time zones are blamed on fraud when the cause is date boundaries."],
    v: "Compare the daily counts of the exchange, a buyer and a seller for a month. The gap per day must stay within the agreed band, and any day outside it must have a recorded cause and resolution.",
    dep: ["log-pipeline", "win-and-impression-beacons"]
  },
  "billing-and-invoicing": {
    s: "Turning agreed spend into invoices and collecting payment from buyers, including fees, taxes, currencies, credits for invalid traffic and credit limits.",
    d: "At period close the system takes the reconciled spend per seat and campaign, adds the exchange's fee, converts currencies, applies credits and taxes, and produces invoices and statements. Payment terms and credit limits are enforced in real time during the period by seat checks. Because spend arrives in tiny amounts, billions of them, totals must be exact and reproducible, and rounding rules must be defined. Late corrections create adjustments to prior periods.",
    k: ["Billing on the exchange's final counts vs on a verified third-party count: own counts are final and cheap; third party reduces disputes and delays invoicing.", "Prepaid balances vs postpaid invoices: prepaid is safe and limits buyers' flexibility; postpaid is convenient and carries credit risk."],
    p: ["Rounding each impression separately and then summing differs from summing and rounding, giving invoices that disagree by large amounts at scale.", "Exchange rates taken at different times for the bid and the invoice leave unexplained differences."],
    v: "Generate an invoice for a test seat with known impressions, a credit and a currency conversion. Recompute it by hand and confirm every line, tax and total match exactly, and rerunning produces the same document.",
    dep: ["discrepancy-reconciliation", "seats-and-buyer-accounts", "accounting-exactness"]
  },
  "publisher-payouts": {
    s: "Paying publishers their share of reconciled revenue on a schedule, after fees, credits for invalid traffic and any adjustment for earlier periods.",
    d: "Revenue per publisher is the cleared price on valid, reconciled impressions minus the exchange's share, adjusted for clawbacks. Payment runs on set terms, often thirty to sixty days after the period closes, with minimum thresholds and tax documentation. Payouts depend on collecting from buyers, so late-paying buyers affect cash flow. Reports show publishers the earnings by slot and day, and disputes are resolved against the same reconciled data.",
    k: ["Paying after collecting from buyers vs paying on schedule: after collecting protects the exchange from loss and delays publishers; on schedule is attractive and puts credit risk on the exchange.", "Netting invalid-traffic credits from the next payment vs the same one: netting from next is smooth and creates negative balances; the same period is exact and delays payments."],
    p: ["A publisher paid for traffic later found invalid owes money the exchange cannot easily recover.", "Payments in the wrong currency or account due to outdated details are returned weeks later."],
    v: "Run a payout for a test publisher with known revenue, fee and a clawback. Confirm the amount equals the hand-computed total, the statement lists each component, and payment lands in the right account.",
    dep: ["billing-and-invoicing", "discrepancy-reconciliation"]
  },
});
