// Details part 2: targeting, budget pacing and frequency, bid request format and protocol.
ATLAS.details("ad-exchange", {
  "audience-segments": {
    s: "Named groups of users, such as recent travel shoppers, that a buyer builds from its own data or buys, and uses to decide which impressions a campaign wants.",
    d: "A segment is a list of identifiers or a rule over observed behavior. The bidder keeps a table from user identifier to segment membership, loaded in memory or looked up in a fast store. At bid time the request's user identifier, after matching, is looked up and the segments become targeting inputs. Segments expire, since interest fades, and are rebuilt as new events arrive. The difficulty is coverage: only users whose identifier the bidder recognizes can be targeted, so segments are only as large as the match rate.",
    k: ["Segment table lookup per request vs segment list carried in the request: lookups keep data private and cost latency; carried lists are fast and expose the user's interests to everyone who receives the request.", "Long expiry vs short expiry: long expiry keeps reach and targets stale interest; short expiry is relevant and shrinks audience size."],
    p: ["Segment membership built from consent-restricted data is used on requests where the user has refused consent.", "A table update that loads half the new data produces users in no segment and wrongly excluded."],
    v: "Add a test user to a segment, send a request with that user's matched identifier, and check that the segment appears in the bidder's decision log. Remove the user and confirm the next request no longer matches.",
    dep: ["id-mapping-tables", "in-memory-config-cache", "consent-enforcement"]
  },
  "contextual-targeting": {
    s: "Choosing impressions by what the page or app is about, such as its topic, keywords or content type, without needing to know who the user is.",
    d: "The request carries page address, categories and sometimes keywords; the buyer matches them against campaign rules or semantic models over the page's text. Because no user identifier is needed, it works under strict privacy settings and is again growing in use. Quality depends on the labels: crawled or classified page text is much better than a publisher's declared category. It is hard to run at request time, so page analyses are computed ahead and looked up by address.",
    k: ["Keyword rules vs semantic classification: keyword rules are transparent and miss meaning and negation; semantic models match topic and cost compute and can misjudge sarcasm or news.", "Real-time page analysis vs cached analysis: real-time is current and impossible inside the deadline; cached is fast and stale for breaking stories."],
    p: ["Keyword matching places a travel ad next to an article about a plane crash.", "Pages behind logins or rendered by scripts give the crawler no text, so they match nothing or match wrongly."],
    v: "Select ten pages with known topics and request ads for a campaign targeting one topic. Confirm bids appear for pages of that topic and for none of the others, and check the matched label in the decision log.",
    dep: ["inventory-classification", "brand-safety-classification"]
  },
  "geo-targeting": {
    s: "Limiting or pricing bids by where the user is, from a device location in the request or from a location inferred from the network address.",
    d: "Requests may carry coordinates from the device or an address-based region. The buyer maps either to a country, region, postal area or a drawn shape around a place, using a geography database that is updated regularly. Precision varies hugely: device coordinates may be within meters, address lookups only to a city or an internet provider's hub. Shape matching over many fences is costly, so it is done with spatial indexes. Privacy rules classify precise location as sensitive.",
    k: ["Address-based location vs device-reported coordinates: address-based is present on every request and coarse; coordinates are precise, need consent and can be spoofed.", "Exact polygon matching vs grid cells: polygons are accurate and slow; precomputed cells are fast and approximate at borders."],
    p: ["Mobile carriers route traffic through central gateways, so address-based lookups put users in the wrong city.", "A stale geography database misses new postal areas and drops valid impressions."],
    v: "Send requests with known coordinates just inside and just outside a campaign's boundary, plus requests with only an address. Confirm the boundary requests split correctly and the address requests match only at the precision stated.",
    dep: ["bid-request-schema", "in-memory-config-cache", "child-and-sensitive-data-rules"]
  },
  "device-and-environment-targeting": {
    s: "Rules based on the device type, operating system, browser, connection speed, app, screen and whether the environment is a page, an app or a television.",
    d: "Fields in the request describe the user agent, device model, connection type, carrier and the app or site. The buyer parses them into normalized values and matches them against campaign rules. These attributes also decide which formats can run and how a creative should be built. They are straightforward to read and noisy to trust: user agents are frozen or reduced for privacy, and fraudulent traffic fakes them. Rules must be updated when new devices and versions appear.",
    k: ["Parsing the user agent string vs structured client hints: strings are universal and increasingly reduced and ambiguous; structured hints are precise and require browser support and an extra step.", "Allowlisting known devices vs blocking known bad ones: allowlists are safe and miss new devices; blocklists keep reach and let new fraud through."],
    p: ["Unrecognized new device models fall into an unknown bucket that campaigns exclude, hiding growing inventory.", "A parser bug mislabels one browser version as mobile and shifts spend to the wrong audience."],
    v: "Replay a sample of real user agents and compare the parsed device, operating system and type against labels from a reference device. Disagreement rate must stay under the stated threshold and unknowns must be reported.",
    dep: ["bid-request-schema", "ip-and-device-reputation"]
  },
  "retargeting-lists": {
    s: "Lists of users who visited an advertiser's site or app or took a specific action, so the advertiser can bid to reach them again.",
    d: "A pixel or event on the advertiser's site records a visit against the buyer's identifier for that browser. The list stores the identifier, the action and the time, and drives bids: higher for recent cart abandoners, none for recent purchasers. List size and age matter because intent decays fast. The buyer needs a match for the identifier on the bid request, so the quality of the user matching decides how much of the list can actually be reached.",
    k: ["Long list windows vs short: long windows reach more users and waste spend on cold interest; short windows are efficient and small.", "Excluding converters at bid time vs by batch: bid-time exclusion is accurate and needs a fast lookup; batch exclusion is cheaper and keeps showing ads to people who just bought."],
    p: ["Users who purchased still get ads for days because exclusion lagged the purchase event.", "Lists collected without valid consent are used for targeting and expose the advertiser to complaints."],
    v: "Visit a test site with a test browser, then trigger a request for that browser. Confirm the user appears on the list within the stated delay, is matched at bid time, and drops off immediately after a purchase event.",
    dep: ["audience-segments", "cookie-sync", "consent-enforcement"]
  },
  "lookalike-modeling": {
    s: "Finding users who resemble an advertiser's existing customers, by training a model on the customers' traits and scoring a wider population against it.",
    d: "Seed users, such as buyers, are positive examples; other users are negatives or unlabeled. A model learns which features separate them and scores new users, and the highest scoring become an expanded audience. Scores are computed offline and published as a segment, because scoring each request would be slow. The expanded audience trades precision for reach: advertisers use it when the seed audience is too small to spend a budget.",
    k: ["Model on behavior features vs on page content features: behavior is accurate and needs identifiers; content-based works without them and finds weaker similarity.", "A fixed expansion size vs a score threshold: size gives predictable reach, a threshold gives predictable quality and uncertain reach."],
    p: ["A tiny seed audience yields a model that fits a few individuals and expands into noise.", "Seeds containing a protected trait produce an expanded audience that discriminates by proxy."],
    v: "Hold out a set of real customers from the seed and score them. Confirm they rank far above random users in the expanded audience, and compare conversion rate of the expanded audience with a random control.",
    dep: ["audience-segments", "event-log-storage"]
  },
  "deal-targeting": {
    s: "Rules for impressions sold under a negotiated deal: only requests tagged with the deal identifier are eligible, usually at an agreed price or with priority.",
    d: "A deal links a publisher, a buyer seat and terms such as price floor, audience, formats and volume. The request includes the deal identifiers the seat is eligible for, and the bidder matches campaigns attached to that deal, which may bid only on those requests or at a deal price. Deals give buyers inventory control and publishers price stability, but they are manual to set up, and many deals never receive enough traffic to spend.",
    k: ["Deal bids with priority vs open auction only: priority gives publishers guaranteed demand and can undercut better open prices; open auction maximizes price and gives buyers no guarantee.", "Fixed deal price vs floor with auction: fixed price is simple and may leave money; a floor lets competition set a higher price."],
    p: ["A deal identifier mis-typed at one end produces no matched requests and no error, only silence.", "A deal bidder that ignores the agreed audience spends on traffic the publisher never promised."],
    v: "Create a test deal, send a request containing its identifier and one without it. Confirm only the first reaches the deal's campaign, with the deal price applied, and the decision log records the deal identifier.",
    dep: ["private-marketplace-deals", "bid-request-schema", "campaign-index"]
  },
  "blocklists-and-allowlists": {
    s: "Lists of sites, apps, advertisers, categories or creatives that a buyer or seller refuses to appear on or with, or that are the only ones permitted.",
    d: "Buyers keep lists of domains and app identifiers they will not buy on and often a safer allowlist for sensitive campaigns. Sellers block advertisers and categories, such as gambling, for their pages. The exchange applies the sellers' lists, the bidder the buyers'. Lists reach tens of thousands of entries and are checked on every request, so they are held as hash sets and updated by delta. The challenge is maintaining accuracy: sites change owners, and a name on a list may map to many apps.",
    k: ["Blocklist vs allowlist: a blocklist keeps scale and lets unknown bad sites through; an allowlist is safe and shrinks reach and raises price.", "Matching exact domains vs matching registered domains and subdomains: exact is precise and misses variants; broader matching blocks more and catches innocent sites."],
    p: ["Matching on the claimed domain in the request lets spoofed traffic bypass the list.", "Lists synchronized only nightly keep serving on a site for hours after it was reported."],
    v: "Add a test domain and a test advertiser to the lists. Confirm requests from that domain get no bid from the buyer, and bids for that advertiser on the seller's pages are rejected, both within the stated update time.",
    dep: ["in-memory-config-cache", "domain-spoofing-detection"]
  },
  "budget-accounting": {
    s: "The running record of how much each campaign has spent and has left, updated as impressions are won and confirmed, and consulted before each bid.",
    d: "Spend is incremented when a bid wins or when its impression is confirmed. Many bidder instances across regions bid at once for the same budget, so a central exact balance would be too slow to check each bid. Instead each instance holds a local allowance and refreshes from a shared counter periodically. Estimates of in-flight wins that may not be billed help avoid overspending. The result is eventually consistent, and the permitted error is a business decision.",
    k: ["Exact central counter vs local allowances: central is exact and adds a network hop to every bid; local allowances are fast and can overspend by the allowance size.", "Count at win notice vs at impression: win notice is immediate and counts ads never shown; impression is accurate and arrives late, creating overspend risk."],
    p: ["Instances restarting lose their local allowance and either double spend it or leave budget unused.", "Currency conversion differences between bid and billing make accounts drift by small amounts that add up."],
    v: "Run a campaign with a small budget across several bidder instances under load. Confirm the total billed spend exceeds the budget by no more than the documented tolerance, and that the instances' own totals reconcile with the central one.",
    dep: ["distributed-counter-store", "overspend-protection"]
  },
  "pacing-controller": {
    s: "A feedback loop that adjusts how aggressively a campaign bids so its budget lasts the whole flight and delivery follows the planned curve.",
    d: "The controller compares actual spend with the target curve, which may follow expected traffic through the day, and changes a multiplier or a participation probability that the price model uses. It runs every few seconds or minutes, per campaign. Too weak a response causes overspend or underdelivery, too strong a response oscillates. It is hard because supply is not steady: traffic spikes at known times, and the cost of reaching users changes as competitors enter.",
    k: ["Adjusting probability of bidding vs adjusting the bid price: probability keeps prices stable and drops volume uniformly; price changes shift which impressions win and distort value.", "A fixed schedule vs one learned from past traffic: fixed is predictable and ignores real patterns; learned follows demand and can chase noise."],
    p: ["A controller that reacts to a stale spend figure overshoots and then undershoots repeatedly.", "A new campaign with no history spends its entire daily budget in the first minutes."],
    v: "Run a campaign for a full day against replayed traffic. Plot cumulative spend against the target curve and confirm it stays within the stated band, ending at the budget within tolerance and without oscillation.",
    dep: ["budget-accounting", "flight-scheduling", "bid-throttling"]
  },
  "bid-throttling": {
    s: "A control that randomly skips some bid opportunities for a campaign, so spend slows without changing the price offered for the impressions it does bid on.",
    d: "For each eligible request the bidder draws a random number and compares it with the campaign's current participation rate set by the pacing controller. If it exceeds the rate, no bid is sent. It is cheap and keeps the price logic untouched. Throttling by random sampling is fair across traffic, whereas a smarter selection would keep the best impressions. The limit is that a low rate also reduces learning data for that campaign.",
    k: ["Uniform random throttling vs value-based throttling: uniform is simple and unbiased and wastes valuable impressions; value-based keeps the best impressions and needs a trustworthy value estimate.", "Throttling before targeting vs after: before saves compute; after throttles only matching traffic and keeps the rate meaningful."],
    p: ["Throttling applied after the candidate list is built wastes the compute it was supposed to save.", "A rate near zero leaves too few outcomes for the model to learn, so the campaign never recovers."],
    v: "Set a campaign's participation rate to a fixed fraction and replay a large number of eligible requests. Confirm the share of bids sent matches the rate within the expected sampling error and is uniform across segments.",
    dep: ["pacing-controller"]
  },
  "flight-scheduling": {
    s: "Rules for when a campaign may run: start and end dates, days of the week, hours of the day in the user's time zone, and planned delivery curves.",
    d: "Each campaign has a flight window and optional dayparts. The bidder evaluates them against the current time, sometimes in the user's local time, derived from the request's location. Schedules interact with budgets: a campaign allowed only at lunchtime has to spend its day's budget in a few hours. Time zones, daylight saving changes and campaigns that end at midnight in different places make a simple-looking rule error-prone.",
    k: ["Evaluating in the advertiser's time zone vs the user's: advertiser time zone is simple and consistent; user time zone matches intent and requires a trustworthy location.", "Hard stop at the end time vs a short tail: hard stop is exact and cuts bids in flight; a tail avoids dropped impressions and slightly overruns the flight."],
    p: ["Daylight saving shifts make a daypart run an hour early or twice on the changeover day.", "A flight that ends in one time zone while still running in another produces disputed delivery."],
    v: "Schedule a campaign for a two-hour window in a stated time zone and replay traffic across the boundary. Confirm bids begin and stop at the exact local times, including on a daylight saving changeover date.",
    dep: ["campaign-management"]
  },
  "frequency-capping": {
    s: "Limits on how many times one user sees an ad, campaign or advertiser within a period, so budget is not wasted and users are not worn out by repeats.",
    d: "At bid time the bidder looks up how many times the matched user has been shown the campaign in the last day or week and skips the campaign if the cap is reached. Counts increment on win or on impression. Caps apply by user, household or device and at several levels, from creative to advertiser. Without a stable identifier, caps cannot be enforced across devices, and often they are enforced only within one browser or exchange.",
    k: ["Cap per device vs per person: per device is easy and over-serves people with several devices; per person needs an identity graph and privacy-sensitive matching.", "Counting wins vs counting impressions: wins are immediate and overcount ads that never rendered; impressions are accurate and lag, letting the cap be exceeded."],
    p: ["Counts updated asynchronously let a burst of simultaneous requests all pass the check and exceed the cap.", "Users without a recognized identifier are treated as new each time and receive unlimited ads."],
    v: "Set a cap of three per day for a test user and send ten requests quickly. Confirm no more than three impressions are counted, even under concurrency, and the cap resets at the correct time.",
    dep: ["frequency-counter-store", "id-mapping-tables", "win-and-impression-beacons"]
  },
  "frequency-counter-store": {
    s: "A very fast keyed store holding how many times each user has seen each campaign, read on nearly every bid and written on every win.",
    d: "Keys combine user identifier and campaign, values are counters with an expiry. The store sits in memory, sharded by user so the same user's data lands on the same node, and replicated or regional. Reads must finish in a fraction of a millisecond. Writes are batched or sent asynchronously. Because the key space is the number of users times campaigns, memory is the limit, so counters are compact and expire quickly, and some systems accept approximate counts.",
    k: ["A global store vs regional stores: global gives exact caps across the world and adds latency; regional is fast and lets a user be counted separately per region.", "Exact counters vs probabilistic sketches: exact counters are simple and use memory proportional to users; sketches save space and can over-count slightly."],
    p: ["A failed node loses counters for its shard and every user on it is treated as new.", "Hot keys for very popular campaigns overload one shard and slow all bids that touch it."],
    v: "Write and read counters for a large number of synthetic users while killing one node. Confirm read latency percentiles hold under the budget, and the documented fraction of counters lost on failover matches what you observe.",
    dep: ["distributed-counter-store", "in-memory-config-cache"]
  },
  "overspend-protection": {
    s: "Safeguards that stop a campaign from spending far beyond its budget when pacing fails, accounting lags or a configuration mistake makes it bid too much.",
    d: "Layers of limits cap spend per minute, per hour and per day, with a hard stop the pacing controller cannot override. Anomaly detectors watch for spend rates far above plan or bid prices far above normal. If protection triggers, the campaign is paused and an alert sent. The tradeoff is false positives: a legitimate surge in traffic looks like a runaway. Some overspend is unavoidable because of in-flight bids, and it is usually agreed in contracts as a tolerance.",
    k: ["Automatic pause vs alert only: automatic pause caps losses and can stop a good campaign mid-promotion; alerts keep control with humans and react slowly overnight.", "Limits per campaign vs per account: per campaign stops local errors; account limits catch many campaigns misbehaving together."],
    p: ["A limit that is only checked when pacing runs can be exceeded many times over during an outage of the controller.", "An overly sensitive detector pauses a campaign during a peak event the advertiser planned for."],
    v: "Deliberately set a test campaign's bid price a hundred times too high. Confirm spend stops at the configured hard limit within the stated delay, an alert fires and the campaign state shows the reason for the pause.",
    dep: ["budget-accounting", "latency-monitoring"]
  },
  "bid-request-schema": {
    s: "The standard structure of a bid request: the impression, the page or app, the device, the user, the seller and the auction rules, in a shared message format.",
    d: "A request is a JSON object with an identifier, one or more impression objects describing formats, sizes, floors and deals, a site or app object, a device object, a user object with identifiers and consent, and auction fields such as the auction type, timeout and blocked categories. Both sides parse the same field names, so a field added without agreement is ignored. Requests are a few kilobytes and arrive in huge numbers, so the format favors simplicity over strictness.",
    k: ["A loosely validated schema vs a strict one: loose accepts diverse publishers and lets malformed data through; strict keeps data clean and rejects some real traffic.", "Sending everything vs sending only what a buyer needs: everything gives buyers precise targeting and leaks data; minimal protects users and lowers bid values."],
    p: ["A field with different meanings across partners, such as a floor in different currencies, leads to mispriced bids.", "Required fields missing on some publishers make a share of requests unbiddable."],
    v: "Validate a sample of live requests against the schema and report violations per seller. Confirm required fields are present on all but a small stated share, and that no unknown top-level fields are being silently dropped.",
    dep: ["extension-fields", "transport-and-compression"]
  },
  "bid-response-schema": {
    s: "The standard structure of a bid response: the bids, each with a price, creative or its reference, the advertiser, and notices, grouped by seat.",
    d: "A response carries the request identifier, one or more seat bid objects, and in each a bid with an impression identifier, a price in a stated currency, markup or a creative address, a win notice address, advertiser domain, categories and creative attributes. The exchange matches bids to impressions by identifier and validates them. A no-bid is an empty response with a reason code. Compactness matters because responses are returned under tight time limits across many connections.",
    k: ["Returning markup in the response vs returning an address: markup avoids another fetch and bloats responses; an address keeps them small and delays display.", "Multiple bids per impression vs one: multiple lets the exchange choose among creatives or deals; one is simpler and shifts the choice onto the bidder."],
    p: ["A price in the wrong currency or unit is accepted as valid and clears at a wildly wrong value.", "Missing advertiser domain or category prevents the exchange from applying seller blocks, so bids are dropped."],
    v: "Send test requests to a bidder and validate each response against the schema. Confirm identifiers match, prices carry a currency, required fields are present, and every no-bid includes a reason code.",
    dep: ["bid-request-schema", "creative-markup-delivery"]
  },
  "extension-fields": {
    s: "Agreed-upon places in the request and response where partners can add custom data without breaking the shared format.",
    d: "Every major object has an extension slot for fields that are not in the standard. Exchanges use them for seller-specific data, buyers for private signals and cross-partner features before they become standard. They are the main way the format evolves, and as a result they accumulate undocumented meaning. Unknown extension fields are ignored by parsers that do not understand them, which keeps old partners working and hides when two partners disagree about a name.",
    k: ["Free-form extensions vs registered extensions: free-form is quick for partners and creates conflicts and hidden data flows; registration is slower and keeps meaning shared and auditable.", "Promoting popular extensions into the standard vs leaving them: promotion helps everyone and takes years; leaving them keeps flexibility and fragmentation."],
    p: ["Two partners using the same extension name for different things silently corrupt each other's logic.", "Extensions carrying personal data bypass the review applied to standard fields."],
    v: "List every extension key seen in a day of live traffic with its sender and a documented meaning. Any key without an owner or description is a finding, and none may contain identifiers outside consent rules.",
    dep: ["bid-request-schema", "data-minimization"]
  },
  "supply-chain-object": {
    s: "A record inside the request listing every party that handled the impression between publisher and exchange, so buyers can see the full path.",
    d: "Each node in the chain lists the seller's domain, identifier, whether it is the direct account holder or a reseller, and whether it has been paid or has direct authority. Every intermediary appends its own node before passing the request on. Buyers compare the chain against publisher-declared authorized sellers and drop requests with unknown or broken chains. Because each party writes its own entry, the chain is self-reported and only reliable where the authorization files can verify it.",
    k: ["Complete chain required vs incomplete accepted: required chains help buyers trust and drop legitimate traffic from careless partners; accepting incomplete chains keeps volume and weakens trust.", "Passing the chain through unchanged vs rebuilding it: passing preserves the path and exposes partner relationships; rebuilding hides them and breaks verification."],
    p: ["An intermediary that forgets to append itself produces a chain that looks shorter and more trustworthy than reality.", "Chains that were truncated for size are indistinguishable from fraudulent ones."],
    v: "Sample live requests and verify each chain's first node matches the publisher's authorization file and every hop is present. Report the share of requests with complete, verified chains by seller.",
    dep: ["seller-authorization-files", "bid-request-schema"]
  },
  "seller-authorization-files": {
    s: "Public files each publisher hosts on its own domain, listing which companies are allowed to sell its inventory and in what relationship.",
    d: "A plain text file at a fixed path on the publisher's domain lists authorized sellers by domain and account identifier, marked as direct or reseller. Buyers fetch and cache these files, then compare each request's seller to the list. A companion file for apps serves the same role. The scheme depends on the publisher's own domain and on honest maintenance, so lists get stale, include dead sellers, or are missing entirely.",
    k: ["Strict enforcement vs advisory use: strict enforcement removes most spoofed inventory and blocks honest sellers who are not listed; advisory use keeps reach and lets fraud continue.", "Fetch on demand vs scheduled crawl: on demand is current and cannot be done inside an auction; a scheduled crawl is fast and lags changes."],
    p: ["A publisher migration drops the file and all its inventory is marked unauthorized overnight.", "Lists that name hundreds of resellers authorize far more paths than the publisher actually uses."],
    v: "Crawl the files for a set of known publishers and compare them with the sellers appearing in live requests. Report listed sellers never seen, and requests whose seller is absent from the file.",
    dep: ["seller-file-crawler"]
  },
  "transport-and-compression": {
    s: "How requests and responses travel: HTTP with persistent connections, optional compression, and the encoding choices that keep them small and quick.",
    d: "Exchanges and bidders connect over HTTP with long-lived connections so they avoid repeated setup and encryption handshakes, and send many requests down the same connection. Bodies are compressed when large enough to benefit, and sometimes a binary encoding replaces text. Encryption is mandatory for user data. Every extra millisecond counts against the deadline, so connection reuse, multiplexing and keeping packets small matter more than the format of any field.",
    k: ["Compressed requests vs uncompressed: compression saves bandwidth between regions and costs CPU and latency per request; uncompressed is fast inside a data center.", "Binary encoding vs text: binary is smaller and faster to parse; text is debuggable and universally supported."],
    p: ["Connections closed idle by a load balancer cause the next request to pay a full connection setup and miss the deadline.", "Compression enabled on tiny responses increases CPU use and gives no savings."],
    v: "Capture traffic between an exchange and a bidder for ten minutes. Confirm connections are reused for thousands of requests each, handshake time is a negligible share of requests and no request fails due to encoding.",
    dep: ["connection-management"]
  },
  "no-bid-signaling": {
    s: "The explicit, fast answer a bidder returns when it will not bid, with an optional reason code that tells the exchange why.",
    d: "An empty response with a status or a no-bid reason lets the exchange stop waiting for that bidder and learn about the traffic. Reasons include unknown user, blocked domain, invalid request and technical error. Exchanges use them to adapt: stop sending a bidder traffic it never wants and fix malformed requests. Since most requests end in no-bid, answering quickly is as important as bidding, and silent timeouts are costly to everyone.",
    k: ["Detailed reason codes vs a bare empty response: reasons help the exchange fix problems and tune traffic; bare responses are smallest and reveal nothing about buyer strategy.", "Answer immediately vs wait for the deadline: answering at once frees exchange resources; waiting wastes them and hides the real no-bid rate."],
    p: ["A bidder that times out instead of declining is counted as a failure and loses traffic share.", "Reason codes used inconsistently make the exchange's tuning decisions meaningless."],
    v: "Send requests the bidder should decline for each documented reason. Confirm each gets a response in a few milliseconds with the matching code, and the exchange's per-reason counts equal the bidder's own log.",
    dep: ["bid-response-schema", "request-filtering"]
  },
});
