// Details part 3: auction and floors, user matching and identity.
ATLAS.details("ad-exchange", {
  "auction-orchestrator": {
    s: "The service that runs one auction end to end: receives a request, applies rules, calls bidders, waits, picks a winner and returns the result to the seller.",
    d: "On each request it validates the input, attaches seller rules and floors, chooses which bidders to call, sends requests in parallel, collects responses until the deadline, validates and ranks them, applies pricing and returns the winner with a notice address. It writes a decision record for every auction. The orchestrator is stateless and horizontally scaled, because each auction takes about a hundred milliseconds and nothing is shared between them. The difficulty is tail behavior: slow bidders, retries and partial failures must never delay the response.",
    k: ["Parallel fan-out with a hard deadline vs sequential waterfall: parallel gets competition and the best price in one round; a waterfall is cheaper in calls and slower and leaves money on the table.", "Stateless orchestrator vs one that caches per-user state: stateless scales and recovers easily; cached state saves lookups and complicates failover."],
    p: ["Waiting for the slowest bidder instead of cutting at the deadline delays every response by the worst case.", "A bug in ranking silently selects the wrong winner and is only noticed as odd revenue weeks later."],
    v: "Run a synthetic auction with five bidders of known prices and latencies, one past the deadline. Confirm the highest on-time bid wins, the late bid is excluded, the response arrives before the deadline and the decision record shows all five.",
    dep: ["bidder-fan-out-selection", "timeout-management", "bid-validation", "first-price-clearing", "second-price-clearing", "auction-decision-log"]
  },
  "bidder-fan-out-selection": {
    s: "Choosing which bidders receive each request, to get enough competition without sending traffic that bidders will ignore or that costs the exchange more than it earns.",
    d: "Sending every request to every bidder multiplies network cost and wastes bidder compute. The exchange uses each bidder's declared preferences, past bid rates and win rates to decide whom to ask. Some requests go to all of them, high-value ones especially, while low-value ones go to a few. The approach is a form of QPS shaping at the seller's end. It is hard because selection changes competition, and a bidder that never gets traffic can never show it would have bid.",
    k: ["Send to all bidders vs selected ones: all maximizes competition and costs bandwidth and bidder goodwill; selection saves cost and risks excluding the best bidder for some requests.", "Learning bidders' interests from history vs trusting declared filters: history reflects real behavior and lags change; declared filters are explicit and easily out of date."],
    p: ["Trimming a bidder whose bid rate dips for a day starves it of the data it needs to recover.", "Selection tuned for the average request lowers prices on the rare, valuable ones."],
    v: "Compare auctions with full fan-out to a randomly held-out sample of requests against the production selection. Revenue per request in the selection must be within the stated loss while outgoing traffic is reduced by the stated saving.",
    dep: ["no-bid-signaling", "auction-decision-log", "in-memory-config-cache"]
  },
  "timeout-management": {
    s: "Setting and enforcing how long the exchange waits for bidders, including the budget for network time, per-bidder deadlines and what happens to late answers.",
    d: "The seller specifies a total deadline in the request. The exchange subtracts its own processing and network time and gives bidders the rest, perhaps trimmed by round-trip estimates for each bidder's region. Responses arriving after the cutoff are dropped, even if they hold the best price. Timeouts directly trade price against page speed: longer waits add bids, and also delay the page. Tail latency of bidders is the main source of lost revenue for them and the exchange.",
    k: ["One global timeout vs per-bidder timeouts: global is simple and punishes bidders with farther locations; per-bidder is fairer and requires reliable round-trip estimates.", "Dropping late bids vs using them for the next request: dropping keeps the auction clean; using late bids captures value and breaks the rule of one request one auction."],
    p: ["A timeout that includes no allowance for the return trip delivers an answer after the page has given up.", "A bidder that is consistently just over the limit wastes compute every request and gets nothing."],
    v: "Add artificial delays of increasing size to a test bidder. Confirm the bid is accepted up to the configured cutoff and dropped just after, and that the exchange's total response time never exceeds the seller's deadline.",
    dep: ["latency-monitoring", "connection-management"]
  },
  "bid-validation": {
    s: "Checks run on every bid before it can win: well-formed, correct currency, above floor, creative approved, advertiser and category not blocked and format matching the slot.",
    d: "After the response is parsed, each bid passes a pipeline of rules in a fixed order, cheap ones first. The exchange checks the price and currency, converts it to the auction currency, compares it with the floor, verifies the creative against its registry entry and the seller's blocks, and checks the size and format. Failing bids are removed and the reason is logged. Because bad bids could win and break a page or violate a seller's policy, validation protects both sides and its rules are strict.",
    k: ["Rejecting at the first failed rule vs recording all failures: first-failure is faster; recording all gives bidders full feedback and costs time on the critical path.", "Strict validation vs tolerant: strict protects publishers and rejects bids with harmless mistakes; tolerant keeps more competition and risks bad ads."],
    p: ["A currency conversion table that is stale makes bids look above or below the floor wrongly.", "Rejected bids with no reason returned leave bidders unable to find why they never win."],
    v: "Send a batch of bids each violating exactly one rule. Confirm each is rejected with the matching reason, valid control bids pass, and the rejection counts per reason appear in the exchange's metrics.",
    dep: ["creative-registry", "floor-pricing", "format-and-size-negotiation", "blocklists-and-allowlists"]
  },
  "second-price-clearing": {
    s: "Selecting the highest bid as winner and charging it the second-highest bid plus a small increment, or the floor if that is higher.",
    d: "Bids are sorted; the top bidder wins and pays just above the next price or the floor. In theory a bidder's best strategy is to bid its true value because it never pays its own bid. Exchanges moved away from it in many markets because intermediaries could change the second price, so buyers did not trust it. It still appears in deals and some video and audio markets. The exchange must apply it identically to what it reports, since buyers verify clearing prices against their logs.",
    k: ["Second price vs first price: second price makes bidding truthfully simple and depends on trusting the seller; first price is transparent and requires bid shading.", "Second price among bids vs including the floor: including the floor protects the seller and can surprise buyers with a higher charge."],
    p: ["Bid modifications by intermediaries before the auction make the stated second price different from the real one.", "Rounding the increment down to zero when there is one bidder charges the bidder its full bid or nothing, depending on the rule."],
    v: "Run auctions with bids of ten, eight and five and a floor of six. The ten wins and pays eight plus the increment. With bids of ten and five, it pays six. Compare each with the log.",
    dep: ["floor-pricing", "bid-validation"]
  },
  "first-price-clearing": {
    s: "Selecting the highest bid as winner and charging it exactly what it offered, which makes the price transparent and pushes buyers to bid below their true value.",
    d: "The top valid bid wins and its price is the clearing price. This is simple to explain and audit, and removes the question of how a second price was computed. Buyers then have to guess how low they can bid and still win, which creates the need for shading models that learn the market. The exchange may publish the minimum winning price, or the price the loser needed, so buyers can learn. Revenue depends on how well buyers adapt.",
    k: ["Publishing the winning price to losers vs not: publishing lets buyers learn quickly and reduces overpaying; withholding keeps buyer information limited and slows market efficiency.", "First price with hard floors vs soft floors: hard floors protect price and drop low bids; soft floors keep fill and give less control."],
    p: ["A buyer that has not adopted shading overpays massively right after a market switches to first price.", "Ties are broken inconsistently and consistently favor one bidder by arrival time."],
    v: "Run auctions with known bids and confirm the winner pays exactly its bid in the log and in the notice sent to the bidder. Repeat with exact ties and confirm the stated tie rule applies.",
    dep: ["floor-pricing", "bid-validation"]
  },
  "bid-shading": {
    s: "Reducing a bid below the buyer's value in a first-price auction, to the lowest price the buyer estimates will still win, so surplus is not given away.",
    d: "Given an impression's value and a learned win-rate curve, shading picks the price that maximizes expected profit: value minus price, times probability of winning. Buyers shade in the bidder, and some sellers or intermediaries offer shading as a service on behalf of buyers. The curve is learned from past auctions and changes whenever competitors or floors change. Over-shading loses auctions that would have been profitable, under-shading overpays, and both are invisible without comparison to alternatives.",
    k: ["Shading in the buyer's bidder vs by an intermediary: the buyer keeps control and data; an intermediary has cross-buyer data and a conflict of interest.", "A smooth parametric curve vs a nonparametric estimate: parametric is stable with little data; nonparametric fits odd markets and needs volume."],
    p: ["Competing shaders learning from each other's outputs push prices down in step and then jump back when one changes.", "Shading applied twice, by bidder and intermediary, loses most auctions."],
    v: "Randomize a small share of bids between shaded and unshaded in a live experiment. Compare profit per impression and win rate; shading must raise profit and lower win rate by the amounts the model predicted.",
    dep: ["bid-landscape-learning", "first-price-clearing"]
  },
  "floor-pricing": {
    s: "The minimum price a seller will accept for an impression, set by rule per slot, geography, buyer or deal, below which a bid is rejected.",
    d: "Floors are set by the publisher or exchange and carried in the request, so bidders can see them. They can be flat, by format or country, per buyer or per deal. The auction rejects bids under the floor and may use it as the second-price minimum. Floors protect revenue and brand value but remove supply from auction when set too high, so unfilled impressions are the cost. Floors also shape what bidders learn about the market.",
    k: ["A visible floor vs hidden: visible floors save buyers wasted bids and let them anchor on it; hidden floors collect surplus from buyers who would have bid more and cause confusing losses.", "A single floor vs per buyer floors: single is simple and fair; per buyer captures differing value and looks like discrimination."],
    p: ["Floors tuned during a busy season stay in place afterward and leave most impressions unsold.", "A floor in one currency applied to bids in another produces wrong rejections."],
    v: "Set a floor and send bids just below, at and above it. Confirm those below are rejected with the floor reason, those at or above are eligible, and the request sent to bidders showed the floor value.",
    dep: ["ad-slot-definitions", "dynamic-floor-optimization"]
  },
  "dynamic-floor-optimization": {
    s: "A model that sets floors per impression from predicted bid distributions, to raise prices where demand is strong and keep fill where it is weak.",
    d: "Using past auction logs, the model predicts the distribution of bids for a request type and sets a floor that maximizes expected revenue, which is usually just below the expected top bid. It runs every request through a cached model or a table updated every few minutes. It must account for buyers adapting: if floors rise, bidders lower or change bids. Measuring benefit needs controlled holdouts because revenue naturally varies across hours and days.",
    k: ["Learned floors vs rule-based floors: learned floors adapt per request and are opaque and can oscillate; rules are predictable and slow to follow demand.", "Optimizing revenue per auction vs long-term buyer spend: per auction wins now; long-term keeps buyers engaged and requires slower targets."],
    p: ["A feedback loop between buyers' learned bids and the exchange's learned floors makes both drift upward until fill collapses.", "No holdout group makes a revenue drop from a bad model look like a market change."],
    v: "Hold out a fixed share of traffic on static floors. Compare revenue per thousand requests and fill rate with the optimized group over several weeks; the optimized group must beat holdout without a larger fill drop.",
    dep: ["auction-decision-log", "stream-processing", "floor-pricing"]
  },
  "private-marketplace-deals": {
    s: "Invitation-only auctions or fixed-price arrangements where a publisher offers selected inventory to selected buyers on agreed terms.",
    d: "A deal has an identifier, participants, a price type and floor, targeting terms and often a volume goal. In the auction, requests include the deal identifiers eligible for each seat. Deal bids are ranked before or alongside open market bids, depending on type. The exchange also tracks delivery against the goal and shows both sides the shortfall. Deals fail commonly because the buyer's targeting and the seller's inventory never overlapped enough, and the problem is discovered only in the delivery report.",
    k: ["Deal priority above open auction vs equal competition: priority ensures buyers get promised delivery and can sell at below-market prices; equal competition maximizes price and weakens the promise.", "Guaranteed volume vs best effort: guarantees need forecasting and make-goods; best effort is simple and unreliable for planning."],
    p: ["A deal that is mostly unfilled shows no errors, only a delivery report days later.", "Deal identifiers sent to bidders that are not in the deal leak negotiated terms."],
    v: "Create a deal with a goal, send matching traffic and compare the bidder's received count, bid count, win count and the exchange's delivery report. All four must reconcile and the shortfall must match the logs.",
    dep: ["deal-targeting", "floor-pricing", "auction-orchestrator"]
  },
  "auction-decision-log": {
    s: "The record of every auction: the request, who was asked, each bid, rejections and reasons, the winner and the price, kept for learning, debugging and billing disputes.",
    d: "An auction emits a structured record with identifiers, timestamps, floors, all bids and their outcome, and the reason each non-winner lost. At billions of auctions a day it is sampled for the loser detail while winners are always kept in full. The log feeds floor models, bid learning, discrepancy checks and audits. It is large and sensitive because it contains user and price data, so retention and access are limited.",
    k: ["Logging every bid vs only winners: full logs let everyone learn and cost storage and expose losing prices; winners-only is cheap and hides what the market needed.", "Synchronous write vs asynchronous queue: synchronous is durable and slows the auction; asynchronous is fast and can lose records in a crash."],
    p: ["Dropped log records make learning data biased toward whatever was easier to write.", "Retaining full request data longer than the privacy policy allows creates a liability."],
    v: "Run a known set of auctions and compare the log's records to the expected bids, outcomes and prices. All records must be present within the stated delay, and a record that violates the retention policy must age out.",
    dep: ["event-log-storage", "stream-processing"]
  },
  "cookie-sync": {
    s: "A redirect-based exchange in which two companies learn that their identifiers for the same browser refer to one user, building a table that matches them.",
    d: "When a user loads a page, a script triggers requests to several partners. The first sets or reads its own identifier and redirects to the second with that identifier in the URL; the second reads its own cookie and stores the pair. Over time each side has a map from its identifier to the other's. The table is then used at bid time to look up the buyer's identifier from the seller's. Browsers increasingly block third-party identifiers, and each sync adds requests that slow the page.",
    k: ["Syncing on every page vs rate limiting: constant syncing maintains freshness and slows pages; limits protect page speed and age out the match table.", "Syncing with all partners vs with a chosen few: all partners maximizes reach and cost; few partners focus effort on the buyers who bid."],
    p: ["Browsers that block third-party storage return no identifier, so match rates silently fall to zero for those users.", "Chained redirects loop between partners and delay the page."],
    v: "Load a test page in a browser that allows third-party storage and trace the redirects. Confirm each partner stores the pair, a later request resolves to the matching identifier and the sync is not repeated within its interval.",
    dep: ["id-mapping-tables", "consent-enforcement"]
  },
  "id-mapping-tables": {
    s: "A large table, held in a fast store, that translates one party's user identifier into another party's identifier, used at bid time to recognize a user.",
    d: "Each row maps a seller-side identifier to a buyer-side one, with a creation time and often an expiry. It is filled by syncs and by identity partners. At bid time the bidder looks up the incoming identifier in the table, which has to take well under a millisecond, so the table lives in memory with sharding. Size is a problem: hundreds of millions of rows per partner. Staleness and many-to-one mappings, like shared devices, reduce its value.",
    k: ["Keeping the whole table in memory vs on solid state storage: memory is fastest and costly; solid state is cheaper and adds latency that eats the bid budget.", "Short expiry vs long: short expiry respects privacy and loses matches; long expiry maintains reach and can map a stale identifier to the wrong person."],
    p: ["A shared computer maps one identifier to several people, and their interests merge.", "A bulk load that fails partway leaves the table with mixed old and new data."],
    v: "Sample requests and measure the share whose identifiers resolve. The share must match the sync rate expected for each source, and a lookup for an expired row must return nothing rather than a stale value.",
    dep: ["cookie-sync", "in-memory-config-cache"]
  },
  "id-graph": {
    s: "A database linking identifiers that belong to the same person or household across browsers, devices and apps, so a campaign can reach and count the person and not the device.",
    d: "Nodes are identifiers such as cookies, device IDs, hashed emails and addresses; edges come from logins, shared network addresses and co-occurrence, each with a confidence. Clusters become person or household identifiers used for targeting and frequency capping. It is built offline and queried by cluster identifier at bid time. It is hard because wrong links merge strangers, and links expire as devices change hands. Privacy rules limit how much linking is permitted.",
    k: ["Deterministic links only vs adding probabilistic ones: deterministic links are precise and reach few people; probabilistic links extend reach and bring errors and compliance risk.", "Household level vs individual level: household reaches more and is easier to infer; individual is precise and needs stronger evidence."],
    p: ["A shared public network address links unrelated users and shows each the others' retargeted ads.", "An unmaintained graph keeps linking an old phone to a new owner."],
    v: "Use a panel of volunteers with known devices. Measure the share of their devices placed in one cluster and the share of strangers wrongly merged; both must meet the stated thresholds.",
    dep: ["deterministic-ids", "probabilistic-matching", "device-ad-ids"]
  },
  "deterministic-ids": {
    s: "Identifiers tied to something a user knowingly provides, such as a hashed email address, so the same person can be matched across sites and devices with high confidence.",
    d: "A user signs in with an email or phone number; the site hashes it and shares the hash with partners who have the same hash from their own sign-ins. The match is exact for that person. Coverage is limited to signed-in users on participating sites, and consent for sharing is required. Hashing is not strong protection because the space of emails is guessable, so the hashes are treated as personal data and shared under contract.",
    k: ["Hashed email vs a rotating pseudonymous identifier: hashed email is stable and easy to match and is a lasting personal identifier; rotating identifiers limit tracking and need a trusted issuer.", "Sharing the identifier in every request vs on demand: every request maximizes use and leaks widely; on demand limits exposure and adds a step."],
    p: ["Different normalizations of the same email, such as capitalization, produce different hashes and no match.", "Hashes passed to partners without valid consent breach the user's choice."],
    v: "Create two test accounts with the same email on two partner sites. Confirm both produce the same hash, the match resolves, and that a user who withdrew consent produces no identifier in requests.",
    dep: ["consent-enforcement", "data-minimization"]
  },
  "device-ad-ids": {
    s: "Resettable identifiers provided by a mobile or television operating system for advertising, which users can reset or turn off.",
    d: "An app reads the identifier through the platform's interface if the user has allowed tracking, and includes it in requests. Because it is stable per device, it enables frequency capping, attribution and audience building in apps. Platform policies determine whether it is available at all: on many devices a prompt makes most users decline. When absent, requests carry only context or limited signals, and buyers fall back on contextual and platform-provided attribution.",
    k: ["Using the identifier where allowed vs avoiding it everywhere: use gives measurement and targeting for consenting users; avoiding it is simpler and loses features.", "Treating the zero value as an identifier vs as absence: treating zero as an identifier merges all opted-out users; treating it as absent is correct and needs explicit handling."],
    p: ["The all-zero identifier of opted-out users is counted as one extremely active user and capped immediately.", "An identifier reset by the user is treated as a new person and shown the full frequency again."],
    v: "Toggle the tracking setting and reset the identifier on a test device. Confirm requests contain the identifier only when allowed, a reset produces a new value, and the opted-out case carries no identifier and is handled as anonymous.",
    dep: ["opt-out-signals", "consent-enforcement"]
  },
  "probabilistic-matching": {
    s: "Inferring that two sets of activity belong to the same person from shared signals such as network address, device model and time patterns, giving a likelihood and not a fact.",
    d: "A model compares attributes of two identifiers, such as same home network, similar locations and overlapping visit times, and assigns a probability that they are one person. Pairs above a threshold are linked in the graph with that confidence recorded. Accuracy rises with more signals and falls when networks are shared. It is increasingly constrained, because the signals it uses, such as fingerprints, are the ones that privacy changes restrict.",
    k: ["High threshold vs low: a high threshold keeps links accurate and reduces reach; a low one extends reach and adds false matches.", "Using fingerprinting signals vs only network and context: fingerprint signals are accurate and are treated as tracking without consent; network and context signals are weaker and acceptable."],
    p: ["Offices and mobile carriers share network addresses among thousands, and the model links all of them.", "A model trained when one browser exposed more signals degrades quietly when it stops."],
    v: "Evaluate on a labeled panel where true links are known. Report precision and recall at the production threshold, and confirm that links below the threshold are not used in bidding.",
    dep: ["ip-and-device-reputation", "data-minimization"]
  },
  "clean-room-matching": {
    s: "A controlled environment where two parties combine their data to compute overlap or measure results, without either seeing the other's raw records.",
    d: "Each party uploads hashed or encrypted identifiers and attributes into a secured space operated by a neutral party. Queries run inside it under rules, such as minimum group size and limited columns, and only aggregate results come out. Uses include audience overlap, attribution and reach. It addresses the demand for matching without sharing identifiers, and its limits are cost, slow queries and the need for the other side to have usable identifiers at all.",
    k: ["Aggregates only vs row-level output: aggregates protect individuals and limit use; row-level is flexible and defeats the privacy purpose.", "Neutral operator vs one party's environment: neutral operators are trusted by both and cost more; one party's environment is cheaper and trusted by no one else."],
    p: ["Repeated overlapping queries let a party infer a single person's data from differences between aggregates.", "Different hashing rules on each side produce matches of near zero and little is learned."],
    v: "Upload two test datasets with a known overlap and run an overlap query. Confirm the count equals the known value, a query on a group below the minimum size is refused, and no row-level data can be exported.",
    dep: ["deterministic-ids", "data-minimization"]
  },
});
