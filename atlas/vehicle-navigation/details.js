// Details for the in-vehicle navigation plate, part 1: destination search, display and interaction, voice guidance.
ATLAS.details("vehicle-navigation", {
  "address-parser": {
    s: "Splits free-form text into structured address parts such as number, street, city and postal code, using country-specific patterns, so the geocoder can look each part up in the right index.",
    d: "Address formats differ by country: order of parts, where the number goes, whether a postal code identifies a street or a whole region. The parser tokenizes the input, normalizes abbreviations and diacritics, and labels tokens using per-country grammars plus dictionaries of street types and city names. Input is often partial, mistyped or spoken, so the parser outputs several scored interpretations rather than one. It is hard because the same token can be a name and a type, and because driver input arrives one character at a time.",
    k: ["Rule grammars per country vs a single statistical tagger: rules are predictable and easy to debug but multiply with markets; a tagger generalizes but fails in ways that are hard to explain.", "One best parse vs several scored parses: several keep the right answer reachable at the cost of more downstream lookups."],
    p: ["Abbreviations that expand differently by region turn a valid street into a no-match, such as a saint prefix versus a street type.", "Input in a script or alphabet the grammar does not know produces silent empty results instead of an error."],
    v: "Feed a set of real addresses for each supported country, including partial and misspelled ones, and confirm the top parse labels every part correctly. Replay spoken-input transcripts and compare labels with a hand-annotated set.",
    dep: ["place-and-address-data"]
  },
  "geocoder": {
    s: "Converts a structured or partial address or place name into map coordinates and a road segment to route to, using the local address index and optional online lookups.",
    d: "The geocoder takes parsed address parts and walks a hierarchy from region to city to street to number. Where house numbers are not stored, it interpolates along the street segment between known ranges. Results carry two positions: the building location and the access point on a drivable road, because routing needs the second. It is hard because address data is incomplete, streets are split across tiles, and the correct drive-to point can differ from the entrance by hundreds of meters.",
    k: ["Interpolated house numbers vs stored address points: interpolation is compact but lands on the wrong side of a long block; address points are exact and cost far more storage.", "Local-only geocoding vs online fallback: local works in a tunnel or abroad but is stale; online is current but depends on a connection and leaks the query."],
    p: ["Routing to the building center rather than the access point sends the driver to the wrong street in a gated or one-way complex.", "A street that crosses a tile boundary is found in only one tile, so numbers on the far side fail to resolve."],
    v: "Geocode a sample of known addresses and measure distance from the surveyed entrance and from the surveyed access road. Check that the routed final approach ends on the correct side of one-way streets.",
    dep: ["address-parser","place-and-address-data","spatial-index"]
  },
  "poi-index": {
    s: "A searchable store of places, such as fuel stations, parking and restaurants, with names, categories, coordinates and attributes, organized for fast lookup by text, category and distance.",
    d: "Places carry a name, category from a fixed taxonomy, position, access point and optional attributes such as opening hours, charger types or prices. The index combines a text structure over normalized names with a spatial structure, so a query like nearest pharmacy intersects both. Category lookups must also work without any text. It is hard because place data ages quickly, categories differ between data suppliers, and the same place appears as duplicates in merged sources.",
    k: ["Separate text and spatial indexes vs a combined one: separate is simple to update but joins at query time; combined is faster for nearby-name queries but harder to patch.", "Fixed category taxonomy vs supplier tags: a fixed taxonomy gives stable UI filters but loses detail when mapping."],
    p: ["Closed or relocated places remain in the index, so the driver is routed to an empty lot.", "Duplicate entries from merged sources crowd out distinct results in a short list."],
    v: "Query for the nearest place in a category at several known locations and compare against a ground-truth list within a radius. Confirm that a place removed in a data update no longer appears.",
    dep: ["place-and-address-data","spatial-index"]
  },
  "typeahead-completion": {
    s: "Updates suggestions after every keystroke, completing partial names and addresses from the local index fast enough that results appear before the next character is typed.",
    d: "Completion uses a prefix structure over names and address components, restricted by the current region and recent context. Each keystroke cancels the previous query and issues a new one; results come back in a few tens of milliseconds from memory-resident structures. The component also limits what the driver can type while the vehicle moves. It is hard because the useful result set depends on location, language and history, and because suggestions that shift under the finger cause mistaken selections.",
    k: ["Prefix trie in memory vs on-demand index reads: memory is fast but costs RAM on a small unit; on-demand reads keep memory low and add latency on slow storage.", "Re-ranking on every keystroke vs stable ordering: re-ranking is more relevant but makes the list jump while the driver is trying to tap it."],
    p: ["Slow results arrive out of order and overwrite a newer query's suggestions with an older one's.", "Completion that ignores the current country shows distant homonyms ahead of the local street."],
    v: "Type a set of known destinations character by character and record, for each, the keystroke at which the correct result first appears in the top three. Measure keystroke-to-render time on target hardware.",
    dep: ["poi-index","geocoder","fuzzy-matching-and-ranking"]
  },
  "fuzzy-matching-and-ranking": {
    s: "Tolerates misspellings, transliteration and word-order differences when matching queries to names, then ranks candidates by text similarity, distance, popularity and the driver's context.",
    d: "Matching combines edit distance or n-gram overlap with phonetic keys for spoken input, and normalizes case, diacritics and common abbreviations. Ranking blends text score, distance from the vehicle or route, category relevance and past choices into one ordered list. Weights are tuned on logged queries. It is hard because the best weighting differs between a city and a rural area, and because over-tolerant matching returns plausible but wrong places that a driver may accept.",
    k: ["Heavy tolerance vs strict matching: tolerance finds misspelled names but increases wrong matches that look convincing; strict matching is predictable and fails on typos.", "Distance-weighted ranking vs relevance-only ranking: distance favors nearby places but hides a famous destination one town over."],
    p: ["Ranking tuned on one market surfaces irrelevant results in another with different naming patterns.", "Phonetic keys built for one language mismatch place names in another language spoken in the same region."],
    v: "Run a labeled query set with typos and spoken variants and compute how often the intended place is first and within the top five. Compare before and after any weight change on the same set.",
    dep: ["poi-index","localization-and-units"]
  },
  "online-search-service": {
    s: "A cloud search that supplements local data with current places, reviews, opening hours and prices, queried when a connection exists and merged with local results.",
    d: "The client sends the query, approximate location and language to a service and receives ranked places with up-to-date attributes. Results merge with the local index, with duplicates resolved by distance and name similarity. The client sets a short timeout and shows local results first, adding online ones as they arrive. It is hard because connectivity varies from fast to absent within a minute, because queries reveal where the vehicle is going, and because remote results must still be routable on the installed map.",
    k: ["Parallel local and online queries vs online-first: parallel always shows something immediately but needs de-duplication; online-first is simpler and blank when offline.", "Sending precise position vs a coarse area: precise gives better ranking and exposes more about the vehicle."],
    p: ["An online place whose coordinates do not lie on the installed map cannot be routed to, and the failure appears only after selection.", "Results appearing late reorder the list under the driver's touch."],
    v: "With a connection, search for a place absent from the local index and confirm it appears and routes. Cut the connection mid-query and confirm local results still show within the timeout with no error screen.",
    dep: ["poi-index","connectivity-manager","consent-and-data-controls"]
  },
  "recents-and-favorites": {
    s: "Stores the driver's saved places, home and work, and recent destinations, and offers them first because they are the most likely choices.",
    d: "Each entry holds a name, position, access point and the time of use, stored in the head unit and optionally synced to an account. Suggestions combine recency, frequency and time of day, so that work appears on a weekday morning. Stored positions must be re-validated after a map update because the road network may have changed. It is hard because the data is personal, shared by several drivers of one car, and survives across many map versions.",
    k: ["Storing coordinates vs storing the original query: coordinates are stable and immune to search changes; the query re-resolves to a corrected location but can change meaning.", "Per-driver profiles vs one shared list: profiles keep private places private and need a way to identify the driver."],
    p: ["A favorite saved on a road later renumbered or closed routes to the wrong place with no warning.", "A previous owner's home address remains visible after a vehicle is sold."],
    v: "Save a place, apply a map update that moves the road, and confirm the favorite still routes to the correct access point. Perform a profile deletion and confirm the entries are unrecoverable.",
    dep: ["geocoder","consent-and-data-controls","secure-storage-and-keys"]
  },
  "map-view-controller": {
    s: "Owns the visible map state: center, zoom, tilt, orientation and what is shown, and translates driver input and guidance events into smooth view changes.",
    d: "The controller keeps a view model separate from the renderer. Gestures, knob turns, route changes and automatic zoom for upcoming maneuvers all feed one state machine that outputs camera targets per frame. It chooses which layers show at each zoom and which controls are enabled. It is hard because many sources compete to move the camera, for instance a driver panning while a maneuver arrives, and because every transition must stay smooth under variable frame time.",
    k: ["A single camera state machine vs independent animators: one machine prevents fights between inputs; independent animators are easier to add and conflict.", "Automatic zoom on approach vs fixed zoom: automatic shows the maneuver clearly and surprises drivers who set their own zoom."],
    p: ["A panning gesture left active when a maneuver arrives hides the turn and leaves the driver without the guidance view.", "Camera targets applied at the display refresh rather than frame time cause visible stutter when load spikes."],
    v: "Script a drive replay with simulated pans, zoom changes and maneuvers, and capture frames. Confirm the vehicle is always visible, view returns to follow mode after the timeout, and no frame jumps exceed a set distance.",
    dep: ["camera-and-follow-modes","gpu-scene-renderer","matched-position-output"]
  },
  "camera-and-follow-modes": {
    s: "Defines how the camera tracks the vehicle: heading-up, north-up or look-ahead, with smoothing, tilt and offset so the road ahead takes more of the screen than the road behind.",
    d: "Follow mode places the vehicle marker in the lower part of the screen and rotates the map to heading. Smoothing filters heading and position so that noise does not shake the map, while still reacting to real turns. Look-ahead shifts the camera in the travel direction with speed. Interpolation between map-matched updates, which arrive at one to ten per second, fills the frames in between. It is hard because heading is undefined at standstill and because over-smoothing makes the marker lag the real vehicle.",
    k: ["Heading-up vs north-up: heading-up matches what drivers see through the windshield but rotates labels; north-up is stable for planning and harder to read at a turn.", "Strong smoothing vs fast response: strong smoothing looks calm and lags in tight turns."],
    p: ["Using raw heading at standstill makes the map spin while the vehicle is stopped at a light.", "Interpolating beyond the last matched position draws the marker through a corner the vehicle has not reached."],
    v: "Replay a recorded drive with a stop, a roundabout and a hairpin, and compare the marker's drawn position to the matched position per frame. Check that the map does not rotate when speed is zero.",
    dep: ["matched-position-output","gpu-scene-renderer"]
  },
  "route-overview": {
    s: "Shows the whole route, alternatives and remaining distance and time on one screen, so the driver can compare options before leaving or after a reroute.",
    d: "The overview fits the route's bounding area to the screen, draws each alternative with a different style and labels differences in time and distance. It lists key attributes such as tolls, ferries or unpaved sections. For a long route it shows traffic color along the path and the segments where delay is expected. It is hard because alternatives often share most of their length, so labels collide, and because it must be usable at a glance by a passenger and by a driver who looks for a second.",
    k: ["Showing all alternatives at once vs one at a time: all at once supports comparison but clutters; one at a time is clear and hides trade-offs.", "Labeling total times vs labeling differences from the main route: differences answer the real question and require a baseline."],
    p: ["Alternatives drawn on top of each other look like one route, and the driver cannot tell where they diverge.", "A route with a toll is shown without a warning because the attribute was not carried through geometry assembly."],
    v: "Plan routes with known tolls, ferries and a traffic delay and confirm each is labeled on the overview. Compare each alternative's labeled difference to the cost computed by the router.",
    dep: ["alternative-routes","route-and-traffic-overlay","eta-computation"]
  },
  "junction-view": {
    s: "Draws an enlarged picture of a complex interchange or junction as the vehicle approaches, with the correct lanes and exits highlighted so the driver sees which way to go.",
    d: "Junction view uses prepared 3D or 2D assets keyed to a junction identifier in the map, or generates a schematic from lane data. As the vehicle approaches within a set distance, the assets replace the normal map, with the route and lane arrows overlaid. When no asset exists, the system falls back to a generic maneuver icon. It is hard because assets exist only for some junctions, must be authored and kept in step with road changes, and must align exactly with the lane model.",
    k: ["Authored junction assets vs generated schematics: authored images look right and cost production effort per junction; generated schematics cover everything and are plainer.", "Replacing the map vs a picture-in-picture: replacing is easier to read and hides surroundings."],
    p: ["An asset left in place after the junction was rebuilt shows lanes that no longer exist.", "Showing the view too late, at highway speed, leaves no time to change lanes."],
    v: "Drive or replay through a set of mapped complex junctions and confirm each shows the asset at the intended distance with the correct lane highlighted. Check a junction without assets falls back cleanly.",
    dep: ["junction-and-landmark-assets","lane-level-guidance","map-view-controller"]
  },
  "lane-guidance-display": {
    s: "Renders lane arrows and highlights which lanes lead to the next maneuver, using lane data from the map, so the driver can position early.",
    d: "Lane guidance shows a row of lane icons with allowed directions, marking recommended lanes for the route. It appears at a distance chosen by speed and road type, and updates as the maneuver nears or the next one overlaps it. Lane data comes from the map and may be incomplete, so the display shows only what it knows. It is hard because lane counts change along a road, two maneuvers may be close, and wrong lane advice is worse than none.",
    k: ["Show advice only when lane data is complete vs always show a best guess: complete-only is trustworthy and appears less often; a guess appears often and is sometimes wrong.", "Fixed distance vs speed-scaled distance: speed-scaled gives constant lead time and varies in size."],
    p: ["Lane data from a previous layout of a rebuilt road shows a lane that has been removed.", "Two maneuvers a few hundred meters apart show lane advice for the second before the first is complete."],
    v: "Compare displayed lane advice with surveyed lane layouts at a set of junctions. Confirm that for a junction with missing lane data the display hides lanes rather than showing a generic row.",
    dep: ["lane-and-sign-data","lane-level-guidance","guidance-event-timing"]
  },
  "cluster-and-hud-output": {
    s: "Sends compact guidance, such as the next turn, distance and lane, to the instrument cluster and head-up display, which have their own rendering and strict update and safety rules.",
    d: "These displays often belong to other suppliers or run on other processors, so navigation sends structured data, not pixels: maneuver type, distance, street name, lane flags and speed limit. The receiving unit draws it in its own style, sometimes as an augmented overlay aligned to the road. Updates must be timely and consistent with the main screen. It is hard because the interfaces vary by vehicle, because the data is limited in size, and because the displays may be certified for safety.",
    k: ["Sending structured data vs rendered frames: structured data respects the cluster's design and certification; frames keep full control of appearance but need bandwidth and approval.", "Push on change vs fixed rate: pushing is efficient and risks stale data if a message is lost; a fixed rate is steady and chattier."],
    p: ["Cluster and center screen disagree about the next turn when updates arrive through different paths.", "A cluster left showing the last maneuver after route cancellation misleads the driver."],
    v: "Run a scripted route and capture cluster output alongside the center screen, then compare maneuver, distance and street name at each update. Cancel the route and confirm the cluster clears within the specified time.",
    dep: ["maneuver-extractor","vehicle-signal-gateway","guidance-event-timing"]
  },
  "day-night-theming": {
    s: "Switches map and interface colors and brightness between day and night styles by ambient light, headlight state or time, to keep contrast readable without dazzling the driver.",
    d: "Inputs are the light sensor, headlamp signal, tunnel detection or a sunrise and sunset calculation for the current position. Each style defines map colors, label contrast, route color and overlay opacity. Transitions fade over a second or two so a tunnel entrance does not flash the screen. It is hard because different signals disagree, and because the styles must be tested for contrast and for color-blind readability, not only for appearance.",
    k: ["Light sensor vs headlight signal: the sensor follows actual conditions and is noisy; the headlight signal is stable and ignores bright overcast or dark tunnels.", "Fade between styles vs instant change: a fade avoids flicker in tunnels and briefly shows the wrong palette."],
    p: ["Rapid alternation at a tunnel mouth or under bridges makes the screen pulse.", "A night palette whose route color has too little contrast against the dark map is hard to see in sun glare."],
    v: "Drive through a tunnel, a bridge shadow and a sunset, or replay recorded sensor data, and confirm style switches occur once with a smooth fade. Measure contrast ratios of route and labels in both styles.",
    dep: ["style-engine","vehicle-signal-gateway"]
  },
  "touch-and-knob-input": {
    s: "Handles touch, rotary knob, steering-wheel buttons and gestures, and limits what can be done while the vehicle is moving to reduce distraction.",
    d: "Input events are routed to focused controls with large targets and short paths to the common actions. Many markets restrict text entry or long lists while the vehicle moves, so this layer reads the speed or parking state and locks or simplifies screens. Hardware knobs and buttons give input that needs no visual attention. It is hard because rules differ by market and vehicle, because lockouts frustrate passengers, and because latency between input and response must stay under about a tenth of a second.",
    k: ["Lock keyboard when moving vs allow with limits: locking follows the strictest rules and annoys passengers; limits are friendlier and need careful legal review.", "Touch-first vs knob-first navigation: touch is direct on a map, knobs are safer to use without looking."],
    p: ["A lockout driven by a single noisy speed signal flickers on and off in slow traffic.", "Gesture recognition tuned on a bench misfires on a bumpy road."],
    v: "Test input latency and lockout on a drive or a rig: begin text entry at standstill, accelerate, and confirm the keyboard locks at the specified speed and unlocks only after stopping, with response under the target time.",
    dep: ["vehicle-signal-gateway","map-view-controller"]
  },
  "instruction-text-generator": {
    s: "Turns a maneuver into a short sentence such as a turn direction, street name and distance, selecting the wording by maneuver type, road class and context.",
    d: "A template system takes the maneuver's type, angle, exit number, street name, and landmarks, and fills a language-specific template. It chooses between forms like turn left in 300 meters, then turn left, and a combined instruction when two maneuvers follow closely. Names are shortened or omitted when long or unpronounceable. It is hard because grammar changes with gender, case and number in many languages, and because the best instruction at a roundabout depends on exit count and geometry.",
    k: ["Fixed templates vs generated sentences: templates are predictable and reviewable by translators; generation covers more cases and is harder to test.", "Naming streets vs using landmarks or directions: street names are precise and hard to read out; landmarks are natural for a person and depend on data."],
    p: ["Concatenating strings instead of using full templates breaks grammar in languages with cases.", "A street name with abbreviations or symbols is read out as noise."],
    v: "Generate instructions for a catalog of maneuver types, including roundabouts, forks and chained turns, and have native speakers of each supported language review them. Compare against a golden text file.",
    dep: ["maneuver-extractor","localization-and-units"]
  },
  "prompt-scheduler": {
    s: "Decides when each spoken prompt starts so that it finishes before the maneuver at a comfortable lead time, and drops or merges prompts that cannot be said in time.",
    d: "For each maneuver the scheduler computes a trigger distance from speed, the spoken length of the prompt and a reaction margin, then fires at that distance. It queues prompts, avoids overlap, shortens a second prompt if a third is close and cancels prompts for maneuvers the vehicle no longer faces. Priorities rank warnings, maneuvers and informational messages. It is hard because speed changes during a prompt, because speech length varies by language, and because rerouting invalidates the queue.",
    k: ["Distance-based vs time-based triggers: distance triggers match maneuvers; time-based triggers give uniform lead at varying speeds and need a speed estimate.", "Dropping late prompts vs speaking them anyway: dropping avoids saying a turn after it passed and can leave a short gap."],
    p: ["A prompt for a maneuver already passed is spoken after a fast approach.", "After a reroute, stale queued prompts from the old route play."],
    v: "Replay drives at city and highway speeds and measure, per prompt, the time from end of speech to maneuver. Confirm no prompt finishes after the maneuver and no stale prompt follows a reroute.",
    dep: ["instruction-text-generator","guidance-event-timing","speech-synthesis"]
  },
  "speech-synthesis": {
    s: "Converts instruction text into audio, either with an on-board synthesizer or with prerecorded fragments, with names pronounced in the right language.",
    d: "On-board synthesis produces speech from text with a pronunciation dictionary and phoneme rules, and can speak any street name. Recorded fragments sound better for fixed phrases and cannot say arbitrary names, so systems mix the two or synthesize only names. Output is rendered into a buffer and sent to the audio service. It is hard because street names from another language need a second pronunciation set, because synthesis uses processor and memory on a small unit, and because quality is judged by listeners.",
    k: ["Full synthesis vs recorded phrases with synthesized names: full synthesis is consistent and larger; mixing sounds natural and has audible joins.", "On-board vs cloud synthesis: cloud is higher quality and unavailable in tunnels and abroad; on-board always works."],
    p: ["Foreign street names mispronounced because the voice lacks the right pronunciation rules.", "Synthesis taking too long delays the prompt past its trigger point."],
    v: "Synthesize a list of hard names in each language and have native listeners rate them. Measure time from text to first audio on target hardware and confirm it stays within the lead-time budget.",
    dep: ["localization-and-units","audio-focus-and-ducking"]
  },
  "audio-focus-and-ducking": {
    s: "Negotiates with the vehicle's audio system so a guidance prompt is heard over music or calls, by lowering other sources briefly and restoring them afterward.",
    d: "Navigation requests transient audio focus from the audio manager, which tells other sources to duck, pause or continue depending on priority. Prompts play through a channel that may be speaker-specific. The component handles calls, ongoing safety chimes and a driver who has muted guidance. It is hard because audio routing is owned by the vehicle platform, because different sources respond differently, and because a prompt stuck behind another high-priority sound can miss its moment.",
    k: ["Ducking the media vs pausing it: ducking is less disruptive and speech can still be masked; pausing guarantees clarity and interrupts the listener.", "Own mixer vs the platform's audio service: the platform service is consistent with the vehicle and gives less control over timing."],
    p: ["Media volume fails to restore after a prompt when an error occurs mid-focus.", "A phone call holds focus, so a critical turn prompt is dropped silently."],
    v: "Play music, trigger a prompt and confirm it is audible with media returning to its level within a set time. Repeat during a phone call and confirm the prompt follows the specified priority rule.",
    dep: ["speech-synthesis","process-supervision"]
  },
  "localization-and-units": {
    s: "Supplies language, units, formatting and regional conventions to everything that displays or speaks, such as kilometers or miles, date formats, address order and driving side.",
    d: "A central service holds the current language, unit system and region and notifies components when they change. It formats distances, speed, time and energy, and selects translated strings and voices. Some conventions affect behavior, such as roundabout direction, how exits are numbered and whether turns are described by compass. It is hard because defaults vary by country and by vehicle setting, because units can differ between distance and speed in one market, and because strings change length.",
    k: ["Vehicle-wide locale vs navigation-specific locale: sharing is consistent with other systems; a separate locale lets a traveler hear one language and read another.", "Rounding distances for speech vs exact values: rounded values sound natural and may disagree with the screen."],
    p: ["Hard-coded unit conversion in one screen leaves it in kilometers after the driver changes to miles.", "Long translated strings overflow fixed-size labels and are cut off."],
    v: "Switch locale and unit settings at runtime and confirm every screen and prompt changes without a restart. Review screenshots of each supported language for truncation.",
    dep: ["vehicle-signal-gateway"]
  },
  "voice-command-interface": {
    s: "Accepts spoken requests such as navigate to an address or find the nearest charger, connects to recognition and the search stack, and returns a confirmation the driver can verify.",
    d: "A speech recognizer, local or cloud-based, turns audio into text and intent. Navigation receives the intent and a slot such as a place name, which it passes to search. If the result is ambiguous, the dialog asks a short clarifying question or lists a few choices. It is hard because road noise and accents lower recognition accuracy, because place names are a large and changing vocabulary, and because the driver cannot read a long list.",
    k: ["Cloud recognition vs on-board recognition: cloud handles open vocabularies and needs a connection; on-board works anywhere with a limited vocabulary.", "Confirming every result vs acting immediately: confirming avoids wrong trips and slows the dialog."],
    p: ["A wrongly recognized place starts guidance to the wrong city with no confirmation.", "Recognition that fails silently in a noisy cabin leaves the driver repeating the request."],
    v: "Speak a list of destinations in cabin noise conditions and measure the fraction correctly identified at the top result and after one clarifying turn. Confirm a misrecognition is visible before guidance starts.",
    dep: ["fuzzy-matching-and-ranking","geocoder","audio-focus-and-ducking","consent-and-data-controls"]
  },
});
