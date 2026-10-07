// Details for the ad exchange plate, part 1: supply, rendering and verification, bidders.
ATLAS.details("ad-exchange", {
  "ad-request-trigger": {
    s: "The event on a page, app or connected device that decides an ad slot is about to be shown and starts the chain of calls that ends in an auction.",
    d: "On a web page a script runs when a slot nears the viewport or the page loads; in an app a software kit asks when a screen opens or a video break begins. The trigger gathers page address, slot sizes, device and user signals and the consent string, then sends them to a wrapper, an ad server or an exchange. Timing is the hard part: asking too early wastes auctions on slots never seen, asking too late leaves a blank space the user sees.",
    k: ["Request at page load vs request near the viewport: load-time requests fill slots quickly but pay for impressions never seen; lazy requests raise viewability but risk empty space on fast scrolling.", "Refreshing a slot on a timer vs once per view: refresh adds supply and revenue but lowers attention per ad and invites buyer complaints about inflated counts."],
    p: ["Duplicate triggers from single-page navigation or retries create two requests for one view and inflate impression counts.", "A trigger that waits for a slow consent dialog delays every request on the page and shows blank slots."],
    v: "Load a test page with a slot below the fold and capture network traffic. Confirm no request is sent until the slot nears the viewport, then exactly one request leaves with size, page address and consent fields populated.",
    dep: ["ad-slot-definitions", "consent-string"]
  },
  "ad-slot-definitions": {
    s: "The publisher's declared list of places that can show an ad, each with sizes, formats, position, allowed media types and the identifier buyers use to price it.",
    d: "Each slot has a stable identifier, accepted sizes and formats, a position on the page, a media type such as display, video or native, and optional targeting keys the publisher supplies. The definitions are read by the trigger, copied into the bid request and used by the exchange to apply floors and deals. They are hard because they drift: layout changes alter sizes and positions, while buyers have learned prices for the old identifiers.",
    k: ["Few coarse slots vs many fine slots: coarse slots give buyers a stable price history, fine slots expose real differences in value but fragment learning and reporting.", "Declared position vs measured position: declared values are cheap and available at request time, measured values are truthful but arrive only after rendering."],
    p: ["A layout change that moves a prominent slot to the footer while keeping its identifier makes buyers overpay and then cut spend.", "Publishers mislabeling a below-the-fold slot as above the fold earns short-term revenue and long-term blocking."],
    v: "Compare the slot list in the page configuration with the slot objects in captured bid requests. Every slot must appear once with matching sizes and identifier, and a deliberately removed slot must disappear from requests.",
    dep: []
  },
  "header-bidding-wrapper": {
    s: "Page-side code that sends the same impression to many exchanges at once, collects their bids in the browser and passes the best one to the publisher's ad server.",
    d: "The wrapper runs in the page, calls several demand partners in parallel through browser requests, waits for a deadline, and records each bid and its price. The highest bids become key-values that tell the ad server what the open market offers, so the ad server can compare that figure with its own direct deals. It adds latency to the page, so deadlines are short and a late bid is discarded. Its tradeoff is fairness for sellers against page weight and slower loading.",
    k: ["Client-side bidding vs server-side bidding: client-side lets partners see cookies and match users well; server-side cuts page weight and requests but lowers match rates.", "Long wrapper timeout vs short: more bids arrive and prices rise, but the page shows ads later and users leave."],
    p: ["Too many partners saturate the browser's connection limit, so the later calls start after the deadline already passed.", "Bid values rounded into coarse price buckets let the ad server pick a direct deal that is actually worth less than the open bid."],
    v: "Load a page with a throttled network. Confirm each partner call is logged with a start time, a response time and a result, that bids after the deadline are marked late, and that the ad server request carries the winning price key.",
    dep: ["ad-request-trigger", "publisher-ad-server-link", "timeout-management"]
  },
  "publisher-ad-server-link": {
    s: "The connection between the publisher's own ad server, which holds direct campaigns, and the open market, deciding whether a direct or auction buyer gets each impression.",
    d: "The publisher's ad server receives the slot request together with header bidding prices or a call to an exchange. It ranks guaranteed campaigns, deals and open auction demand by priority and price, then returns either a direct creative or a pointer to the exchange winner. Delivery of guaranteed campaigns has priority, so the open market sees only what is left. The hard part is comparing prices that mean different things: a net cost, a gross price, and a campaign promised at a fixed rate.",
    k: ["Ad server decides last vs exchange decides last: ad-server-last protects guaranteed contracts, exchange-last lets open demand outbid them when it pays more.", "Price buckets passed as keys vs a direct auction call: keys are simple to integrate but lose precision; a direct call keeps exact prices but adds a network hop."],
    p: ["Gross and net prices compared directly make the ad server favor the wrong source by the revenue share.", "A direct campaign with a stale priority crowds out higher-paying auction demand all month."],
    v: "Send test requests with an auction bid above and below a guaranteed campaign's price. Confirm the response follows the configured priority and the logged decision shows both prices and which rule chose the winner.",
    dep: ["header-bidding-wrapper", "ad-slot-definitions", "auction-orchestrator"]
  },
  "server-side-stitching": {
    s: "Combining ad content with video or audio on the server so the ad appears as part of the stream, with the auction run on the server instead of the player.",
    d: "For connected-television and audio streams, a server receives the viewer's playback request, runs auctions for each ad break, fetches the winning creatives and splices them into the stream's manifest or segments. The player sees one continuous stream, which defeats ad blockers and avoids player-side latency. Because the server, not the device, makes the request, device and user signals must be forwarded, and beacons must be fired on the viewer's behalf from the server.",
    k: ["Stitching on the server vs inserting on the player: server stitching survives blockers and works on constrained devices but loses direct device signals; player insertion is richer but breakable.", "One auction per break vs one per slot: per-break is cheaper and consistent in pod ordering, per-slot gets higher prices but takes longer and risks gaps."],
    p: ["Server-fired beacons all share the stitching server's address, which looks like one heavy bot to fraud filters.", "A late auction leaves a break unfilled, so the stream plays dead air or a house ad."],
    v: "Request a stream with two ad breaks from a test client. Confirm the manifest returned contains creative segments for each break, and the beacon log shows start and quartile events fired once per creative.",
    dep: ["auction-orchestrator", "creative-markup-delivery", "win-and-impression-beacons"]
  },
  "supply-path-routing": {
    s: "The logic that decides which exchanges and intermediaries may carry a request from a publisher to buyers, and how many hops are allowed between them.",
    d: "A request can reach buyers directly from a publisher or through resellers, networks and other exchanges. Routing rules choose which paths are allowed, using seller identifiers, authorization files and past performance. Each hop takes a fee and adds latency and a chance to alter or duplicate the request, so buyers increasingly prefer short paths. The exchange has to compete for each request while staying on paths buyers will accept.",
    k: ["Direct publisher integration vs reseller paths: direct paths give buyers trust and lower fees but need contracts per publisher; resellers give reach with less transparency.", "Allowing many hops vs capping them: many hops reach more supply but multiply fees and duplicate requests, a cap loses some inventory."],
    p: ["The same impression arriving through three paths makes a bidder bid against itself and raises its own price.", "Unlisted resellers who add themselves get filtered silently, so volume falls with no visible error."],
    v: "Take a sample of live requests and list the chain in each. Confirm every hop is in the authorized seller list, none exceeds the hop cap, and duplicates of one impression are counted and reported.",
    dep: ["supply-chain-object", "seller-authorization-files"]
  },
  "inventory-classification": {
    s: "Labels attached to each impression describing the content, category, language and quality of the page or app, so buyers can match campaigns to context.",
    d: "A crawler or classifier visits the page or app listing, extracts text, categories and metadata, and assigns standard category codes and sometimes a quality or safety rating. The labels are cached by page address and attached to requests, so classification never runs in the auction path. Hard problems are freshness, because pages change after crawling, and scale: pages that require login, are dynamically generated or are new may have no label when the request arrives.",
    k: ["Publisher-declared categories vs crawled categories: declared labels are free and instant but can be wrong or self-serving; crawled labels are independent but lag behind page changes.", "Page-level labels vs site-level labels: page-level is precise and costly to keep fresh, site-level is cheap and wrong for mixed-content sites."],
    p: ["An unclassified page defaults to a permissive label and then serves an ad next to unsuitable content.", "A cached label survives long after a page's topic changed, so contextual targeting matches the old topic."],
    v: "Request ten known pages, five of them just edited. Confirm each request carries a category and an age for it, and the edited pages get a refreshed label within the stated recrawl interval.",
    dep: ["brand-safety-classification", "in-memory-config-cache"]
  },
  "creative-markup-delivery": {
    s: "How the winning ad's code or media reaches the page: inline markup in the bid response, a URL to fetch, or a reference resolved later by the ad server.",
    d: "A bid response contains either markup, such as HTML or a video document, or a URL pointing to it, plus a notice address for the win. The exchange passes it to the publisher's ad server, which places it in the slot's frame. Markup that is inline saves a fetch but makes responses large; a URL keeps responses small but adds a fetch after the auction closes. Macros in the markup, such as the clearing price, are replaced at the last moment so the creative can report what was paid.",
    k: ["Inline markup vs fetched markup: inline is faster to show and cheaper to cache, fetched keeps bid responses small and lets the buyer change the creative late.", "Substituting macros at the exchange vs at the render frame: exchange substitution is controllable and auditable, render-frame substitution is flexible and exposes prices to the page."],
    p: ["A macro never substituted leaves a literal placeholder in beacons, so the buyer's reports show no price.", "Large inline creatives push the response past the deadline or past the size limit the exchange enforces."],
    v: "Win a test auction with each delivery mode. Confirm the page shows the creative, the price macro in the beacon equals the clearing price in the auction log, and fetched creatives load within the render time limit.",
    dep: ["bid-response-schema", "sandboxed-render-frame", "format-and-size-negotiation"]
  },
  "sandboxed-render-frame": {
    s: "An isolated frame in which the ad runs, with limited access to the host page, so a malicious or buggy creative cannot read the page or redirect the user.",
    d: "The creative renders in a nested frame with browser sandbox restrictions: no navigation of the top page without user action, no access to the parent's data, and limited permissions for popups, storage and scripts. Communication with the page is through a narrow message channel used for resizing, viewability and expansion. Strict sandboxing breaks legitimate features, such as expanding ads, so the permissions are a policy decision, and exceptions for trusted buyers tend to accumulate.",
    k: ["Strict sandbox vs permissive sandbox: strict blocks hijacking and data leaks but breaks rich formats and some measurement; permissive supports more formats and exposes the page.", "Frame-per-ad vs shared frame: a frame per ad gives isolation and clean teardown but costs memory on pages with many slots."],
    p: ["A creative that navigates the top page after a delay ignores a sandbox that only blocked immediate redirects.", "Allowing popups for one buyer's rich ad lets that permission be reused by anything arriving under the same seat."],
    v: "Serve a test creative that tries to read the parent's cookie, redirect the page and open a popup. Confirm all three fail with browser errors and the page's own scripts continue unaffected.",
    dep: ["creative-markup-delivery"]
  },
  "creative-registry": {
    s: "The store of every creative a buyer has submitted, with its approval state, attributes and the categories and advertiser it belongs to, checked before a bid can win.",
    d: "Buyers register creatives or declare their attributes in each bid; the registry assigns an identifier, records advertiser domain, category, format and approval status, and links to scan results. At auction time the exchange looks up the creative's status and drops bids for unapproved or blocked ones. Pre-approval makes auctions fast but delays campaign launch; approving at bid time is flexible and slower. The hard part is keeping the registry consistent as buyers change creative code that was already approved.",
    k: ["Pre-approval of creatives vs approval on first bid: pre-approval keeps unsafe ads out entirely but slows launches; first-bid approval is fast to launch and exposes the first impressions to risk.", "Registry keyed by creative identifier vs by content hash: identifiers are simple and let buyers swap content silently, hashes catch changes and force re-review."],
    p: ["An approved creative later updated by its host serves content that was never reviewed.", "A registry outage defaults to allowing all bids, so unreviewed ads go live."],
    v: "Submit a test creative, approve it, then change its content hash. Confirm bids with the old identifier are rejected or re-queued for review and the rejection reason is logged against the bid.",
    dep: ["creative-scanning", "bid-validation"]
  },
  "creative-scanning": {
    s: "Automated inspection of a creative's code, media and destinations for malware, forced redirects, disallowed content and policy violations before and after it serves.",
    d: "A scanner loads the creative in a controlled browser, records requests, redirects, scripts and rendered content, and runs signatures and classifiers over them. It checks landing pages and tracks changes over time, because a creative's destination can be switched after approval. Scans are expensive and slow, so they run outside the auction, and the exchange uses the result as a flag. The difficulty is evasion: malicious creatives detect scanners and behave well only for them.",
    k: ["Scan before serving vs sample after serving: pre-scan blocks known bad ads but misses time-delayed ones; post-scan catches evasion and exposes some users first.", "Fixed scanner network addresses vs rotating ones: fixed addresses are easy to maintain and easy for attackers to recognize and avoid."],
    p: ["A creative that checks for a scanner's browser properties passes review and attacks real users.", "Scanning only the creative and not the landing page misses a redirect the buyer switched on after approval."],
    v: "Submit a known test creative that redirects after five seconds and one that detects automation. Confirm the scanner flags the first and that a rescan from a different environment catches the second.",
    dep: ["sandboxed-render-frame"]
  },
  "format-and-size-negotiation": {
    s: "Matching what a slot can display with what a bid offers, so the creative's size, media type, duration and technical features fit the slot and the device.",
    d: "The request lists accepted sizes, formats, mime types, maximum durations, playback methods and technical features such as supported scripting. Bidders must respond with a creative that fits; the exchange verifies the declared size and type against the slot. Video adds more parameters, such as skippable or not and pod positions. Mismatches are common and cause blank ads, so exchanges reject non-conforming bids before the winner is chosen, not after.",
    k: ["Enforcing the match at the exchange vs at the ad server: the exchange rejects early and keeps auctions honest; the ad server sees real inventory but finds problems after the auction.", "Exact size match vs flexible sizing: exact is safe and loses fill; flexible sizing fills more slots and can break page layout."],
    p: ["A bidder returning a larger creative than the slot accepts wins and then displays clipped or hidden.", "Declared duration differing from actual media length causes a video pod to overflow its break."],
    v: "Send bids with one matching creative and several wrong ones, such as wrong size, type and over-long video. Confirm only the matching bid is eligible and each rejection carries a reason code.",
    dep: ["bid-request-schema", "bid-validation"]
  },
  "win-and-impression-beacons": {
    s: "Small requests fired when an auction is won, when the creative loads and when it is seen, giving each side its own record of what happened.",
    d: "A win notice goes to the bidder when its bid clears, an impression pixel fires when the creative is rendered, and extra beacons fire for views, clicks and video quartiles. Each is an HTTP request to a collection endpoint, usually carrying an auction identifier and a price. Beacons can be lost, repeated or blocked, so the counts of different parties diverge. A win is not an impression: many winning creatives never load.",
    k: ["Firing the impression beacon at load vs at first render: load is early and inflated, render is accurate and misses ads that crash before painting.", "Server-fired win notice vs client-fired: server-fired is reliable and cannot be blocked but proves nothing about display; client-fired proves display and is lossy."],
    p: ["A beacon retried after a timeout counts twice, unless the collector deduplicates by auction identifier.", "A bidder charging on the win notice rather than the impression pays for ads never shown."],
    v: "Run a test auction and trace beacons. Confirm one win notice, one impression and the expected quartile events, each carrying the same auction identifier, and that replaying one is counted once downstream.",
    dep: ["creative-markup-delivery", "event-collection"]
  },
  "viewability-measurement": {
    s: "Measurement of whether an ad was actually on screen for long enough, usually the share of pixels visible for a minimum time, reported by a script in the page.",
    d: "A measurement script observes the ad's frame with the browser's intersection support, accumulating the time that a minimum share of pixels is in view while the tab is active. Standard thresholds exist for display and video. It reports a viewable or not result and sometimes a duration. Cross-origin frames, background tabs and occlusion by other elements make it hard to be exact, and many apps need a separate measurement kit. Buyers use the result to price and to pay only for viewable impressions.",
    k: ["Browser visibility APIs vs geometry polling: visibility APIs are accurate and cheap in modern browsers; polling works in old environments and burns CPU and misses fast scrolls.", "Measuring in the creative vs in the page: in the creative works anywhere but can be forged by the seller of the creative; in the page is independent and needs publisher integration."],
    p: ["An ad hidden under another element is reported as viewable because the script measured only scroll position.", "Different vendors report different viewable rates for the same impression, which then drives billing disputes."],
    v: "Place a test ad half scrolled out of view for two seconds, fully visible for one and then in a background tab. Confirm the measurement reports the exact visible time and flags the background period as not viewable.",
    dep: ["sandboxed-render-frame", "win-and-impression-beacons"]
  },
  "bidder-endpoint": {
    s: "The network service on a buyer's side that receives bid requests from exchanges, parses them, and returns a bid or a no-bid within a few tens of milliseconds.",
    d: "An HTTP server per region accepts a continuous stream of requests, validates them, runs filtering, lookup and pricing, and answers inside the exchange's deadline. Most requests get no bid. The endpoint must shed load gracefully, because the exchange sends traffic the bidder cannot afford to evaluate. It is hard to build because tail latency matters more than average: a response that arrives after the deadline is wasted work and a lost chance.",
    k: ["Keeping all data in memory vs fetching per request: memory is fast and limits campaign and audience size per host; fetching scales data and spends the latency budget.", "Answering every request vs shedding early: answering maximizes bids and risks overload and late responses; early shedding protects latency and drops some valuable requests."],
    p: ["Garbage collection or compaction pauses delay a slice of responses beyond the deadline at exactly the busiest moment.", "A slow dependency not wrapped in a timeout stalls worker threads until the whole endpoint stops responding."],
    v: "Replay recorded production-like traffic at peak rate and inspect response latency percentiles. The ninety-ninth percentile must sit under the exchange's timeout with the no-bid rate within its expected range.",
    dep: ["request-filtering", "campaign-index", "connection-management", "low-latency-runtime"]
  },
  "request-filtering": {
    s: "Early rejection of bid requests a buyer will not bid on, and control of how many requests per second it accepts from each source.",
    d: "Rules drop requests by seller, country, device, category, consent, format or past performance before any expensive work. QPS shaping decides which share of an exchange's traffic to accept, often by sampling or by prioritizing sources with high win rates or conversion. Because the exchange sends many more requests than any bidder wants, filtering is the main way to keep costs down. The hard part is not discarding good traffic: a filter that looks only at last week's performance cannot see a new valuable source.",
    k: ["Filtering at the network edge vs inside the application: edge filtering saves the most compute but cannot use rich data; application filtering is precise and spends the work already.", "Static allowlists vs learned scoring: allowlists are transparent and slow to adapt, learned scoring adapts and is harder to audit."],
    p: ["A new seller starts with zero history and is filtered out forever, so it never earns any.", "Over-aggressive sampling of a source removes the very requests that would have won."],
    v: "Log accepted and rejected requests per source for one hour. Confirm the accepted rate matches each source's configured limit and rejected requests carry a reason, with no source rejected by default rule only.",
    dep: ["bid-request-schema", "consent-enforcement", "blocklists-and-allowlists"]
  },
  "campaign-index": {
    s: "An in-memory structure that finds, for a given request, the few campaigns whose targeting rules it satisfies out of thousands.",
    d: "Campaigns are indexed by targeting attributes such as geography, device, category, audience and size, so a request looks up candidates by intersecting posting lists rather than testing each campaign in turn. The remaining candidates get exact rule checks, budget and frequency checks. The index is rebuilt or patched when campaigns change, and swapped atomically. It is hard because rules are boolean expressions with exclusions, and an index that is fast for common requests can degrade badly on unusual ones.",
    k: ["Inverted index over attributes vs scanning campaigns: the index finds matches in microseconds at the cost of memory and rebuild complexity; scanning is simple and does not scale past a few hundred campaigns.", "Incremental updates vs full rebuild and swap: incremental is fresh and risks inconsistent partial states; a swap is consistent and can lag by minutes."],
    p: ["A negative rule such as exclude-this-site is dropped by the index and the campaign serves where it should not.", "A rebuild during peak traffic pauses lookups and causes a burst of late responses."],
    v: "For a set of known requests, compare the index's candidate list against a brute-force evaluation of every campaign. The lists must be identical, and a campaign paused a moment earlier must vanish within the stated refresh time.",
    dep: ["audience-segments", "geo-targeting", "in-memory-config-cache"]
  },
  "campaign-management": {
    s: "The buyer's system where campaigns, budgets, targeting, creatives and bidding strategies are defined and edited, and from which the bidders are configured.",
    d: "Advertisers or agencies create campaigns with budgets, flight dates, targeting, creatives and goals through an interface or interface calls. Changes go through validation and are published to the bidders' configuration. The system also shows spend and results. It is hard because humans set rules that conflict with each other, and because a change must reach hundreds of bidders quickly without ever producing an invalid or half-applied state.",
    k: ["Validate at save time vs at serve time: save-time validation catches mistakes while the user is present; serve-time checks are needed anyway because data changes underneath.", "Immediate propagation vs batched publishing: immediate gives control over runaway spend, batched gives consistency and a delay when a budget must stop."],
    p: ["A budget entered in thousands rather than units overspends a thousand times faster than intended.", "Two edits made at once by different users overwrite each other without notice."],
    v: "Edit a campaign's budget and targeting, then watch a bidder's loaded configuration. The new values must appear within the stated delay, an invalid edit must be rejected with a message, and the change must be recorded with its author.",
    dep: ["config-distribution", "seats-and-buyer-accounts"]
  },
  "seats-and-buyer-accounts": {
    s: "The identities a buyer uses at an exchange: accounts, seats per advertiser or agency, and the permissions, credit and settings attached to each.",
    d: "An exchange registers each bidder and gives seat identifiers inside it, one per advertiser or agency. Seats carry rules: allowed formats, blocked categories, price limits, credit terms and which supply they may see. Bids and spend are attributed by seat for reporting and billing. It is hard because the same company can hold many seats, and because rules set at the account level must be enforced on every bid without a slow lookup.",
    k: ["Seat per advertiser vs seat per agency: per advertiser gives precise reporting and rules but multiplies setup; per agency is simple and hides who is really buying.", "Prepaid credit vs invoiced credit: prepaid limits the exchange's risk and ties up buyer cash; invoicing is flexible and exposes the exchange to non-payment."],
    p: ["A bid with a seat identifier that no longer exists wins and then cannot be billed.", "Credit limits checked once a day let a bidder spend far beyond them within hours."],
    v: "Suspend a test seat and send bids from it. Confirm bids are rejected within the stated propagation time, rejections name the seat, and spend already incurred still appears in the seat's billing record.",
    dep: ["bid-validation", "billing-and-invoicing"]
  },
  "response-prediction": {
    s: "Models that estimate the chance an impression will be clicked or lead to a conversion, so the bidder can value it before paying for it.",
    d: "A model takes features of the request, user, page, creative and time and returns probabilities, usually a click rate and a conversion rate. They are trained on logged outcomes, so the training data contains only impressions that were won. Predictions must be calibrated, meaning that a stated five percent should be close to five percent in practice, because the price is derived from them. Scoring happens in microseconds, so the models are small or precomputed. Delayed and sparse conversions make training hard.",
    k: ["Simple linear model on hashed features vs deep model: linear is fast, cheap and easy to calibrate; deep models capture interactions and need more serving cost and care.", "Training on won impressions only vs including exploration traffic: only wins is cheap and biased; exploration costs some spend and removes selection bias."],
    p: ["A model not recalibrated after a floor change systematically over- or underestimates and shifts every bid.", "Conversions that arrive days later are counted as negatives when training runs too soon."],
    v: "Bucket held-out impressions by predicted rate and compare each bucket's predicted and observed rates. They must agree within the stated tolerance for every bucket, including the high-value ones.",
    dep: ["audience-segments", "event-log-storage", "stream-processing"]
  },
  "bid-price-model": {
    s: "The calculation that turns an impression's estimated value, a campaign's goal and its pacing state into a single price to offer.",
    d: "The bidder multiplies predicted response by the value of that action, applies the campaign's target such as a cost per action, then adjusts for pacing, floors, and the likely clearing price. In a first-price auction it also shades the bid below its true value. Output is a price in the exchange's currency, capped by campaign limits. It is hard because the value of an impression is uncertain and the price must also serve strategy: reaching delivery goals within budget and not simply the highest immediate profit.",
    k: ["Bidding true value vs shaded value: true value is simple and optimal in second-price markets; shading is required to avoid overpaying in first-price markets.", "Per-impression optimization vs campaign-level control: per-impression chases each bargain, campaign-level control sets a base bid and lets pacing correct it."],
    p: ["Using the advertiser's maximum price as the bid in a first-price auction pays the maximum every time.", "Ignoring the exchange's floor produces bids that are valid and always rejected."],
    v: "Feed a fixed set of impressions with known predictions and goals through the model. Confirm each output equals the hand-computed value, never exceeds the campaign cap, and drops when pacing says delivery is ahead of plan.",
    dep: ["response-prediction", "pacing-controller", "bid-landscape-learning", "bid-shading"]
  },
  "creative-selection": {
    s: "Choosing which approved creative of the winning campaign to send with a bid, based on size, format, language, past performance and rotation rules.",
    d: "A campaign usually has several creatives. The bidder filters them by size, format, categories the seller allows and any attributes the seller blocks, then ranks the rest by expected performance or by a testing schedule, and returns one. Dynamic creatives are assembled from product feeds at this step. It is hard to balance learning against performance: a creative with no history needs impressions to be evaluated, and a creative that fails eligibility wastes the whole bid.",
    k: ["Always pick the best performer vs explore alternatives: best performer maximizes now; exploration finds better creatives later at a visible cost.", "Assembling dynamic creatives at bid time vs pre-rendering: bid time uses current stock and prices; pre-rendering is faster and may advertise something out of stock."],
    p: ["Choosing a creative the seller has blocked by category makes a correct bid worthless.", "A product feed that is hours stale advertises sold-out items to users who then bounce."],
    v: "Send requests with each combination of size and blocked attribute. Confirm the returned creative always fits and carries no blocked attribute, and that two creatives with equal scores rotate in the expected proportion.",
    dep: ["creative-registry", "format-and-size-negotiation", "response-prediction"]
  },
  "bid-landscape-learning": {
    s: "Estimating from past auctions what price is needed to win a given kind of impression, so bids are set at the lowest price likely to succeed.",
    d: "The bidder logs each request it bid on, its price and whether it won, and in first-price markets sometimes the winning price. From these it fits a win-rate curve per segment of traffic. The curve says how much win probability each extra cent buys. It feeds shading and pacing. Censoring is the obstacle: when a bid loses, the bidder only knows the winning price was higher, and when exchanges hide it, learning is slow and biased.",
    k: ["Learning from the winning price when published vs from win-lose outcomes only: published prices make fitting direct and exact; win-lose requires censored-data methods and more traffic.", "Fine segments vs coarse segments: fine segments fit local markets and are noisy, coarse segments are stable and hide differences."],
    p: ["A curve trained before an exchange switched auction types keeps recommending the old price level.", "Segments with few observations produce extreme estimates and wild bids."],
    v: "Choose a segment and bid at ten price levels in an experiment. Confirm observed win rates follow the fitted curve within the confidence interval at each level, and the fit updates after a deliberate market change.",
    dep: ["auction-decision-log", "event-log-storage", "stream-processing"]
  },
});
