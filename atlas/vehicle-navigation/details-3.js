// Details for the in-vehicle navigation plate, part 3: traffic and arrival time, positioning and sensor fusion.
ATLAS.details("vehicle-navigation", {
  "traffic-feed-client": {
    s: "Connects to one or more traffic sources, over broadcast radio data or cellular IP services, subscribes to the area around the vehicle and route, and passes raw messages to decoding.",
    d: "Broadcast channels deliver incident messages in a compact coded form to everyone in range and need no data plan. IP services deliver flow and incident data per tile or per route corridor and can be much richer. The client chooses the region to subscribe to, handles authentication and retries, and keeps a persistent connection or polls on a timer. It is hard because coverage differs by market and source, because sources disagree, and because a poor connection must degrade the data, not block the unit.",
    k: ["Broadcast vs IP traffic: broadcast is free and sparse and works anywhere in range; IP is dense and current and needs connectivity and a service contract.", "Subscribing to a corridor around the route vs to tiles around the vehicle: corridors save data and need a new subscription on every reroute."],
    p: ["A subscription tied to the original route stops delivering data after a reroute leaves its corridor.", "Retrying aggressively on a failing connection drains the battery and the data allowance."],
    v: "Start a trip with a connection, cut it, restore it, and confirm the client reconnects, resubscribes to the current region and resumes updates within the specified time. Compare received incidents with a reference feed.",
    dep: ["connectivity-manager","location-reference-decoder","consent-and-data-controls"]
  },
  "location-reference-decoder": {
    s: "Translates the location in a traffic message, which is defined against the sender's map, into edges on the vehicle's own map, so the report applies to the right road.",
    d: "Senders and receivers use different maps, so messages cannot use local edge identifiers. They carry a location reference: a coded table location, or a dynamic description with a few points, road class, bearing and length. The decoder finds the best-matching path in the local map by comparing candidates for each point and the path between them. It is hard because decoding must be both fast and right: a wrong match puts congestion on a parallel road or the wrong direction.",
    k: ["Table-based location codes vs map-agnostic references: tables are cheap to decode and need a maintained shared table; map-agnostic references work anywhere and require a matching search.", "Rejecting low-confidence matches vs applying them: rejecting loses some valid reports; applying risks wrong delays on the route."],
    p: ["Matching a message to the opposite carriageway of a divided road reports delay in the wrong direction.", "A table version mismatch silently maps codes to different roads."],
    v: "Decode a set of messages with known locations on the local map and measure the share matched to the correct edge and direction. Confirm low-confidence messages are discarded rather than applied.",
    dep: ["spatial-index","routing-graph","road-network-model"]
  },
  "flow-speed-ingest": {
    s: "Reads current average speeds per road segment from the feed, validates them and updates the traffic store so the cost model and ETA use present conditions.",
    d: "Flow data gives, for each segment or group of segments, current speed and free-flow speed, sometimes with a confidence value and a time stamp. The ingest checks ranges, drops values too old, smooths between updates and maps them to local edges. Updates arrive every minute or so for thousands of segments. It is hard because coverage thins out on minor roads and data for one segment can be stale while its neighbor is fresh.",
    k: ["Using every update vs smoothing: every update reacts instantly and makes routes jitter; smoothing is calm and delays real changes.", "Falling back to historical speed when data is missing vs to free flow: historical is realistic at rush hour and free flow is optimistic."],
    p: ["A stuck sensor reporting the same speed for hours is treated as current.", "Applying a segment's speed to a longer stretch of road than it measured creates phantom jams."],
    v: "Ingest a recorded feed and compare resulting edge speeds with ground-truth probe speeds on a sample of segments. Confirm that values past their expiry revert to historical speeds.",
    dep: ["traffic-feed-client","location-reference-decoder","traffic-store-and-expiry"]
  },
  "incident-and-closure-handler": {
    s: "Interprets accident, roadwork, closure and hazard messages, deciding which block a road, which slow it and how long they matter, and flags them to routing and guidance.",
    d: "Each incident has a type, location, extent, start and expected end, and severity. Closures become hard exclusions or very high costs on affected edges, lane closures become speed reductions and hazards become warnings only. The handler also tells the driver about incidents ahead and may trigger a reroute. It is hard because end times are guesses, because incident reports persist after the incident clears, and because closures that are wrong force detours with no benefit.",
    k: ["Treating a closure as impassable vs as expensive: impassable avoids a blocked road; expensive keeps a route when the closure was cleared or is passable by a vehicle.", "Expiry by reported end time vs by silence: reported end time is simple and often wrong; silence-based expiry needs a source that reports clearing."],
    p: ["A closed road remains avoided for hours after reopening because the clear message never arrived.", "A closure on one carriageway is applied to both directions."],
    v: "Replay a day of incidents from a feed and compare handler state with an incident log: closures appear and disappear at the expected times, and routes avoid them. Measure false closures left active after the real end.",
    dep: ["location-reference-decoder","traffic-store-and-expiry","reroute-controller"]
  },
  "speed-profile-predictor": {
    s: "Estimates typical and expected speeds on each road by time of day and day of week from historical data, to use when live data is missing or for trips that begin later.",
    d: "Historical profiles are compiled from probe data into per-segment speed curves in short time bins, with separate curves for weekdays and weekends and sometimes for events or holidays. Some systems blend the profile with live data, so that today's deviation from normal carries forward and decays. It is hard because data volume is large, because rare roads have little data, and because disruptions such as school holidays shift the patterns in ways the profile does not capture.",
    k: ["Fine time bins vs coarse: fine bins capture rush hour and use more storage; coarse bins are compact and blur peaks.", "Blending live deviation with decay vs using live only for the near term: blending extends usefulness and can carry a short jam too far."],
    p: ["A profile built before a road opened or a speed limit changed predicts the old speeds.", "Holiday periods use normal weekday curves and underestimate delay."],
    v: "Compare predicted speeds for a held-out week of probe data by segment and time bin, and report error by road class. Confirm the profile is replaced by live data when live data is fresh.",
    dep: ["road-attribute-layers","map-compiler-pipeline","flow-speed-ingest"]
  },
  "eta-computation": {
    s: "Estimates arrival time and remaining time from the current route, vehicle speed and traffic, and updates it continuously so the displayed time is credible.",
    d: "ETA sums per-edge travel times from the current position to the destination using live speeds near the vehicle, profile speeds further away and stop times for waypoints and ferries. It is recomputed when position, traffic or route change. It must also be smooth: a displayed arrival time that jumps by minutes at each update loses trust. It is hard because the estimate is a prediction of conditions not yet met, and drivers compare it with their own sense of time.",
    k: ["Smoothing the displayed ETA vs showing the latest: smoothing avoids jumps and hides real changes; latest is accurate and flickers.", "Using driver's recent speed vs using the road's speed: personal speed fits the driver and is noisy over short windows."],
    p: ["A single slow segment at a light causes the ETA to jump several minutes and then recover.", "Ignoring time already spent stopped at a stop makes the arrival earlier than reality."],
    v: "For a set of real trips, record ETA at several points and compare with actual arrival, reporting error against remaining time. Confirm the ETA changes by no more than a set amount per update absent a real event.",
    dep: ["route-follower","traffic-store-and-expiry","speed-profile-predictor"]
  },
  "traffic-store-and-expiry": {
    s: "Holds all current traffic facts, speeds and incidents, keyed by map edge with a time stamp and source, and removes or fades them when they should no longer apply.",
    d: "The store is an in-memory table keyed by edge identifier, with the latest speed or incident and when it was received. Routing and ETA query it at search time, often millions of times, so lookups must be constant time. Entries carry expiry rules: flow decays toward the profile, incidents end at a stated time or are dropped after silence. It is hard because the same edge may have data from several sources, which must be merged with a rule, and because a map update changes edge identifiers.",
    k: ["Flat table by edge vs spatial tiles: a flat table is fastest to query; tiles load and evict together with map tiles.", "Newest source wins vs most trusted source wins: newest is simple and can let a weak source override a reliable one."],
    p: ["After a map update, stored entries refer to edges that no longer exist or now mean a different road.", "No expiry on a failing feed leaves the last known jam applied for the rest of the day."],
    v: "Feed the store data from two sources with conflicts and confirm the merge rule. Stop the feed and confirm entries fade to profile values at the specified times, and that the store clears after a map version change.",
    dep: ["road-network-model","map-software-compatibility"]
  },
  "probe-data-reporter": {
    s: "Uploads anonymized samples of the vehicle's own position and speed to a traffic service, so that the vehicle contributes to the live picture other drivers get.",
    d: "The reporter samples the matched position, speed and time at intervals, removes identifiers, cuts trace ends near home and work, and uploads in batches when a connection and consent exist. Samples are tied to map edges so the service can compute average speeds. It is hard because even anonymized trajectories can identify a driver, because batching and upload cost data and power, and because law and consent rules vary by country.",
    k: ["Uploading raw traces vs edge-level speed summaries: raw gives the service more power and more privacy risk; summaries reveal less and limit analysis.", "Continuous upload vs batch: continuous is fresher and uses more data and power; batching is cheap and delayed."],
    p: ["Trace starts and ends not trimmed reveal the home address of the driver.", "Upload continues after the driver withdraws consent because the setting is read only at startup."],
    v: "Inspect an uploaded batch and confirm it contains no persistent identifier, that trace ends are trimmed by the specified distance and that no data is sent after consent is withdrawn.",
    dep: ["matched-position-output","consent-and-data-controls","connectivity-manager"]
  },
  "gnss-receiver-interface": {
    s: "Reads position, velocity and time from the satellite receiver, along with satellite counts and signal quality, and exposes them as timed measurements to the fusion filter.",
    d: "The receiver outputs fixes at one to ten per second over a serial or bus link in a vendor message format or a standard sentence format, and may output raw measurements with pseudoranges and Doppler shifts. The interface parses messages, checks checksums, converts to a common frame and stamps each with receiver time. Raw measurements allow tighter fusion with other sensors. It is hard because message rates and latency vary, and a fix reports where the vehicle was a fraction of a second earlier.",
    k: ["Using fixes vs raw measurements: fixes are simple and portable; raw measurements allow better fusion in poor signal and need more processing and a capable receiver.", "Polling vs interrupt-driven reading: interrupts reduce latency and add complexity in a real-time system."],
    p: ["A parsing error on a rare message type drops fixes silently.", "Treating a fix as current when it is 200 milliseconds old puts the marker behind the vehicle at speed."],
    v: "Log receiver output on a drive with a reference system and compare reported position, speed and time with the reference. Confirm corrupted messages are rejected and counted without stopping the stream.",
    dep: ["time-alignment","vehicle-signal-gateway"]
  },
  "gnss-quality-monitor": {
    s: "Judges how much to trust each satellite fix from the number and geometry of satellites, signal strength, reported accuracy and consistency with recent motion, and flags suspect fixes.",
    d: "The monitor reads the dilution of precision values, signal-to-noise ratios, the receiver's own accuracy estimate and the fix mode. It also checks consistency: a fix that implies an impossible acceleration or a jump from the dead-reckoned position is flagged. It outputs a weight or an accuracy estimate for fusion. It is hard because receivers report optimistic accuracy, especially with reflected signals, and because spoofed or jammed signals can look good.",
    k: ["Trusting receiver accuracy vs independent checks: receiver accuracy is free and often optimistic; independent consistency checks catch jumps and add tuning.", "Rejecting bad fixes vs down-weighting: rejecting avoids contamination and loses information; down-weighting keeps it and lets errors in."],
    p: ["Accepting multipath fixes next to tall buildings, which show high satellite counts and are wrong by tens of meters.", "Thresholds tuned on open highways reject all fixes in a dense city."],
    v: "Drive routes in open sky, urban canyon and under trees with a reference position, and plot reported accuracy against actual error. Confirm that actual error exceeds the stated accuracy only rarely.",
    dep: ["gnss-receiver-interface","dead-reckoning"]
  },
  "correction-data-input": {
    s: "Brings in external correction information, such as satellite orbit data or differential corrections, to shrink position error from meters toward decimeters.",
    d: "Corrections arrive over the cellular link or from a satellite service. They are applied inside the receiver or in the fusion software, depending on the receiver's capabilities. The component keeps the corrections fresh, checks their validity time and region, and falls back to uncorrected positioning when the link fails. It is hard because corrections cost data and money, because they must match the receiver's expectations in format and age, and because the benefit shows only with a precise receiver.",
    k: ["Receiver-side corrections vs software corrections: receiver-side is simple and tied to a receiver; software is flexible and needs raw measurements.", "Always on vs only when needed: always on gives stable accuracy at constant data cost; on demand saves data and starts late."],
    p: ["Using corrections older than their validity time degrades accuracy below uncorrected positioning.", "A dropped link goes unnoticed and the system continues to claim high accuracy."],
    v: "Compare position error against a surveyed point with and without corrections and confirm a measured improvement. Disconnect the data link and confirm the reported accuracy worsens within the specified time.",
    dep: ["gnss-receiver-interface","connectivity-manager"]
  },
  "inertial-sensor-driver": {
    s: "Reads the gyroscope and accelerometer at high rate, applies temperature and scale compensation and time-stamps samples for the fusion filter.",
    d: "The inertial unit reports angular rate and acceleration at hundreds of samples per second. The driver reads over a serial bus, converts raw counts to physical units, corrects for known bias and temperature drift and removes outliers. It also tells the filter the mounting orientation relative to the vehicle. It is hard because sensor bias drifts with temperature and age, because mounting differs by vehicle and can change after service, and because sample timing jitter directly turns into error.",
    k: ["Raw sample stream vs on-sensor filtered output: raw preserves information for custom filtering and needs more bandwidth; on-sensor filtering is lighter and a black box.", "Factory calibration only vs in-vehicle calibration: factory is repeatable and not valid after remounting; in-vehicle adapts and needs a learning period."],
    p: ["Driver reading samples late and in bursts causes timing errors that look like heading drift.", "Temperature compensation tables from a bench are wrong inside a hot dashboard."],
    v: "Hold the vehicle stationary for several minutes and confirm measured angular rate stays near zero with bias estimates stable. Drive a known turn and compare integrated heading change with the actual change.",
    dep: ["time-alignment","sensor-calibration"]
  },
  "wheel-speed-and-yaw-input": {
    s: "Reads wheel pulse counts, vehicle speed and yaw rate from the vehicle network, giving distance traveled and turning that continue to work when satellites are not visible.",
    d: "Wheel speed sensors provide pulse counts per wheel, and the vehicle's stability system often supplies speed and yaw rate. The component converts pulses to distance using tire circumference and corrects for slip and for the difference between left and right wheels in a turn. Odometry is accurate over short distances and drifts as tires wear or pressure changes. It is hard because messages come at the vehicle network's schedule, with their own latency, and signal definitions differ between vehicles.",
    k: ["Per-wheel pulses vs a single speed signal: per-wheel allows yaw estimation and needs more data and logic; a single signal is simple and loses detail in turns.", "Fixed tire constant vs learning scale: fixed is simple; learning against satellite distance compensates wear and can learn wrong values."],
    p: ["A wheel scale factor not updated after fitting different tires gives a persistent distance error.", "Message wrap-around of the pulse counter is mishandled and produces a large false distance jump."],
    v: "Drive a measured distance, for example a surveyed kilometer, and compare odometry-derived distance with the true one. Test across counter wrap-around and verify no jump appears.",
    dep: ["vehicle-signal-gateway","time-alignment","sensor-calibration"]
  },
  "gear-and-direction-input": {
    s: "Reads which way the vehicle is moving, forward or in reverse, from the gear selector and wheel direction signals, so that dead reckoning does not move the vehicle the wrong way.",
    d: "Wheel pulses alone cannot give the sign of motion. The gear signal and, on some vehicles, direction-aware wheel sensors tell whether the vehicle goes forward or backward. Fusion uses the sign to integrate distance correctly. Reverse driving also matters to guidance, since heading and the direction of travel differ. It is hard because the signal and motion can disagree during gear changes and rolling on a slope, and many vehicles do not report direction at all.",
    k: ["Gear signal vs direction-aware wheel sensors: gear is available everywhere and wrong when rolling on a hill; wheel sensors observe actual motion and are not always fitted.", "Assuming forward when unknown vs holding the last direction: assuming is simple and wrong in parking; holding survives brief signal loss."],
    p: ["Missing reverse detection makes dead reckoning drive the marker forward while reversing out of a space.", "The gear signal changes before the vehicle stops, adding a false position jump."],
    v: "Reverse the vehicle in a car park for a known distance and confirm the integrated position moves backward by about that distance. Roll on a slope in neutral and confirm direction follows wheel data.",
    dep: ["vehicle-signal-gateway","wheel-speed-and-yaw-input"]
  },
  "sensor-calibration": {
    s: "Estimates and tracks sensor biases, scale factors and mounting angles while driving, using satellite fixes and known motion as references, so that dead reckoning stays accurate.",
    d: "Calibration estimates gyroscope bias at standstill, wheel scale factor from satellite distance, and mounting alignment of the inertial unit from acceleration and turns. It runs as part of the fusion filter or as a slower background estimator, and stores results across ignition cycles. Parameters are only updated when conditions support it, for example good satellite signal. It is hard because wrong calibration looks like valid data and compounds, and it must restart after sensor replacement.",
    k: ["Continuous online calibration vs fixed after learning: online adapts to wear and temperature and risks learning errors; fixed is stable and ages.", "Persisting calibration across ignitions vs relearning: persisting starts accurate and may keep a bad value; relearning is clean and begins less accurate."],
    p: ["Calibrating during a period of poor satellite signal bakes the error into the parameters.", "Parameters from one vehicle carried over after the head unit is moved to another."],
    v: "Reset calibration, drive an open-sky route and confirm parameters converge to stable values within the specified distance. Then enter a long tunnel and measure dead reckoning error against the known tunnel length.",
    dep: ["inertial-sensor-driver","wheel-speed-and-yaw-input","gnss-quality-monitor"]
  },
  "sensor-fusion-filter": {
    s: "Combines satellite, inertial and wheel measurements into one estimate of position, heading, speed and their uncertainties, using a probabilistic filter that weights each source by its reliability.",
    d: "The filter keeps a state vector, typically position, velocity, heading and sensor biases, with a covariance matrix. High-rate inertial and wheel data propagate the state between satellite fixes, and each fix corrects it in proportion to relative uncertainty. Outliers are gated by comparing the measurement with the prediction. The filter runs at the inertial rate and outputs at a lower rate. It is hard because noise models are never exact, and because it must remain stable through outages and restarts.",
    k: ["Loosely coupled (fixes) vs tightly coupled (raw satellite measurements): loose is simple and loses information in poor signal; tight keeps working with fewer than four satellites.", "Fixed noise parameters vs adaptive: fixed is predictable; adaptive follows conditions and can diverge."],
    p: ["Underestimated measurement noise lets a single wrong fix pull the whole estimate away from the road.", "A filter initialized with a large heading error never recovers without a reset."],
    v: "Run the filter on recorded drives against a precise reference trajectory and compare position and heading error and its stated uncertainty. Confirm error stays within the stated bound in at least the specified share of samples.",
    dep: ["gnss-receiver-interface","inertial-sensor-driver","wheel-speed-and-yaw-input","gnss-quality-monitor","sensor-calibration","time-alignment"]
  },
  "dead-reckoning": {
    s: "Advances the last known position from heading and distance traveled when satellites are unavailable, so the vehicle marker keeps moving through tunnels and garages.",
    d: "Dead reckoning integrates speed along the heading from the yaw rate or heading source. Errors grow without bound: heading error becomes lateral error, scale error becomes along-track error. Map matching feeds back road geometry to pull the estimate onto the road. The system estimates how long it can continue and reports growing uncertainty. It is hard because tunnels with branches and ramps allow errors to choose the wrong exit.",
    k: ["Pure sensor integration vs map-aided: pure is independent of map errors and drifts steadily; map-aided stays on the road and can lock onto the wrong one.", "Continuing indefinitely vs declaring position lost: continuing is useful in short outages; declaring lost is honest after the error is too large."],
    p: ["Drift of tens of meters after a long tunnel places the vehicle on the wrong carriageway at the exit.", "Heading bias unrecognized before the outage gives a curved error."],
    v: "Drive into a tunnel of known length and measure along-track and lateral error at the exit versus the reported uncertainty. Repeat at different speeds and with a curved tunnel.",
    dep: ["sensor-fusion-filter","wheel-speed-and-yaw-input","gear-and-direction-input","topology-constraints"]
  },
  "outage-and-multipath-handling": {
    s: "Detects and manages the situations where satellite positioning is lost or misleading: tunnels, garages, urban canyons and reflections, and tells the rest of the system what to trust.",
    d: "Detection combines signal strength, satellite count, sudden jumps against dead reckoning and the map's own knowledge of tunnels and covered roads. In an outage the filter relies on inertial and wheel data and widens its uncertainty. For multipath it reduces the weight of fixes with inconsistent signals. When signal returns, the component blends the fix back gradually, not by a jump. It is hard because reflected signals look healthy, and because re-acquisition after a long outage can be wrong.",
    k: ["Using map knowledge of tunnels vs sensing only: map knowledge anticipates outages and relies on a complete map; sensing works anywhere and notices late.", "Snapping to a returning fix vs blending: snapping is accurate and makes the marker jump; blending is smooth and slow to correct."],
    p: ["Reflected signals between tall buildings give confident fixes on the wrong side of the street.", "A fix after long outage accepted without checking creates a position jump of hundreds of meters."],
    v: "Drive through a dense downtown, a tunnel and a multi-level car park, and check that the reported uncertainty grows in outages and that the marker does not jump more than a set distance when signal returns.",
    dep: ["gnss-quality-monitor","dead-reckoning","sensor-fusion-filter"]
  },
  "time-alignment": {
    s: "Puts every sensor measurement on a common clock, correcting for transport and processing latency, so that fusion combines data that describes the same moment.",
    d: "Satellite fixes carry accurate time but arrive late; inertial samples are stamped on arrival or by the sensor; vehicle messages come with bus latency. The component converts all stamps to one time base, typically the receiver's pulse-per-second signal, and estimates each source's delay. The filter then applies each measurement at the moment it describes. It is hard because latencies vary with load, because clocks drift, and because a few tens of milliseconds at highway speed is meters.",
    k: ["Hardware time stamping vs software stamping: hardware is precise and needs support; software is flexible and carries scheduling jitter.", "Estimating latency online vs fixed constants: online follows changes and can be noisy; fixed is simple and wrong when the system is loaded."],
    p: ["Stamping on message arrival makes the position lag by the processing delay and looks like heading error in turns.", "Clock jumps from a time update shift all stored samples."],
    v: "Inject a known motion event, for example a sharp turn, and compare the times at which inertial, wheel and satellite data show it. Confirm alignment error is below the specified milliseconds.",
    dep: ["vehicle-signal-gateway"]
  },
  "position-confidence-output": {
    s: "Publishes, with each position, a quantified estimate of its error and the fix type, so consumers can decide how much to trust it for matching, guidance and lane advice.",
    d: "The output has horizontal accuracy as a radius or error ellipse, heading and speed accuracy, a mode flag such as satellite, dead-reckoned or degraded, and the time since the last satellite fix. Consumers use it to set thresholds: map matching widens its candidate search, off-route detection waits longer, lane advice hides when the error exceeds a lane width. It is hard because the numbers must be honest, an over-confident estimate is worse than a large one.",
    k: ["Reporting one-sigma vs a high-confidence bound: one-sigma is the statistical convention and misleads simple consumers; a high-confidence bound is conservative and easy to use.", "Continuous accuracy vs coarse quality levels: continuous is precise; levels are easy to act on."],
    p: ["Consumers ignoring the confidence field behave identically in tunnels and in open sky.", "Accuracy resets to optimistic values immediately on a new fix after an outage."],
    v: "Over many drives, compute the share of samples whose true error is within the reported accuracy and compare with the stated confidence level. Confirm accuracy grows during outages and shrinks after recovery.",
    dep: ["sensor-fusion-filter","outage-and-multipath-handling"]
  },
});
