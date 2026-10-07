// Details for the map rendering & routing plate, part 1: clients, public APIs, geocoding.
ATLAS.details("map-routing", {
  "web-map-widget": {
    s: "A browser component that shows a pannable, zoomable map by fetching tiles and drawing them to a canvas or into image elements, with a small API for the host page.",
    d: "The widget owns a viewport, a style and a set of sources. On every camera change it computes which tiles cover the view, requests missing ones, decodes them off the main thread and redraws. Raster mode lays images in the page; vector mode draws with the graphics hardware. It exposes events and methods so host pages can add layers, markers and handlers. It is hard because page weight, input handling on touch screens and memory growth during long sessions all compete with smooth frame rates.",
    k: ["Vector drawing in the client vs prebuilt raster images: smooth zoom, rotation and restyling at the cost of heavier code and a need for graphics hardware.", "Rendering to a single canvas vs composing DOM elements: the canvas is faster for thousands of features, but loses accessibility and native browser behavior."],
    p: ["Decoding tiles on the main thread freezes scrolling on mid-range phones.", "Never releasing tiles or textures for areas panned away from leaks memory until the tab crashes."],
    v: "Pan and zoom across three zoom levels on a mid-range phone with throttled network and confirm frames stay smooth, no blank squares persist after loading, and memory is flat after one hundred pans.",
    dep: ["camera-and-gestures", "client-tile-cache", "gpu-vector-renderer", "tile-endpoint"]
  },
  "native-map-sdk": {
    s: "A library embedded in mobile and desktop apps that draws maps with the platform's graphics stack and exposes camera, layers, location and routing to app code.",
    d: "The SDK wraps the same core as the web widget but integrates with platform lifecycle, touch input, power management and permission prompts. It manages a shared tile cache on disk, background downloads and style updates. Apps hold a view object and call into layers, annotations and callbacks. It is hard because each platform has its own graphics API, threading rules and release cadence, and apps often ship an old SDK version for years that must still talk to the current services.",
    k: ["One shared core with thin platform shells vs separate native implementations: consistent behavior and one bug set, at the cost of an awkward fit with each platform's idioms.", "Frequent SDK releases vs long-term API stability: new features arrive sooner, but app developers must keep upgrading to avoid breakage."],
    p: ["Old SDK versions in the field fetch tile formats or styles the service wants to retire, forcing it to maintain them indefinitely.", "Continuous location updates with the screen on drain the battery faster than the app's own features justify."],
    v: "Install the oldest supported SDK build and the newest on test devices, load the same region, and confirm both render the current style without errors and the older one does not request deprecated endpoints.",
    dep: ["camera-and-gestures", "client-tile-cache", "gpu-vector-renderer", "user-location-display"]
  },
  "camera-and-gestures": {
    s: "Translates touch, mouse and keyboard input into camera changes: center, zoom, rotation and tilt, with inertia, snapping and animated transitions.",
    d: "Gestures such as drag, pinch, double tap and two-finger tilt are recognized, disambiguated and converted into incremental changes of the camera. The camera state drives which tiles are needed and where each is drawn. Programmatic moves such as fit-to-bounds and fly-to use eased animations that interpolate center and zoom together so the path looks natural. It is hard because gestures conflict with page scrolling, with each other, and with accessibility tools, and small differences in inertia feel wrong immediately.",
    k: ["Zooming around the pinch point vs around the screen center: the first feels direct, but it requires combining zoom and pan math carefully at every frame.", "Animating with a fixed duration vs a speed that scales with distance: fixed is predictable, but long jumps then look frantic and short ones look slow."],
    p: ["A map embedded in a scrolling page captures the scroll gesture and traps the user.", "Fly-to animations that cross the antimeridian spin the long way around the world."],
    v: "Pinch on a specific street corner at three zoom levels and confirm that corner stays under the fingers. Fit a route across the antimeridian and confirm the camera takes the short way.",
    dep: ["client-tile-cache"]
  },
  "client-tile-cache": {
    s: "Keeps recently used tiles in memory and on disk, decides which to evict, and deduplicates in-flight requests so panning does not refetch what is already known.",
    d: "A memory tier holds decoded tiles ready to draw; a disk tier holds compressed tiles across sessions. Requests for the same tile from several layers are merged, and lower-zoom tiles are drawn scaled in place while the proper one loads, so the map is never blank. Entries respect server freshness headers but also have a client budget. The hard part is eviction that matches how people move: keep neighbors and parent zooms, drop the far past, and cap storage without surprising the user.",
    k: ["Showing a scaled parent tile while loading vs leaving a gap: avoids blank squares, but briefly shows blurry content that may disagree with the final tile.", "Large disk cache vs small: fewer network requests and faster revisits, but it consumes user storage and can show stale tiles after data updates."],
    p: ["Ignoring the server's cache lifetime keeps showing tiles from before a road change for weeks.", "Unbounded disk cache grows to gigabytes and gets the app flagged for storage use."],
    v: "Load a city, go offline, pan within the area already viewed and confirm no blank squares appear. Then trigger a data update and confirm changed tiles replace the cached copies within the freshness window.",
    dep: ["tile-endpoint", "vector-tile-encoding"]
  },
  "overlay-and-marker-layer": {
    s: "Draws app-supplied data on top of the base map: markers, clusters, lines, polygons, heat layers and popups, kept in sync with the camera.",
    d: "The application supplies features as data sources and attaches layers with their own styles. The layer system sorts them into the same draw order as base layers, so a marker can sit under labels or above them. Dense point sets are clustered by zoom; hit testing maps a tap to a feature. It is hard because thousands of overlay features must stay interactive, because overlays need to avoid colliding with base labels, and because custom data should not need rebuilding tiles server side.",
    k: ["Client-side clustering vs server-side clustering: client-side is immediate and works offline, but it cannot handle millions of points that never fit in memory.", "Overlays as part of the style vs separate drawing code: sharing the pipeline keeps ordering and performance consistent, but limits what exotic overlays can do."],
    p: ["Ten thousand DOM markers on a web page make panning unusable.", "Overlay layers with no explicit ordering end up under the base map's fills and appear to vanish."],
    v: "Add fifty thousand points as a source, zoom through all levels and confirm clusters split and merge cleanly, taps return the right feature, and the frame rate stays interactive.",
    dep: ["style-specification", "gpu-vector-renderer"]
  },
  "route-line-display": {
    s: "Draws a computed route on the map: a styled line, casing, traffic coloring, direction arrows, alternates and the maneuver points, and keeps it consistent while the user moves.",
    d: "The directions response gives geometry and per-segment attributes such as congestion level. The client builds line features from them, assigns colors and widths, and adds markers for waypoints and turns. Alternate routes are drawn in a muted style with tap targets. During navigation the line is trimmed behind the user's progress. The challenge is correspondence: the line must match the road the map shows, which requires the route and tiles to come from the same data version.",
    k: ["Rendering the route as a map layer vs an overlay on the view: layering lets it interleave with labels and bridges correctly, but ties the app to style internals.", "Coloring segments by traffic from the response vs fetching traffic tiles separately: the response is consistent with the ETA, but is stale once the route is computed."],
    p: ["A route computed on newer data than the tiles appears to cut across blocks or drive through buildings.", "Polyline simplification on the server leaves visibly cut corners at high zoom."],
    v: "Request a route, zoom to street level at five turns, and confirm the line follows the road centerline with no cut corners; confirm congestion colors match the segment speeds in the response.",
    dep: ["overlay-and-marker-layer", "directions-endpoint"]
  },
  "user-location-display": {
    s: "Shows where the device is on the map: a position marker, an accuracy circle and heading, fed by the device's location services and optionally snapped to roads.",
    d: "The client subscribes to location updates from the device, which fuse satellite, wireless and motion sensor data. It draws a marker with an accuracy radius and a direction cone, smooths jumps, and can follow the user by moving the camera. For driving it may match positions to the road network. Hard cases include indoor drift, urban canyons where satellite signals reflect, permission handling, and balancing update rate against battery life.",
    k: ["Raw fix vs snapped position: raw shows the truth about uncertainty, while snapped looks better on a road but hides errors and can place the user on the wrong parallel street.", "High update rate vs battery: smooth movement and fast reaction, at a power cost that matters for walking and cycling tasks lasting hours."],
    p: ["Trusting a coarse network-based fix shows the user several blocks away with a tiny accuracy circle.", "Heading from the compass instead of motion points the wrong way when standing still."],
    v: "Walk a known block with a test device and confirm the marker tracks the path within the displayed accuracy radius, the heading follows travel direction, and the circle grows when entering a covered area.",
    dep: ["camera-and-gestures", "map-matching"]
  },
  "api-keys-and-quotas": {
    s: "Authenticates callers, identifies the app and plan behind each request, and enforces per-key limits on request counts, rates and allowed origins before any work is done.",
    d: "Requests carry a key or token that maps to an account, a plan and a set of restrictions: allowed domains, app identifiers, endpoints and regions. A gateway checks them, applies rate limits with token buckets, counts usage per endpoint for billing, and rejects with clear error codes. Counters must be near-real-time without making every request wait on a shared database. Hard parts include keys leaked in client code, abusive scraping that looks like normal use, and the fairness of limits among tenants.",
    k: ["Strict per-request metering vs approximate local counters synchronized periodically: strict is exact for billing but adds latency, while approximate is fast but may let a burst overshoot.", "Origin restrictions on client keys vs signed short-lived tokens: restrictions are simple, but headers can be forged outside a browser, while tokens need a backend."],
    p: ["A key embedded in a public web page is copied and used by others, running up the owner's bill.", "A limit applied per node rather than globally lets the real limit scale with the number of servers."],
    v: "Send requests past a key's per-minute limit and confirm the excess gets a rejection with a retry hint, the usage report matches the number of accepted calls, and a request from a disallowed origin fails.",
    dep: ["observability-and-slos"]
  },
  "tile-endpoint": {
    s: "Serves map tiles by zoom, column and row over HTTP, with content negotiation, compression and cache headers, as cheaply as possible.",
    d: "The path encodes the coordinates and the format, for example vector or raster. The handler resolves them to a stored or generated tile, adds compression, and sets validators and lifetimes so shared caches can absorb most traffic. Missing or empty tiles return a defined empty response so clients do not retry forever. Metadata endpoints describe sources, bounds and zoom range. It is hard because the volume is enormous and almost all of it must be served from caches, so URL design, headers and versioning are architecture decisions.",
    k: ["Versioned URLs with long lifetimes vs stable URLs with revalidation: versioned lets caches keep tiles for a year, but clients need a way to learn the current version.", "Returning 204 for empty tiles vs an empty tile body: 204 is smaller, but some clients treat any non-200 as an error and retry."],
    p: ["Stable URLs with long cache lifetimes keep showing old data after an update because no cache is told to drop them.", "Missing tiles answered with an error trigger client retry storms over oceans."],
    v: "Request one tile twice and confirm the second hits a cache with no origin load; request a tile over open ocean and confirm a fast empty response that the client accepts without retrying.",
    dep: ["on-demand-tile-server", "tile-cdn-caching", "api-keys-and-quotas"]
  },
  "search-endpoint": {
    s: "The HTTP interface for geocoding: free-text and structured queries, with bias location, filters, language and result limits, returning ranked places with coordinates.",
    d: "A request carries the query text, optional focus point or bounding box, country filters, layers of interest and a language. The endpoint validates parameters, calls the forward geocoder, formats results with names, addresses, bounding boxes and confidence, and adds attribution. Variants cover structured address search, reverse lookup and autocomplete. The challenge is that parameter combinations multiply: each interacts with ranking, and callers expect stable result shapes across versions.",
    k: ["Free-text query vs structured address fields: free text is easy for users, but structured fields remove ambiguity and are faster and more accurate when the caller has them.", "Returning many fields vs a minimal response: rich responses avoid follow-up calls, but they bloat bandwidth and make the schema harder to evolve."],
    p: ["Returning the first match when confidence is low sends deliveries to the wrong city with no warning.", "Not honoring the language parameter returns names in a script the user cannot read."],
    v: "Search for an ambiguous place name with a focus point in two different countries and confirm the nearby match ranks first in each, with a confidence value, and the response language follows the request.",
    dep: ["forward-geocoder", "autocomplete", "reverse-geocoder", "api-keys-and-quotas"]
  },
  "directions-endpoint": {
    s: "The HTTP interface for routing: origin, destination and waypoints plus a vehicle profile and options, returning geometry, distance, duration and step-by-step instructions.",
    d: "Requests list coordinates and select a profile, avoidances, departure time, alternatives and the level of detail wanted. The endpoint validates them, calls the routing orchestrator, and shapes the result: encoded geometry, per-leg and per-step data, annotations such as speed or congestion, and warnings. It must handle partial failure, such as an unreachable waypoint, with a useful error. Compatibility is hard, because many apps parse every field and a rename breaks them.",
    k: ["Returning full geometry for every step vs only for the route: full detail supports rich displays, but multiplies payload size on long routes and slows mobile clients.", "Strict validation of options vs ignoring unknown ones: strict catches mistakes early, but ignoring keeps old clients working when options are added or retired."],
    p: ["An unreachable waypoint returns a generic server error, so apps cannot tell whether to retry or fix the input.", "Large alternatives and annotations on long routes produce multi-megabyte responses that time out on mobile."],
    v: "Request a route with a waypoint on an island with no road link and confirm a specific no-route error naming that waypoint; request a long route and confirm the payload size stays within the documented limit.",
    dep: ["routing-orchestrator", "api-keys-and-quotas"]
  },
  "matrix-endpoint": {
    s: "Computes travel time and distance between many origins and many destinations in one call, for dispatch, store locators and ranking candidates.",
    d: "A request names sources and targets, and the endpoint returns a table of durations and distances. Internally it uses many-to-many search rather than separate routes. Costs grow with the product of sources and targets, so it enforces size limits and may split large jobs across workers. Unreachable pairs return null values. Hard problems are fairness (one big matrix can occupy a server), partial results, and tying the numbers to the time of day when traffic matters.",
    k: ["A synchronous bounded matrix vs an asynchronous job for large inputs: synchronous is simple to call, but large problems need queuing, progress and result storage.", "Great-circle prefilter before exact computation vs exact for all pairs: the prefilter saves work when only nearest candidates matter, but may drop a pair that is close by road and far by air."],
    p: ["Treating a null cell as zero ranks unreachable stops as the nearest.", "No size cap lets a single request of a thousand by a thousand points monopolize a server."],
    v: "Submit a ten by ten request and confirm every cell equals the duration from an individual directions call for that pair, with an unreachable pair returned as null rather than a number.",
    dep: ["many-to-many-search", "api-keys-and-quotas", "snap-to-road"]
  },
  "isochrone-endpoint": {
    s: "Returns the area reachable from a point within given travel times or distances, as polygons, for catchment analysis and delivery zones.",
    d: "A request gives an origin, a profile and one or more thresholds. The endpoint runs an expansion search, collects the reached nodes with their costs, and turns them into polygons: a contour around reached edges, simplified and smoothed for display. Multiple thresholds produce nested shapes. It is hard because the polygon depends on a smoothing choice, because reachable areas can have holes and disconnected pieces, and because large time limits mean searching a significant fraction of the graph.",
    k: ["Contour around reached nodes vs around reached edge portions: nodes are cheap, but edges reach partway along roads and give a more accurate shape.", "Smoothing for appearance vs precise concave outlines: smooth shapes are easier to read, but may include areas actually unreachable such as across a river."],
    p: ["A convex hull around reached points includes lakes and unreachable ground, overstating the catchment.", "Large time thresholds from a busy point time out unless the endpoint limits them."],
    v: "Request a ten-minute driving isochrone from a point next to a river with one bridge far away and confirm the polygon does not cross the river near the origin and a random edge point matches a direct route time.",
    dep: ["isochrone-expansion", "snap-to-road", "api-keys-and-quotas"]
  },
  "response-caching": {
    s: "Caches deterministic responses such as popular geocodes, tiles and repeated routes at the edge and in memory, keyed by normalized requests, to cut cost and latency.",
    d: "Tiles are the easiest case, since the same URL returns the same bytes. Geocodes and routes can also be cached after normalizing the request: rounded coordinates, sorted parameters, the data version and a traffic time bucket. Entries are tagged with the data version so a rollout invalidates them together. The difficulty is hit rate versus correctness: aggressive keys give many hits but serve answers that differ slightly from a fresh computation, and personalized or time-dependent requests rarely repeat.",
    k: ["Rounding coordinates in the cache key vs exact keys: rounding raises the hit rate sharply, but returns a route for a point a few meters away.", "Caching routes that include live traffic vs only static ones: traffic-aware caching saves cost but must expire in minutes, so the hit rate collapses."],
    p: ["Cache keys that omit the data version serve routes built on a previous graph after a rollout.", "Caching error responses makes a brief outage last as long as the entry lifetime."],
    v: "Issue the same geocode twice and confirm the second is answered from cache; then deploy a new data version and confirm the same request is recomputed rather than served from the old entry.",
    dep: ["tile-cdn-caching", "data-versioning-and-rollout"]
  },
  "query-parser": {
    s: "Breaks a free-text query into labeled parts such as house number, street, locality, region and country, using patterns, dictionaries and learned models.",
    d: "Input like a number followed by words and a city name is tokenized and each token labeled by a tagger trained on address data from many countries, then assembled into a structured query. Country-specific conventions matter: house number order, postal code formats, unit designators. The parser also decides whether the input is an address, a place name or a category. It is hard because the same string is valid in different ways in different places, and users type fragments, abbreviations and mixed scripts.",
    k: ["Rule-based patterns vs a learned tagger: rules are predictable and easy to debug, but learned models handle the mess of real input and generalize across countries.", "Committing to one parse vs keeping several: one is fast and simple, but keeping alternatives lets ranking recover when the best parse is wrong."],
    p: ["Parsing a business name containing a street word as an address returns the wrong kind of result.", "A model trained on one country's formats mislabels postal codes in another."],
    v: "Parse a set of one hundred real queries per country with known labels and confirm component accuracy per country exceeds the target, including ones with unit numbers, abbreviations and missing commas.",
    dep: ["text-normalization"]
  },
  "text-normalization": {
    s: "Converts names and queries to a canonical form for matching: case folding, accent handling, transliteration, abbreviation expansion and tokenization for many languages.",
    d: "Both the indexed names and the incoming query go through the same pipeline: Unicode normalization, lowercase, optional removal of diacritics, expansion of street type abbreviations, and transliteration between scripts. Language-specific tokenizers split text where spaces do not exist. Phonetic or n-gram forms support fuzzy matching. The key rule is symmetry: anything done to the query must be done to the index, or matches silently disappear. Hard cases include names with several valid spellings and transliterations.",
    k: ["Aggressive folding that merges accented and plain letters vs preserving them: folding forgives typing on foreign keyboards, but merges names that are really different.", "Normalizing at index time vs query time: index time is faster per query, but needs a reindex whenever rules change."],
    p: ["Changing a normalization rule without reindexing makes recently added names unfindable.", "Expanding abbreviations the same way everywhere turns a street named for a saint into a different street."],
    v: "Search for a place by its name with and without accents, and by its transliterated form, and confirm all three return the same top result while a different place with a similar name stays distinct.",
    dep: []
  },
  "place-index": {
    s: "The searchable store of every named place, street, address and category, organized for prefix and fuzzy text lookup combined with spatial filtering.",
    d: "Documents carry names in many languages, a type and hierarchy such as locality and region, a location or geometry, and popularity signals. An inverted index maps normalized tokens to documents, with prefix structures for autocomplete and spatial structures for bias and filtering. Admin hierarchy is stored so a street can be found under its city. It is hard because documents are heterogeneous, the index must serve single-digit-millisecond lookups, and update must not stop serving.",
    k: ["One index for all place types vs separate indexes per layer: one is simpler for ranking across types, but separate indexes can be tuned and updated independently.", "Storing full hierarchy per document vs resolving it at query time: denormalized is faster to read, but a boundary change must rewrite many documents."],
    p: ["A single hot index shard serving a capital city's queries becomes the bottleneck for the whole country.", "Indexing every name variant of a place inflates the index while adding few useful matches."],
    v: "Query ten thousand known place names and confirm each is found in the top five, with a median lookup time inside the latency budget, while a rebuilt index is swapped in with no failed requests.",
    dep: ["text-normalization", "feature-store", "boundary-import"]
  },
  "address-interpolation": {
    s: "Estimates a coordinate for a house number that has no stored point by interpolating along the street segment between known numbered points or ranges.",
    d: "Where address points are missing, the data often has ranges: house numbers from one to ninety-nine on the left side of a road piece. The interpolator finds the matching segment and places the number proportionally along it, offset to the correct side. Odd and even sides, gaps and numbering that restarts are handled by rules. It is approximate by nature: the result is near the building, not on it, and misleading when the numbering is irregular or the range is wrong.",
    k: ["Interpolating vs returning only the street center: interpolation gets the user to the right part of a long street, but can look more precise than it is.", "Preferring address points over ranges when both exist: points are accurate, but only if they are complete, while ranges cover everything at low accuracy."],
    p: ["Presenting an interpolated point without marking it as approximate sends a courier to the wrong side of a boulevard.", "Ranges that overlap across segments return two plausible places for one number."],
    v: "Geocode ten addresses with surveyed points using only range data and confirm each result lands on the correct street and side within the stated error, and is flagged as interpolated rather than exact.",
    dep: ["place-index", "address-point-import"]
  },
  "forward-geocoder": {
    s: "Turns a text query into candidate places with coordinates by matching parsed components against the index, scoring candidates and returning the best with a confidence.",
    d: "The geocoder takes the parsed query, looks up candidates in the index, filters by hierarchy and country, and scores them on text similarity, completeness of match, place type and distance to the focus. For addresses it first resolves the locality and street, then the number, falling back to interpolation or the street. Results include match quality such as rooftop, interpolated or street-level. The difficulty is balancing recall against precision: loosening matches finds more but invites wrong answers.",
    k: ["Hierarchical resolution (country, locality, street, number) vs a flat text search: hierarchy rejects impossible combinations and is more accurate, but is brittle with partial or misordered input.", "Fuzzy matching with edit distance vs exact tokens: fuzzy forgives typos and costs more compute and more false matches."],
    p: ["Returning a street-level match for an address query without saying so makes the app display a precise-looking pin that is not.", "Loose fuzzy matching on short names matches unrelated places."],
    v: "Run a labeled test set of real addresses and confirm the proportion geocoded within fifty meters of surveyed truth, and that low-confidence results are flagged rather than returned as ordinary matches.",
    dep: ["query-parser", "place-index", "address-interpolation", "result-ranking"]
  },
  "reverse-geocoder": {
    s: "Turns a coordinate into the nearest address, street, neighborhood or administrative hierarchy, using spatial indexes over address points, road segments and polygons.",
    d: "Given a point, the service finds the nearest address point or street within a threshold, then looks up containing polygons for locality, region and country. The output is formatted in the local convention and language. Different questions need different answers: nearest address, nearest named place, or just the jurisdiction. It is hard near borders, in rural areas with no addresses, in water, and where the nearest street is across a barrier from the point.",
    k: ["Nearest object by distance vs the object whose area contains the point: containment is correct for jurisdictions, but distance is the only option for streets and points.", "Returning one answer vs a ranked list by layer: one is simple, but a list lets callers choose between address, street and neighborhood."],
    p: ["A point on one side of a river returns the address on the other side because it is closer in a straight line.", "Boundary polygons simplified for display misclassify points near borders."],
    v: "Reverse geocode points surveyed at the front doors of fifty buildings and points in open countryside and confirm the first returns the right address and the second returns a street or locality, never a distant building.",
    dep: ["place-index", "boundary-import", "spatial-snap-index"]
  },
  "autocomplete": {
    s: "Returns suggestions while the user types, matching partial words against prefix structures and ranking by popularity and nearness within a very small latency budget.",
    d: "Each keystroke sends a prefix. The service matches the last token as a prefix and the earlier ones as whole words, ranks by location bias, popularity and match quality, and returns a handful of suggestions that may be places, addresses or queries. Responses must come back within tens of milliseconds, and clients debounce and cancel stale requests. It is hard because ranking must work with a few characters of input, because most candidates are bad, and because each user types differently.",
    k: ["A dedicated prefix index vs scanning the main index: dedicated is far faster for short prefixes, but is another structure to build and keep in sync.", "Favoring popular places vs nearby ones: popularity gives familiar answers, but nearby is what a person looking for the closest cafe wants."],
    p: ["A slow response arriving after the user typed more replaces the right suggestions with stale ones.", "Suggesting places that cannot then be resolved by the full search frustrates users who tap them."],
    v: "Type a known address one character at a time with a focus point and confirm the intended result appears within the first five characters, responses return under the latency budget, and every suggestion resolves in the search endpoint.",
    dep: ["place-index", "result-ranking", "text-normalization"]
  },
  "result-ranking": {
    s: "Orders candidate places by a combined score of text match, place importance, distance to the user, type and completeness, so the likely intended result comes first.",
    d: "Each candidate gets features: how many tokens matched, whether the match is exact or fuzzy, the place's importance derived from population, links or visits, the distance from the focus point, and the type compared to what the query suggests. A weighted formula or learned ranker combines them. Click and selection feedback tunes the weights. It is hard because there is no single right answer: ranking is evaluated against human judgment, and a change that fixes one country's queries can break another's.",
    k: ["A hand-tuned scoring formula vs a learned ranker: a formula is explainable and fixable, while a learned model finds interactions but needs labeled data and is harder to debug.", "Strong local bias vs global importance: local bias fixes ambiguity for nearby users, but prevents finding a famous place that happens to share a name with a local street."],
    p: ["Tuning on a test set from one country degrades results elsewhere without anyone noticing.", "Importance based on a single signal ranks a large empty region above a small real town."],
    v: "Evaluate a labeled query set before and after a ranking change and confirm the share of queries with the intended result first does not drop in any country, and look at the ten worst regressions by hand.",
    dep: ["place-index"]
  }
});
