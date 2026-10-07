// Details for the VR & AR runtime plate, part 4: head and device tracking, hands, eyes and body, sensors.
ATLAS.details("xr-runtime", {
  "inside-out-slam": {
    s: "Estimates the headset's pose from its own cameras by building a map of the surroundings while locating itself within it, with no external base stations.",
    d: "Several wide-angle cameras image the room. The system extracts features, matches them across frames and with the map, and solves for the pose that explains them, with inertial data filling the gaps between images. Map points are added as new areas are seen. It runs continuously on the device at a fixed latency. The hard part is robustness: featureless walls, glare, darkness, repeated patterns and moving people break feature matching, and the system must keep a usable pose for a few seconds on inertial data alone while it recovers.",
    k: ["Inside-out cameras vs external base stations: no setup and unlimited room size, but tracking quality depends on lighting and room texture and costs headset power.", "Many cameras vs few: wider coverage and fewer losses, but more bandwidth, compute and cost."],
    p: ["A plain white room offers too few features, so tracking jitters or drifts.", "Operating in near darkness extends exposure times, causing blur and lost tracking."],
    v: "Walk a marked 5 by 5 meter path with the headset and compare its reported trajectory to a motion capture reference; confirm position error stays under 1 centimeter on average and 3 centimeters at maximum, across lit and dim conditions.",
    dep: ["feature-extraction","visual-inertial-odometry","map-and-relocalization"]
  },
  "feature-extraction": {
    s: "Finds repeatable points or lines in each camera image, such as corners and edges, and describes them compactly so they can be matched between frames and with the map.",
    d: "Each camera frame passes through a detector that selects distinctive locations spread across the image, then computes descriptors that remain similar under changes in viewpoint and lighting. Dedicated vision hardware or the GPU does this at the camera rate. Features are matched across cameras for depth and across time for motion. Quality of selection matters more than quantity: clusters of points give poor geometry. The difficulty is speed within a power budget, and invariance, since the same corner looks different under glare, blur or exposure changes.",
    k: ["Sparse hand-designed features vs learned features: sparse features are fast, predictable and cheap, while learned ones match better under hard lighting at a higher cost.", "Detecting evenly across the image vs the strongest points: even spread improves geometry, but weaker points reduce match quality."],
    p: ["Features concentrated on a poster give a pose solution that is accurate nearby and poor elsewhere.", "Tuning thresholds in a lab misses bright-window and dim-corner conditions seen in homes."],
    v: "Run extraction over a recorded set of rooms in varied lighting, and confirm each frame yields at least the minimum feature count distributed over all image quadrants within the per-frame time budget.",
    dep: ["camera-capture-and-exposure","sensor-time-sync"]
  },
  "visual-inertial-odometry": {
    s: "Combines camera feature motion with inertial measurements to estimate the head's pose and velocity continuously, accurate in the short term and consistent with the camera view.",
    d: "An estimator, usually a filter or sliding-window optimizer, maintains pose, velocity and sensor biases. Inertial samples propagate the state at high rate; each image adds constraints from tracked features that correct drift and bias. Scale comes from the inertial data. It outputs a pose and covariance to the sensor fusion and prediction stages. The hard part is observability and timing: poorly synchronized sensors, wrong calibration or rapid rotation without features lead to drift or divergence, and the estimator must detect that and reset safely.",
    k: ["Tightly coupled estimator vs separate visual and inertial solutions: better accuracy and handling of weak visual data, but heavier computation and harder debugging.", "Filter vs windowed optimization: a filter is cheaper and predictable, while optimization is more accurate but has variable cost."],
    p: ["A small time offset between camera and IMU makes the pose wobble during rotation.", "Uncorrected accelerometer bias after a temperature change causes steady drift."],
    v: "Run a 10 minute session with fast head motion and a hold in darkness, compare the pose to motion capture, and confirm drift in the darkened segment stays under the documented figure and the estimator reports reduced confidence.",
    dep: ["imu-sampling","feature-extraction","sensor-calibration"]
  },
  "map-and-relocalization": {
    s: "Stores keyframes and landmarks of previously seen places and matches live images against them to find the headset's position in the stored map after a restart or tracking loss.",
    d: "The map holds keyframes with descriptors and the 3D landmark positions. On startup or loss, the system retrieves candidate keyframes by image similarity, verifies the geometry with the current features, and computes the pose in the map frame. Successful relocalization re-anchors the coordinate system. Maps can be merged and pruned. It is hard because similarity retrieval can retrieve the wrong place, changes in the environment reduce matches, and map size grows with the explored area, while memory and search time must stay bounded.",
    k: ["Visual relocalization vs relying on fixed markers: works anywhere previously mapped, but fails when the place has changed and needs a compute-heavy search.", "Pruning old keyframes vs keeping all: bounded memory and faster search, but loses coverage of rarely visited areas."],
    p: ["A false match in a similar-looking room silently teleports the world origin.", "An ever-growing map slows relocalization until it takes many seconds."],
    v: "Cover and uncover the cameras in five rooms, and confirm relocalization succeeds within three seconds in at least 95 percent of attempts with the pose within 1 centimeter of earlier, and no wrong-room matches.",
    dep: ["feature-extraction","loop-closure","room-mapping"]
  },
  "loop-closure": {
    s: "Detects when the headset returns to a place it has already seen and adjusts the map and trajectory to remove the drift accumulated in between.",
    d: "As the system moves, drift grows. A place-recognition step compares the current view against earlier keyframes; when a match is found and geometrically verified, an optimization adjusts the whole chain of poses so that the loop is consistent. The correction spreads over the trajectory and updates landmarks and anchors. It runs in the background and can take noticeable time. The difficulty is verifying matches, because a false loop closure bends the map badly, and applying the correction without making the world visibly jump.",
    k: ["Global optimization on closure vs local adjustment: a consistent map everywhere, but a heavy computation and larger jump; local adjustment is cheaper but leaves residual drift.", "Strict match verification vs permissive: avoids false loops, but misses real ones and keeps drift longer."],
    p: ["A false closure between two similar corridors warps the map and moves every anchor.", "An uncontrolled correction applied in one frame shows up as a sudden jump of the virtual world."],
    v: "Walk a 100 meter loop and compare position at the start and end before and after closure; confirm the closure error is removed to under 2 centimeters, and no frame shows a pose step above the smoothing limit.",
    dep: ["map-and-relocalization","anchor-drift-correction"]
  },
  "controller-tracking": {
    s: "Finds the pose of each handheld controller by detecting its infrared markers in headset camera images and fusing the result with the controller's own inertial sensors.",
    d: "Controllers carry LEDs in a known pattern. The headset cameras, with short exposure to isolate them, locate the blobs, match them to the model and solve for pose. Between camera frames the controller's IMU, sent over the radio, interpolates. When the controller leaves view, inertial prediction continues for a short while and confidence is reduced. It is hard because ambient infrared, other controllers' LEDs and reflections confuse detection, the controller's inertial data arrives with link delay, and fast hand motion exceeds what cameras see.",
    k: ["Optical markers plus inertial fusion vs inertial only: accurate absolute position with low drift, but limited to the cameras' view and sensitive to occlusion.", "Strobed LEDs synchronized to camera exposure vs constant: better contrast and lower power, but needs timing coordination with each controller."],
    p: ["Holding controllers close together confuses the LED-to-controller assignment, swapping their poses.", "Bright sunlight washes out the markers, and the controller drifts on inertia alone."],
    v: "Move a controller through the field of view and out behind the back at 2 meters per second, compare to motion capture, and confirm position error stays under 5 millimeters in view and degrades gracefully, with flags, when out of view.",
    dep: ["camera-capture-and-exposure","imu-sampling","controller-radio","sensor-time-sync"]
  },
  "outside-in-tracking": {
    s: "Tracks the headset and controllers from fixed external sensors or emitters placed in the room, trading setup for very stable absolute positions.",
    d: "Base stations sweep the room with light, or external cameras watch markers on the headset, and the device's sensors or markers give the angles that locate it. Triangulating multiple stations produces a pose in a room frame fixed to the stations, with very low drift and no dependence on the room's texture. The runtime treats it as another tracker feeding sensor fusion. The hard part is setup: stations must be placed with line of sight, calibrated, powered and kept still, and reflective surfaces create phantom signals.",
    k: ["External sensors vs inside-out: absolute and stable, with excellent accuracy and no feature dependence, but fixed room setup and limited area.", "Many base stations vs two: better coverage and fewer occlusions, but more setup, cost and calibration."],
    p: ["A bumped base station silently shifts the whole world by centimeters.", "A mirror in the room produces reflected sweeps that cause a ghost tracked device."],
    v: "Track the headset across a room with two stations and compare to motion capture; confirm position error is under 2 millimeters, and that moving one station triggers a recalibration prompt.",
    dep: ["sensor-drivers","sensor-fusion-filter","sensor-calibration"]
  },
  "tracking-loss-recovery": {
    s: "Defines what the system does when tracking fails: how long to coast on inertial data, what to show the user, and how to resume without a jump.",
    d: "Failure detection looks at feature counts, estimator covariance and consistency checks. In the first moments, inertial dead reckoning produces a plausible orientation and a drifting position. If loss persists, the runtime flags position invalid, fades the scene to a safe visual cue such as a neutral grid, and begins relocalization. On success it blends back to the correct pose. It is hard because users keep moving during failure, so the recovered pose may jump far, and applications must handle the flag instead of rendering from a bad pose.",
    k: ["Coast on inertial data vs freeze position: orientation stays smooth for short gaps, but position drifts quickly and may be dangerously wrong.", "Fade to a neutral cue vs keep rendering: protects comfort and safety, but interrupts the experience for brief glitches."],
    p: ["Resuming with a corrected pose in a single frame shoves the world and can cause sickness.", "Applications that ignore the validity flag render the scene from garbage poses."],
    v: "Cover the cameras for two seconds while moving, and confirm the runtime flags loss within 100 milliseconds, shows the cue, resumes within three seconds of uncovering and the post-recovery pose error is under 2 centimeters.",
    dep: ["inside-out-slam","map-and-relocalization","comfort-vignette"]
  },
  "hand-detection": {
    s: "Finds hands in the cameras' images, decides which are left and right, and gives a region and rough pose to the stage that fits the finger skeleton.",
    d: "A neural network or classical detector runs on the tracking cameras and finds hand bounding boxes, usually per camera, then associates them over time and across cameras. It runs at a lower power than full fitting, and decides when full tracking is worth running. Detection must handle skin tones, gloves, jewelry, sleeves, objects held in hands and hands out of the field of view. The challenge is bias and robustness: training data that is not diverse leads to worse tracking for some people, and false detections, such as a face or a controller, waste compute and trigger input.",
    k: ["Detection then fitting vs one end-to-end model: cheaper and easier to gate by confidence, but the two stages have separate failure modes.", "Always-on detection vs only when no controller is held: hands are available at any moment, but the camera and compute cost is continuous."],
    p: ["A model trained on a narrow set of hands misses or jitters for some skin tones and hand shapes.", "A hand held near the face is mistaken for a second face and triggers phantom gestures."],
    v: "Test with a diverse group of at least 50 people and varied lighting; confirm detection rate and joint error show no group differing from the mean by more than a specified margin, and no false hand appears in 10 minutes of no hands.",
    dep: ["camera-capture-and-exposure","feature-extraction"]
  },
  "hand-skeleton-fitting": {
    s: "Estimates the 3D position and rotation of around twenty finger and wrist joints from camera images each frame, producing a skeleton applications can use or render.",
    d: "A model, often a neural network combined with a kinematic hand model, takes the cropped hand images from multiple cameras and returns joint positions that obey human joint limits. A temporal filter smooths the result. Output includes per-joint confidence and radius. It runs at tens to hundreds of hertz with strict latency. The hard part is occlusion and ambiguity: fingers hide each other, self-contact such as a pinch has no visible gap, and fast motion blurs, so the result is plausible but not always true.",
    k: ["Model-constrained fitting vs free per-joint prediction: anatomically valid hands without impossible bends, but less accurate for unusual hands and for contact poses.", "Heavy temporal smoothing vs light: stable, quiet hands, but extra lag that is felt during fast gestures."],
    p: ["A strong smoothing filter makes hands visibly trail behind during quick movement.", "Joint positions for hidden fingers are guesses that look confident, so applications trust them wrongly."],
    v: "Compare fitted joints against a motion capture glove on 20 minutes of varied gestures; confirm mean joint error under 1 centimeter, fingertip pinch distance error under 5 millimeters, and latency under the documented value.",
    dep: ["hand-detection","sensor-time-sync"]
  },
  "eye-tracking-pipeline": {
    s: "Uses small infrared cameras pointed at the eyes to compute gaze direction, pupil size and blinks, at high rate and low latency.",
    d: "Infrared LEDs create glints on the cornea and cameras image each eye. The pipeline finds the pupil and glints and uses a geometric or learned model to compute the optical axis and, with calibration, the gaze ray. Output goes to foveation, to selection and, with permission, to applications. It runs at 60 to over 200 hertz. The challenge is variation: glasses, eyelashes, makeup, eyelid shape and headset slip change image quality, and small angular errors become large on-screen errors.",
    k: ["Glint-based geometric model vs learned appearance model: precise and explainable for typical eyes, but sensitive to glasses; learned models are more tolerant but less predictable.", "High tracking rate vs low: low latency for foveation and saccade handling, but more power and heat."],
    p: ["Glasses reflect the IR illumination and the tracker fails for those users.", "Headset slip after calibration shifts every gaze estimate without any visible warning."],
    v: "Have 30 participants fixate nine on-screen targets and confirm mean angular error under 1.5 degrees across them, including glasses wearers, with tracking rate and latency at or above their specification.",
    dep: ["camera-capture-and-exposure","gaze-calibration","sensor-time-sync"]
  },
  "gaze-calibration": {
    s: "A short procedure where the user looks at known points so the system learns their individual eye geometry and corrects the raw gaze estimate.",
    d: "The user fixates a sequence of targets while the tracker records eye features. The system fits per-user parameters such as the offset between the optical and visual axes and corneal curvature, and stores them in a profile. Some systems recalibrate continuously from usage, such as from clicks. The profile applies on later sessions after a quick check. It is hard because calibration takes user effort, drifts with fit changes, and a bad calibration looks like a working one, so quality metrics must be reported.",
    k: ["Explicit calibration vs implicit adaptation: accurate and quick to verify, but interrupts the user; implicit adaptation needs no effort but converges slowly.", "Stored profile per user vs recalibrate each session: faster start, but must identify the user and stores a biometric profile."],
    p: ["Accepting a poor calibration without checking quality causes inaccurate selection later.", "A stored profile applied to another wearer gives large errors and silent mis-selection."],
    v: "Calibrate, then fixate a validation grid and confirm error under 1 degree; shift the headset by 3 millimeters and confirm the system detects the quality drop and prompts a recheck.",
    dep: ["eye-tracking-pipeline","biometric-data-gating"]
  },
  "face-expression-tracking": {
    s: "Estimates facial movements from cameras facing the mouth, eyes and brows, producing blend shape weights that drive an avatar's expressions.",
    d: "Inward-facing cameras see the lower face and eyes. A model maps the images to a set of coefficients for expressions such as jaw open, smile and brow raise, which avatars use. The headset hides much of the face, so the model infers hidden regions from visible ones. Audio can supplement for the mouth. It runs only when an application has permission. The hard parts are accuracy across faces and expressiveness, and privacy: expressions reveal emotion, and the underlying camera frames are biometric.",
    k: ["Camera-based expression tracking vs audio-driven animation: captures silent expression and eyes, but costs extra sensors, power and a privacy surface.", "Expression coefficients vs raw images to the application: applications never see the face, but are limited to the runtime's model of expression."],
    p: ["A model that does not match the avatar's rig produces uncanny or contorted faces.", "Sharing expression data with a remote service reveals emotional response to content."],
    v: "Have participants perform a standard set of expressions and confirm the reported coefficients track the expected ones with correlation above the target, and that an application without permission receives none.",
    dep: ["camera-capture-and-exposure","biometric-data-gating"]
  },
  "body-pose-estimation": {
    s: "Estimates the positions of elbows, torso and sometimes legs from limited sensors such as head and hand poses and cameras, so avatars can show a full body.",
    d: "Headset and controller poses constrain the upper body through inverse kinematics, and a learned model or downward-facing cameras fill in the torso and legs. Output is a skeleton with joint poses and confidence. The runtime may offer it as a standard skeleton for avatars. The difficulty is underdetermination: from three tracked points there are many plausible bodies, so the system infers likely poses, and mistakes such as legs in unnatural positions are very noticeable on social avatars.",
    k: ["Inference from sparse points vs dedicated body trackers: no extra hardware, but plausible rather than accurate, especially for legs and seated poses.", "Runtime-standard skeleton vs application-specific IK: avatars across applications look consistent, but cannot express unusual rigs."],
    p: ["Legs predicted while the user sits show a standing pose that conflicts with their view of themselves.", "Treating inferred joint positions as measured ones leads applications to use them for gameplay decisions."],
    v: "Compare estimated elbow and knee positions to motion capture during walking, sitting and reaching; confirm elbow error is under 5 centimeters and that estimated joints are flagged as inferred.",
    dep: ["controller-tracking","hand-skeleton-fitting","inside-out-slam"]
  },
  "biometric-data-gating": {
    s: "Controls access to eye, face, hand and body data, which can identify a person or reveal health and emotion, by minimizing, filtering and requiring explicit consent.",
    d: "The runtime treats gaze, pupil size, face expression, hand shape and body proportions as biometric. It delivers the least detail an application needs, for example a selection event rather than gaze, reduced rate or precision, and keeps raw images on device. Access is allowed per application, shown with an indicator and revocable. Derived data can still be identifying in combination, such as gaze with pupil response. The hard part is policy without breaking use cases: accessibility and avatars need some of the data, and every reduction costs fidelity.",
    k: ["Coarsened or event-based data vs raw streams: strong privacy and fewer ways to misuse it, but applications that need fidelity are limited.", "On-device processing vs service-side: raw sensor data never leaves, but services that analyze it cannot be built the same way."],
    p: ["Combining separately permitted streams, such as gaze and head pose, still identifies the user.", "A permission granted once is never revisited, long after the user forgot about it."],
    v: "Grant an application hand tracking only and confirm it cannot read gaze, pupil size or face data; revoke it and confirm all hand data stops within one frame and an indicator shows while access is active.",
    dep: ["permissions-and-privacy","eye-tracking-pipeline"]
  },
  "imu-sampling": {
    s: "Reads the gyroscope and accelerometer at high rate, often 500 to 1000 hertz, with precise timestamps, giving motion between camera frames and low-latency orientation.",
    d: "The IMU samples angular rate and acceleration and delivers batches with hardware timestamps over a bus to the tracking processor. Rates are high so the runtime can integrate quickly and predict ahead. Temperature, bias and scale errors are modeled; vibration from fans or haptics couples into the data. The driver must deliver samples without gaps and with accurate time. It is hard because integration amplifies errors: a small bias becomes a growing orientation error in seconds, and a one millisecond timing error looks like motion that did not happen.",
    k: ["High-rate raw samples vs filtered output from the sensor: the runtime controls fusion and latency, but must cope with the data volume and noise.", "Hardware timestamps vs arrival time: accurate time base across jitter, but needs a clock-sync path from sensor to processor."],
    p: ["Arrival-time stamping adds bus jitter that appears as orientation noise during fast rotation.", "Fan or haptic vibration saturates the accelerometer and corrupts fusion."],
    v: "Rotate the headset on a rate table at known speeds and confirm measured angular rate matches within 0.5 percent, with no sample gaps and a timestamp jitter under 100 microseconds over 10 minutes.",
    dep: ["sensor-drivers","sensor-time-sync"]
  },
  "sensor-fusion-filter": {
    s: "Combines inertial and visual estimates into one pose stream, with high rate from the IMU and long-term accuracy from the cameras, along with uncertainty.",
    d: "A filter integrates gyroscope and accelerometer data for a low-latency orientation and position, then corrects it each time a camera-based estimate arrives, adjusting biases. Output goes to the prediction stage, which extrapolates to display time. Where other sensors exist, such as magnetometers or external trackers, they enter the same filter. The hard part is tuning: weights between sensors depend on conditions, and a correction applied too sharply shows as jumps while one applied too gently lets drift show.",
    k: ["Complementary smooth correction vs applying each visual update directly: no jitter or jumps, but slower removal of drift.", "A single fused pose vs separate head and per-device filters: consistent frames, but a failure in one sensor degrades all."],
    p: ["Applying a visual correction in a single step produces a visible twitch every time a camera frame arrives.", "A magnetometer near a speaker or magnetic mount pulls yaw away steadily."],
    v: "Track on a rig for one hour, with induced dropouts of the cameras; confirm the fused orientation error stays under 0.5 degrees, with no step above 0.1 degrees when updates arrive.",
    dep: ["imu-sampling","visual-inertial-odometry","sensor-time-sync"]
  },
  "camera-capture-and-exposure": {
    s: "Controls the tracking and passthrough cameras: exposure time, gain, frame rate, synchronization and readout, so that images are usable for vision in changing light.",
    d: "Cameras run at 30 to 120 frames per second under an automatic exposure loop that picks short exposures for sharpness during motion and long ones in the dark, balancing noise. Tracking cameras are often global-shutter monochrome; passthrough cameras are color. Exposure and frame start are synchronized with the IMU and with the IR strobes for controllers. The difficulty is competing goals: tracking wants short exposures and consistent gain, passthrough wants natural brightness, and an auto-exposure that reacts slowly to a light switch loses tracking for a moment.",
    k: ["Short exposure with high gain vs long exposure: sharp features during head motion but more noise; long exposure is cleaner but blurs.", "Separate cameras for tracking and passthrough vs shared: each tuned for its job, but more cameras, power and cost."],
    p: ["Slow auto-exposure after walking from a dark room to a bright window loses tracking for half a second.", "Rolling-shutter distortion during fast head turns creates skew that fools the estimator."],
    v: "Switch lights from dark to bright and confirm tracking features recover within 200 milliseconds, with exposure timestamps in the metadata matching an external reference to within 100 microseconds.",
    dep: ["sensor-drivers","sensor-time-sync"]
  },
  "sensor-time-sync": {
    s: "Puts every sensor sample, camera frame and display event on one clock, so the fusion filter and compositor know exactly when each measurement happened.",
    d: "Each sensor has its own oscillator. The system aligns them with hardware trigger lines, shared timestamp counters or estimated offsets and drift rates, and converts everything to a single system clock. Wireless devices such as controllers add a link-latency estimate. The offset between the camera and IMU is often calibrated as a parameter. It is hard because errors hide: a fixed 2 millisecond offset between camera and IMU does not crash anything, but makes tracking wobble, and clock drift changes with temperature.",
    k: ["Hardware-triggered sensors vs software timestamp alignment: exact alignment without estimation, but needs board-level wiring and support from each sensor.", "Continuous offset estimation vs a one-time calibration: follows drift as the device warms, but adds estimator complexity and a failure mode."],
    p: ["Timestamping at driver receipt, not at sensor capture, bakes bus latency into the data.", "A clock offset that changes after a firmware update invalidates stored calibration."],
    v: "Flash an LED visible to a camera while the IMU is struck, and compare timestamps; confirm the offset between camera and IMU events is within 0.2 millisecond and stays so across a one-hour warm-up.",
    dep: ["sensor-drivers","coordinate-frames-and-time"]
  },
  "depth-sensing": {
    s: "Measures distance to surfaces using a time-of-flight sensor, structured light or stereo cameras, producing the depth images used for occlusion and room reconstruction.",
    d: "An active sensor emits infrared light and measures how long it takes to return, or the shift of a projected pattern; a passive one matches features between two cameras. Frames are filtered for noise and invalid areas, aligned to the color or display view, and delivered with timestamps. Active sensors cost power and struggle in sunlight and on black or shiny surfaces; stereo has trouble with plain walls. The hard part is combining sources and handling holes, because every sensor fails in a different way.",
    k: ["Active time-of-flight vs passive stereo: dense, accurate depth on plain surfaces, but power draw and sunlight limits; stereo is cheap and works outdoors but is noisy.", "Lower resolution at high rate vs high resolution at low rate: low latency for hand occlusion, or detail for room scanning."],
    p: ["Direct sunlight overwhelms an active sensor and returns no depth outdoors.", "Mirrors and black surfaces return wrong distances that become false geometry."],
    v: "Measure a flat wall at 0.5 to 4 meters with a reference rangefinder and confirm depth error under 1 percent of range, and that a black cloth and a window produce invalid pixels instead of confident wrong depth.",
    dep: ["sensor-drivers","camera-capture-and-exposure","sensor-calibration"]
  },
  "proximity-and-wear-sensors": {
    s: "Small optical or capacitive sensors that tell the system whether the headset is on a face, and how it sits, to wake or sleep the display and verify fit.",
    d: "An infrared proximity sensor between the lenses reads reflected light from the forehead or nose; capacitive pads can detect skin contact. Readings are thresholded with hysteresis and combined with motion. Some designs also report face distance, which informs eye relief. The sensor must work across skin tones, glasses and ambient light. The difficulty is calibration: thresholds that work on one face and room fail for others, producing displays that stay on when removed or turn off while in use.",
    k: ["Optical proximity vs capacitive contact: optical detects near but not touching, reliable on most faces but affected by ambient light; capacitive needs skin contact.", "Hysteresis and delay vs immediate response: avoids flicker between states, but delays wake by a fraction of a second."],
    p: ["Strong sunlight through the lenses reads as a face and keeps the display powered.", "A threshold tuned for light skin fails to detect darker skin reliably."],
    v: "Test with at least 20 faces including glasses and varied skin tones in daylight and darkness; confirm correct wear detection in at least 99 percent of 50 don and doff cycles each.",
    dep: ["sensor-drivers"]
  },
  "sensor-calibration": {
    s: "The measured geometry and error parameters of every sensor: camera intrinsics, camera-to-IMU transform, IMU bias and scale, and the pose of each sensor in the device frame.",
    d: "Factory procedures measure each camera's focal length and distortion, the rigid transforms between cameras and IMU, and inertial scale and misalignment. They are stored on the device and loaded at start. Online calibration refines some terms during use, such as IMU biases and slight camera shifts after temperature change or impact. Accuracy here limits all tracking. It is difficult because the device flexes with temperature and handling, so factory values slowly become wrong and the system needs to detect and compensate.",
    k: ["Factory calibration only vs online refinement: simple and predictable, but accuracy degrades with age and shocks; online refinement tracks them but can converge to wrong values.", "Calibrating cameras and IMU jointly vs separately: consistent relative geometry, but needs specialized rigs."],
    p: ["A dropped headset has a bent frame and the stored camera extrinsics are now wrong, producing drift.", "Online calibration absorbing a real drift error hides a hardware fault."],
    v: "Compare factory calibration with an independent calibration of the same unit before and after a thermal cycle and a drop test; confirm intrinsics differ under the specified pixel error, and that large shifts are flagged.",
    dep: ["firmware-and-updates","sensor-drivers"]
  },
});
