// Details for the VFX compositor plate, part 2: keying, roto and tracking, transforms, deep and 3D.
ATLAS.details("vfx-compositor", {
  "chroma-keyers": {
    s: "Estimates transparency for a subject filmed against a uniform colored backdrop by measuring how far each pixel's color is from the backdrop color.",
    d: "A chroma keyer converts pixels to a space where the screen color is easy to isolate, then computes alpha from the distance to that color, with controls for tolerance and softness. Better keyers solve per pixel for a foreground color, a background color and an alpha that explain the observed value, which preserves hair and translucency. Some sample the screen to model uneven lighting. It is hard because real screens have gradients, shadows and reflected light, and a single key rarely works on a whole shot, so artists build several keys for different regions.",
    k: ["Distance-based keys vs unmixing solvers: distance keys are fast and predictable; solvers recover fine detail and need cleaner samples and more tuning.", "One key for the whole frame vs several keys merged: one key is simple and compromises everywhere; several give control and cost more nodes and edge matching."],
    p: ["Aggressive tolerance eats into skin and semi-transparent edges, leaving a hard cutout look.", "A key tuned on one frame breaks when the lighting shifts later in the shot."],
    v: "Key a plate with a known matte rendered over a green backdrop, composite the result over a new background, and compare the alpha to the reference matte, checking the hair edge region numerically and visually.",
    dep: ["alpha-and-coverage","channel-sets","spill-suppression"]
  },
  "luma-and-difference-keys": {
    s: "Pulls a matte from brightness or from the difference between a plate and a reference, used where a colored screen is not available.",
    d: "A luma key thresholds a brightness or channel value, with a soft range, to make alpha, as for smoke on black or a bright sky. A difference key subtracts a clean plate or a locked-off background from the shot and thresholds the result, which isolates what moved. Both operate on a single measurement, so they tolerate less variation than a chroma key. Results are usually combined with shapes. It is hard because noise, auto exposure and shadows produce differences that are not the subject, and thresholds on noisy data produce flicker frame to frame.",
    k: ["Threshold with soft range vs hard threshold: a soft range keeps edges natural and lets background through; a hard threshold is clean and shows stair-stepped edges.", "Difference against a clean plate vs against a neighbor frame: a clean plate marks the subject; a neighbor frame finds motion and loses anything still."],
    p: ["Sensor noise in dark areas flickers across the threshold and the matte pulses.", "Shadows cast by the subject are keyed in as part of the subject."],
    v: "Apply a difference key to a subject filmed twice, with and without the subject, and confirm the matte equals the subject silhouette, with no matte value above 0.02 in the empty areas.",
    dep: ["clean-plates-and-garbage-mattes","alpha-and-coverage"]
  },
  "edge-treatment": {
    s: "Shrinks, grows, softens and blends the edge of a matte so the subject sits believably in a new plate instead of showing a cutout line.",
    d: "Edge tools erode or dilate alpha by fractions of a pixel, blur it, and extract an edge band that can be treated separately, for example by blending the foreground's edge color with the new background or by wrapping background light in. Good edges consider the original blur of the camera, which the matte must match. The tools work on floating-point alpha and rely on correct premultiplication to avoid dark or bright fringes. It is hard because an edge that is right at one resolution or sharpness looks wrong at another, and fixes in one frame crawl in the next.",
    k: ["Erode then soften vs soften then erode: eroding first removes the contaminated rim before blending; softening first keeps shape and may keep the green rim.", "Edge color from the foreground vs from the new background: foreground color keeps identity; background color blends naturally and can look washed out."],
    p: ["Eroding by whole pixels on a downscaled proxy produces a different edge at full resolution.", "Edge blur applied before unpremultiplying leaves a dark halo around bright subjects."],
    v: "Composite a keyed subject over a mid-gray plate, zoom to 400 percent at the edge, and confirm no dark or bright outline remains while a flat gray test over the same alpha shows none either.",
    dep: ["premult-handling","filter-kernels","chroma-keyers"]
  },
  "spill-suppression": {
    s: "Removes the color the screen has reflected onto the subject, replacing it with a neutral or background-appropriate tone.",
    d: "Spill appears as a green or blue cast on skin, hair and shiny objects. Suppression clamps the offending channel to a function of the other channels, as in limiting green to the average of red and blue, or replaces the spill color using the alpha and a plate of the new background. Advanced versions work in a space where hue can be rotated without shifting luminance. It is hard because suppression changes color globally: removing green from a forest scene or a person with green clothing damages legitimate colors, so it is usually limited by the matte.",
    k: ["Channel limiting vs hue-based replacement: channel limiting is simple and shifts luminance; hue replacement keeps brightness and is harder to tune.", "Global suppression vs matte-limited suppression: global treatment is quick and affects clothes; limiting it to edges preserves color and leaves interior spill."],
    p: ["Suppression applied to the whole frame desaturates legitimate green in the subject's clothing.", "Spill removed before keying changes the screen color and breaks the key."],
    v: "Take a gray card lit with the screen color, apply suppression, and confirm the measured red, green and blue values become equal within 2 percent while an unaffected gray reference does not change.",
    dep: ["chroma-keyers","working-space","matte-combination"]
  },
  "matte-combination": {
    s: "Combines several mattes with union, intersection, subtraction and inside or outside handling to form the final subject alpha.",
    d: "Keys of the core, the edge and the hair are made separately and merged: a hard inner matte, a soft outer matte and garbage shapes. The operations are arithmetic on alpha, usually maximum, minimum, multiply and subtract, applied to floating-point values that may exceed one. Order matters, since a union and an intersection do not commute. Final alpha must still be valid for premultiplied compositing. It is hard because many small combined mattes are difficult to read in the graph months later and accumulate errors at the edge.",
    k: ["Separate core and edge mattes vs one all-purpose matte: separate mattes allow targeted fixes at the cost of more nodes; one matte is simple and compromises everywhere.", "Clamp alpha to 0-1 vs allow overshoot: clamping keeps blend math valid; overshoot preserves data for later operations and can create glow."],
    p: ["Combining mattes with a plain add produces values above one that brighten the composite at overlaps.", "Subtracting before blurring leaves a hole where the inner matte was larger."],
    v: "Combine two known box mattes with union and subtraction, read the alpha at points inside both, inside one, and in neither, and confirm each matches the expected 1, 0 or 1, and 0 values.",
    dep: ["alpha-and-coverage","roto-shapes","edge-treatment"]
  },
  "clean-plates-and-garbage-mattes": {
    s: "Uses a plate of the empty background and rough shapes around the subject to remove screen defects and areas that the keyer should ignore.",
    d: "A clean plate is a frame, or several, with the subject absent, which is used in a difference or to rebuild an uneven screen so a keyer sees a uniform backdrop. Garbage mattes are loose shapes that force alpha to zero outside the subject, removing stage edges, rigs and lights. Clean plates are sometimes built by painting or averaging frames over time. It is hard because shots with moving cameras need a plate that tracks, and a garbage matte drawn too tight cuts the real subject when the performer reaches out.",
    k: ["Static clean plate vs tracked clean plate: static is cheap and works on locked cameras; tracked handles moves and depends on tracking quality.", "Tight garbage matte vs loose: tight removes more clutter and risks cutting the subject; loose is safe and leaves junk for later cleanup."],
    p: ["A garbage matte that lags the subject clips a hand that extends past its edge.", "A clean plate with a different exposure produces a visible ghost in the difference."],
    v: "Apply the garbage matte and a clean plate to a shot, step through every tenth frame, and confirm the screen area outside the subject has alpha zero while no part of the subject loses alpha.",
    dep: ["roto-shapes","planar-tracker","luma-and-difference-keys"]
  },
  "roto-shapes": {
    s: "Draws splines around a region frame by frame to make a precise matte for anything a keyer cannot isolate.",
    d: "A roto shape is a closed spline with control points and per-point feathering, rasterized with antialiasing into an alpha channel at the requested resolution. Shapes are grouped hierarchically so a moving limb can be built from parts, and each carries its own opacity and blend mode. Rasterization must be resolution independent and respect the display window. It is hard because accuracy is expensive: a human places points on key frames, interpolation between them drifts, and the matte must still look natural when edges are motion blurred.",
    k: ["Few points on many keyframes vs many points on few keyframes: few points keep shapes smooth and need frequent keys; many points track detail and break easily.", "Feather as a per-point value vs a global blur: per-point feather varies softness along an edge; global blur is quick and uniform."],
    p: ["Interpolated shapes between keys slip off the subject mid-motion, showing as a flicker at the edge.", "Rasterizing at proxy resolution then upscaling the matte produces soft edges in the final."],
    v: "Draw a shape around a printed test card on frame 1 and frame 50, render the alpha at full and half resolution, and confirm the full-resolution edge lies on the card boundary within half a pixel.",
    dep: ["shape-animation","alpha-and-coverage","display-and-data-windows"]
  },
  "shape-animation": {
    s: "Moves and deforms shapes over time through keyframes, tracked transforms and interpolation, including the motion blur of the shape itself.",
    d: "Shape points animate with keyframes on curves or follow a tracker through a transform. Interpolation between frames can be linear or smooth, and good tools allow a global transform on top of local point edits. Motion blur is applied by sampling the shape at sub-frame times and averaging. The resulting alpha is part of a pipeline where timing offsets matter. It is hard because artists rely on tracked data for most movement and then correct deviation by hand, and errors accumulate where tracked and hand-keyed animation overlap.",
    k: ["Track the whole shape vs animate points by hand: tracking is fast and drifts with perspective; hand animation is exact and slow.", "Shape motion blur by sub-frame sampling vs by blurring the result: sampling matches camera blur and costs several evaluations; blurring is cheap and wrong in direction and extent."],
    p: ["A tracked transform applied to a shape already drawn in tracked space doubles the movement.", "Sub-frame sampling disabled for roto but enabled for the plate leaves sharp mattes around blurred objects."],
    v: "Animate a shape moving ten pixels per frame with shutter set to half a frame, and confirm the rendered alpha has a five-pixel soft trail in the direction of motion.",
    dep: ["roto-shapes","point-tracker","curve-editor","motion-blur"]
  },
  "point-tracker": {
    s: "Follows small image patches from frame to frame to measure motion, producing position curves used to attach elements to a moving shot.",
    d: "The artist places a pattern box on a distinctive feature. For each frame the tracker searches a region around the predicted position, scoring candidate patches by correlation or by gradient-based alignment, with sub-pixel refinement. The result is a position per frame, and several tracks give translation, rotation and scale. Tracks can be lost to occlusion, motion blur or lighting change. It is hard because trackers drift and fail without announcing it, so quality depends on reviewing the confidence and offsetting the pattern update strategy.",
    k: ["Track against the first frame vs the previous frame: first-frame matching avoids drift and fails as appearance changes; frame-to-frame handles change and accumulates drift.", "Several simple tracks vs one planar track: simple tracks are fast and fragile; a planar track is more robust on surfaces and requires a surface."],
    p: ["A tracker slides onto a similar feature after an occlusion and the result looks plausible until it is composited.", "Tracking on a proxy loses sub-pixel precision that shows as jitter at full resolution."],
    v: "Track a corner on a clip with a known synthetic motion of 3.25 pixels per frame, and confirm the recovered positions match that motion within 0.1 pixel across 100 frames.",
    dep: ["filter-kernels","time-dependencies","image-sequences"]
  },
  "planar-tracker": {
    s: "Tracks a flat surface as a whole, solving a perspective transform for each frame from all of its pixels rather than a few points.",
    d: "The artist outlines a surface. The tracker estimates the homography that best aligns it from frame to frame, using intensity differences over the region and robust weighting so occluders are ignored. Output is a four-corner pin or matrix per frame, used to attach screens, signs and patches, and to move roto shapes. Because it uses many pixels it is less sensitive to noise and stays stable on low-contrast surfaces. It is hard where surfaces are not planar, reflective or heavily blurred, and failures show as a slow swim.",
    k: ["Whole-region alignment vs feature points: whole-region is robust and slower; feature points are quick and fail on low texture.", "Track with exclusion masks vs without: masks ignore passing people and need drawing; without them the solve is pulled by occluders."],
    p: ["A curved or bending surface tracked as a plane produces drift that accumulates toward the edges.", "Tracking through motion blur drifts toward the average position."],
    v: "Track a flat card in a shot with known corner positions, apply the solved transform to a grid image, and confirm grid lines stay locked to the card's corners within one pixel on every tenth frame.",
    dep: ["point-tracker","transform-2d","filter-kernels"]
  },
  "camera-solve-import": {
    s: "Brings in a solved camera path and tracked points from a dedicated match-moving process so elements can be placed in 3D space.",
    d: "Match-moving produces a camera with focal length, position and rotation per frame, plus a point cloud, from the footage. The compositor imports it through an interchange format and builds a camera object in its 3D space. Correctness depends on matching units, axis conventions, sensor size, and the film back; lens distortion must be handled consistently, either by undistorting the plate or distorting the CG. It is hard because small mismatches of conventions put a card in a plausible wrong place, and the errors only show on parallax.",
    k: ["Import the camera into the comp vs bake a tracked 2D transform: importing supports true 3D placement; 2D baking is simple and breaks under parallax.", "Undistort the plate vs distort the CG: undistorting makes working simple and resamples the plate; distorting the CG preserves the plate and adds an extra node to every render."],
    p: ["A unit or handedness mismatch flips or scales the scene and objects fly off.", "A solve with a wrong sensor size gives the right motion and the wrong perspective."],
    v: "Import a solve with a known marker point cloud, project a marker card at one of the points, and confirm it stays locked to the marker in the plate on the first, middle and last frames.",
    dep: ["scene-3d-projection","lens-distortion","image-attributes"]
  },
  "stabilization": {
    s: "Removes unwanted camera shake by applying inverse tracked motion, either to steady a shot or to work on a locked frame and reapply the motion afterward.",
    d: "Tracking data defines the plate's motion. The stabilizer applies the inverse transform per frame, optionally smoothing the path so deliberate camera moves remain while jitter goes. The common workflow stabilizes a shot, performs the paint or clean-up work on a steady image, then reapplies the original motion so the result matches the plate. Each transform resamples the image. It is hard because stabilizing and reapplying with different filters softens the image, and rolling shutter makes the motion non-rigid.",
    k: ["Stabilize then reapply vs track every element: stabilize and reapply makes a steady workspace at the cost of two resamplings; tracking each element avoids resampling and multiplies tracking work.", "Smooth the path vs lock completely: smoothing keeps natural camera feel and leaves residual motion; locking is exact and needs reapplication."],
    p: ["Two resampling passes with different filters make the plate visibly softer than the untouched sections.", "Rolling shutter skew is not removed by a rigid transform and cleanup patches slide."],
    v: "Stabilize a shot with a known applied shake, reapply the inverse motion, and compare to the original: confirm the difference image shows only resampling softness, below 1 percent in flat regions.",
    dep: ["point-tracker","transform-2d","filter-kernels"]
  },
  "paint-and-clone": {
    s: "Paints or copies pixels from another place or time to remove wires, marks and rigs, with strokes that are recorded and can be edited or animated.",
    d: "Strokes are stored as vector paths with brush parameters, so they can be reordered, transformed and revised, and are rasterized into the image on evaluation. Clone strokes sample from an offset in the same frame or another frame, optionally tracked so the source moves with the subject. Strokes can persist across a range of frames. It is hard because cleaning thousands of frames is labor, so procedural methods such as temporal median and tracked patches are preferred, and hand-painted fixes must match grain and blur to remain invisible.",
    k: ["Stored vector strokes vs baked paint layers: strokes stay editable and cost evaluation time on every frame; baked layers are fast and hard to adjust.", "Clone from the same frame vs from another frame: the same frame is always lit consistently and can repeat patterns; another frame gives true background and may mismatch lighting."],
    p: ["A cloned patch lacks the grain of its surroundings and shows as a smooth spot on playback.", "Paint applied before lens correction warps wrongly when the correction is later changed."],
    v: "Paint out a marker on a locked-off shot using a tracked clone source, play the sequence at full speed, and confirm no visible patch boundary or grain mismatch appears at the repaired position on any frame.",
    dep: ["point-tracker","time-dependencies","alpha-and-coverage"]
  },
  "transform-2d": {
    s: "Moves, rotates, scales and skews an image about a pivot, resampling it through a chosen filter and carrying motion blur if requested.",
    d: "A transform builds a matrix from translation, rotation, scale, skew and pivot, then maps output pixels back to input positions and samples the source with a filter. Transforms concatenate: consecutive transforms multiply their matrices and resample once, which preserves sharpness and speed. Bounding boxes are computed by transforming the input's box. It is hard because hidden resampling softens images and because identical-looking chains in different orders give different results, since rotation and scale do not commute.",
    k: ["Concatenate adjacent transforms vs resample each: concatenation is sharper and faster; separate resampling is simple and degrades with every node.", "Backward mapping vs forward splatting: backward mapping gives each output pixel exactly one lookup; forward splatting leaves holes and overlaps."],
    p: ["Fractional pixel translation with a sharp filter rings around high-contrast edges.", "A pivot set in the wrong coordinate space makes a rotation orbit instead of spin."],
    v: "Rotate an image by 90 degrees through four consecutive 90-degree transforms and confirm the result equals the original exactly, then rotate by 1 degree and compare to a reference resample.",
    dep: ["filter-kernels","regions-of-interest","display-and-data-windows"]
  },
  "filter-kernels": {
    s: "The weighting functions used to resample pixels when images are scaled or moved, trading sharpness, ringing and blur.",
    d: "A resampler evaluates a kernel centered at each output sample and sums nearby input pixels weighted by it. Nearest and linear are cheap but blocky or soft. Cubic and windowed-sinc kernels sharpen and can ring, and negative lobes can produce values below zero in floating-point images. When shrinking, the kernel must widen to prevent aliasing. Kernels operate on premultiplied color so transparent edges do not bleed. It is hard because every geometric operator inherits the choice and an unsuitable default shows up as softness or halos far from the node that caused it.",
    k: ["Sharp kernels vs smooth kernels: sharp kernels keep detail and can ring around edges; smooth kernels are safe and soften the image.", "Prefilter when downscaling vs sample directly: prefiltering avoids aliasing and costs time; direct sampling is fast and shimmers on motion."],
    p: ["Negative lobes produce negative pixel values near bright highlights that later math turns into dark outlines.", "Downscaling without widening the kernel creates moire on fine patterns."],
    v: "Downscale a pattern of fine alternating lines by a factor of four with the chosen kernel and confirm the result is a uniform gray, without moire bands, and an upscaled edge shows overshoot below the stated limit.",
    dep: ["premult-handling","float-precision","cpu-vector-kernels"]
  },
  "lens-distortion": {
    s: "Models and corrects the geometric warp of real lenses so plates and rendered elements align, applying distortion or its inverse.",
    d: "Distortion is described by a polynomial radial model, sometimes with tangential terms or a per-pixel map solved from grid shots. The compositor can undistort a plate, composite in a rectilinear space, then redistort the result, or distort the rendered elements to meet the plate. The correction needs an expanded working area because undistortion pulls in or pushes out the corners. It is hard because the model must match the one the camera solver used, and resampling loses sharpness at the edges.",
    k: ["Undistort the plate vs distort the CG: undistorting keeps the 3D simple and softens the plate; distorting the CG keeps the plate untouched and complicates every element.", "Parametric model vs sampled map: a parametric model is compact and may miss complex lenses; a map is accurate and heavy."],
    p: ["Redistorting with different parameters than the undistortion leaves the corners misaligned by several pixels.", "Failing to expand the working area crops the corners after undistortion."],
    v: "Undistort a gridded lens chart plate, check that the grid lines are straight within 0.5 pixel, then redistort and compare to the original, confirming a difference near zero except for resampling.",
    dep: ["filter-kernels","display-and-data-windows","camera-solve-import"]
  },
  "warps-and-meshes": {
    s: "Deforms images with control grids, splines and flow fields, used for morphs, corrections and matching shapes that move non-rigidly.",
    d: "A mesh warp moves control points of a grid and interpolates positions between them; a spline warp uses curves; a flow warp uses per-pixel vectors. The operator maps each output pixel back through the displacement and samples the source. Morphs blend two warps and a dissolve between aligned images. Displacement can come from textures, vectors or other images. It is hard to keep detail: strong deformation stretches or folds pixels and needs high-quality filtering, and animating many control points consistently is manual work.",
    k: ["Control-point warps vs per-pixel vector warps: control points are intuitive and sparse; vectors are exact and large and usually computed.", "Warp then blend vs blend then warp: warping first preserves each image's detail and aligns features; blending first is cheaper and blurs misaligned features."],
    p: ["Pixels folded by an over-strong deformation duplicate and smear the image.", "Vectors encoded in an 8-bit image quantize into visible steps."],
    v: "Warp a regular grid by a smooth sinusoidal displacement of known amplitude and confirm sampled grid-line positions match the analytic displacement within a pixel, with no folded areas.",
    dep: ["filter-kernels","optical-flow-retime","channel-sets"]
  },
  "motion-blur": {
    s: "Adds or removes the streaking caused by movement during the camera's exposure, using motion vectors or sub-frame sampling.",
    d: "Motion blur is the average of an object's positions across the shutter interval. A compositor produces it by sampling a transform or shape at several sub-frame times, or by smearing pixels along per-pixel vectors supplied by a renderer or optical flow. Shutter angle sets how long the blur is. Elements composited without blur look pasted on, and added blur must respect occlusion so a blurred foreground does not smear background. It is hard because vector-based blur approximates real occlusion and fails at depth discontinuities.",
    k: ["Sub-frame sampling vs vector blur: sampling is correct for transforms and costs several evaluations; vector blur is single pass and approximate at edges.", "Blur before compositing vs after: blurring an element first is correct per object; blurring the finished comp smears objects at different depths."],
    p: ["Vector blur drags foreground color across a background edge, creating a halo.", "A shutter angle that does not match the plate makes a CG element look sharper or blurrier than live action."],
    v: "Move a bright dot at known speed with a 180-degree shutter and confirm the streak length is half the per-frame distance, and the plate and CG dots match in streak length.",
    dep: ["transform-2d","shape-animation","channel-sets"]
  },
  "optical-flow-retime": {
    s: "Changes the speed of footage by estimating per-pixel motion between frames and synthesizing new in-between frames along it.",
    d: "A retimer needs frames at times that were never photographed. Frame blending averages neighbors and ghosts. Optical flow estimates motion vectors between frames, warps each neighbor toward the target time and blends, which yields smoother slow motion. Occlusions, repeating patterns and fast motion break the estimate, and results are often cleaned with masks or by mixing methods. The retimer needs frames outside the requested range, which affects dependencies. It is hard because errors appear as warping of fine detail and are frame-dependent.",
    k: ["Frame blending vs flow-based interpolation: blending is cheap and ghosts; flow gives smooth motion and invents artifacts at occlusions.", "Retime before compositing vs after: retiming plates first keeps composite elements in sync with the final timing; retiming after avoids altering the source and requires every element to share the curve."],
    p: ["Flow errors around thin moving objects produce wobbling distortions that are visible only in motion.", "Retiming a plate but not its matte or CG leaves elements out of sync."],
    v: "Retime a clip with a ball moving at a known constant speed to half speed, and confirm the interpolated frames show the ball at the midpoints of its neighboring positions, within a pixel, without a double image.",
    dep: ["warps-and-meshes","time-dependencies","motion-blur"]
  },
  "merge-and-blend-ops": {
    s: "Combines a foreground over a background and other pairwise operations such as add, multiply, screen and in or out, using alpha-aware formulas.",
    d: "The core operation is the over equation: result equals foreground plus background times one minus foreground alpha, valid for premultiplied inputs. Other modes include plus for light, multiply for shadows, screen for glows, and mask operations that keep or remove regions by alpha. Operators work per channel across the union of the inputs' windows and decide what happens outside each. Many blend modes were designed for display-referred images and behave differently on scene-linear values above one. The difficulty is that a mode is only right with matching premultiplication and color space on both inputs.",
    k: ["Merge in scene-linear space vs display space: linear matches light physically and looks different from legacy habits; display space matches familiar looks and breaks light addition.", "Operate on every channel vs selected channels: every channel keeps passes aligned; selected channels save time and leave auxiliary data inconsistent."],
    p: ["Compositing a straight foreground with a premultiplied formula brightens its edges.", "A screen blend on values above one clips highlights that should have remained bright."],
    v: "Over a 50 percent alpha white square on a black background and confirm the result is 0.5 in the covered area, then repeat in linear and display spaces and confirm the display value is the transform of 0.5.",
    dep: ["premult-handling","alpha-and-coverage","working-space","channel-sets"]
  },
  "premult-handling": {
    s: "Converts between premultiplied and straight color at the points where operations need one or the other, and tracks which an image currently is.",
    d: "A premultiplied pixel stores color already scaled by its alpha, which compositing and filtering require. Color operations such as grading need unpremultiplied color so edge pixels are corrected as the underlying subject, not as semi-transparent mixtures. The common pattern wraps a grade in unpremultiply and premultiply. Some pipelines carry the state as metadata; many rely on conventions. Division by zero alpha must be handled. It is hard because mistakes are subtle: edges dark or bright by a small amount, which survives reviews until the final composite.",
    k: ["Carry a premultiplied flag in metadata vs rely on convention: a flag prevents misuse and needs every operator and file format to preserve it; convention is simple and fails silently.", "Premultiply early vs late: early keeps operators consistent; late preserves straight color for grading and risks inconsistent edges."],
    p: ["Grading premultiplied color pulls edge pixels toward black or toward a wrong hue, leaving a visible halo.", "Unpremultiplying where alpha is nearly zero amplifies noise into bright speckles."],
    v: "Grade a subject with a soft alpha edge on a flat gray background with and without unpremultiply, and confirm the correct path leaves no outline when composited over the same gray at 400 percent zoom.",
    dep: ["alpha-and-coverage","channel-sets","image-attributes"]
  },
  "deep-samples": {
    s: "Stores a variable number of samples per pixel, each with color, alpha and a depth range, so an image describes what lies at every distance.",
    d: "A deep pixel holds a list of samples ordered by depth. Each has a front and back depth, color, alpha and sometimes an object identifier. Renderers produce them by keeping every volumetric or transparent contribution instead of flattening. Because the count varies, the data is stored with per-pixel counts and a packed array, and files can reach gigabytes per frame. It is hard because memory and disk costs scale with scene complexity, and operators must handle sample ordering, overlaps and sub-pixel coverage correctly.",
    k: ["Keep every sample vs pre-merge close samples: keeping every sample preserves accuracy and size; merging samples is smaller and loses separation at close depths.", "Depth ranges vs single depth points: ranges represent volumes correctly; single points are compact and wrong for fog and smoke."],
    p: ["Unlimited sample counts on dense volumes produce frames too large to load on a workstation.", "Samples that overlap in depth are combined with the wrong ordering and leave visible banding."],
    v: "Read a deep image of two overlapping translucent layers, list the samples at one pixel, and confirm they appear in depth order with the expected colors, alphas and depth ranges.",
    dep: ["multipart-containers","pixel-types","memory-budgeting"]
  },
  "deep-merge-flatten": {
    s: "Merges deep images by combining their samples in depth order and flattens the result to an ordinary image when needed.",
    d: "A deep merge concatenates the samples of its inputs per pixel, sorts them by depth, and optionally splits overlapping samples so transparency composites correctly. No matte is required: occlusion follows from depth, so an object that moves in front of fog or behind glass composites right. Flattening composites the samples front to back into color and alpha. It is hard because the merge result can be huge, so evaluation is delayed until flattening, and because sub-pixel depth precision matters for sharp edges between close surfaces.",
    k: ["Merge deep and flatten once vs flatten each element first: merging deep gives correct occlusion for interpenetrating objects at heavy cost; flattening first is cheap and requires mattes.", "Split overlapping samples vs leave them: splitting is correct for volumes and multiplies sample count; leaving them is smaller and slightly wrong."],
    p: ["Flattening early throws away depth that a later change in the scene needed.", "Floating-point depth error makes coplanar surfaces flicker between orders."],
    v: "Merge two deep elements where one passes through the other, flatten, and confirm the result matches a single render of both together, with a maximum per-pixel difference below 1 percent.",
    dep: ["deep-samples","merge-and-blend-ops","memory-budgeting"]
  },
  "deep-holdouts": {
    s: "Cuts one deep element by another's depth, so only the parts that lie behind or in front of it remain, without drawn mattes.",
    d: "A holdout uses a deep image, a depth image or geometry as a depth mask. Samples of the input that lie behind the holdout's surface are removed or reduced by its alpha, so a character appears behind a foreground object accurately, including smoke that is partly in front. Holdouts compare sample depths per pixel and may need to split samples at the boundary. It is hard because the quality depends on depth precision at edges and on whether the holdout object is itself motion blurred or semi-transparent.",
    k: ["Deep holdout vs matte holdout: deep holdout is exact in depth and needs deep renders of the occluder; a matte is light and fails for interpenetrating or partly translucent objects.", "Hard depth cut vs soft depth transition: hard is exact and aliased; soft handles anti-aliased edges and leaks slightly."],
    p: ["Holdout objects with depth values that differ slightly from the rendered scene cut visible holes.", "Ignoring the occluder's transparency makes smoke appear fully blocked."],
    v: "Hold out a deep sphere behind a deep plane and confirm the sphere is hidden only in the area the plane covers, with no gaps at the plane's edge and correct partial coverage on anti-aliased pixels.",
    dep: ["deep-samples","deep-merge-flatten","depth-compositing"]
  },
  "depth-compositing": {
    s: "Uses a single depth value per pixel from a render to combine elements, apply fog or defocus, and resolve which is in front.",
    d: "A depth channel records the distance from the camera at each pixel. Compositors use it to merge opaque elements by nearest depth, to add atmospheric fog proportional to distance, to apply depth of field by blurring according to distance from the focal plane, and to select slices of space. A single value cannot hold transparency or edges well, so anti-aliased edges and glass are wrong. It is hard because depth must not be filtered or blurred like color, and conventions differ: distance from the camera or from its plane, and linear or inverse values.",
    k: ["Single depth value vs deep samples: single depth is small and enough for opaque scenes; deep samples are correct for transparency and heavy.", "Nearest-neighbor depth sampling vs filtered: nearest keeps discontinuities sharp and aliases; filtered creates false depths between objects."],
    p: ["Averaging depth at an anti-aliased edge makes a point floating between foreground and background.", "Mixing depth conventions between renderers flips the order of elements."],
    v: "Merge two renders of overlapping spheres by depth and confirm the nearer sphere is in front everywhere, then apply a focal plane blur and confirm pixels at the plane's depth stay sharp.",
    dep: ["channel-sets","filter-kernels","merge-and-blend-ops"]
  },
  "scene-3d-projection": {
    s: "A 3D space in the compositor where cameras, cards and simple geometry carry images that are projected and rendered back into 2D.",
    d: "The scene holds a camera, lights, transform hierarchy and geometry such as cards and imported meshes. Textures can be projected from a camera onto geometry, which turns a painted frame into a surface and lets a small camera move produce true parallax. A scanline renderer rasterizes the scene with simple shading and outputs color, alpha, depth and vectors. It is hard because the renderer is deliberately basic, so artists must decide when 3D in comp is enough and when to ask for a full render, and because projection needs consistent camera data.",
    k: ["Basic in-comp 3D vs sending to a full renderer: in-comp is instant and limited; full rendering is accurate and slow and needs a round trip.", "Project from the shot camera vs a separate camera: the shot camera keeps parallax honest; a separate camera is flexible and easy to misalign."],
    p: ["A projection camera whose frame is changed later slides the texture across geometry.", "Cards without a depth channel written composite in the wrong order with other renders."],
    v: "Project a gridded frame from the shot camera onto a card, render through the same camera, and confirm it reproduces the frame, then move the camera slightly and confirm the grid shows parallax against a second layer.",
    dep: ["camera-solve-import","transform-2d","channel-sets"]
  },
  "position-normal-relight": {
    s: "Uses rendered position and normal passes to change lighting, add fog or select regions in space after the render is finished.",
    d: "A position pass stores the 3D coordinates of the surface at each pixel, and a normal pass stores its orientation. With them, the compositor can compute new light contributions with a simple formula, make masks that follow a volume in space, and apply effects tied to world distance. The passes must be unfiltered and in a known space and unit. Relighting in comp is faster than re-rendering, though it only approximates shadows and indirect light. It is hard because the values are data and break when processed like color.",
    k: ["Relight in comp vs re-render: comp is instant and approximate; re-rendering is correct and takes time.", "World-space vs camera-space normals: world space is stable under camera motion; camera space is convenient for screen-aligned effects."],
    p: ["Antialiased edges blend neighboring normals into a vector that points nowhere and lights as a dark rim.", "Passes converted to a display space give meaningless values."],
    v: "Relight a sphere render with a new directional light using its normal pass, and compare to a reference render under the same light, confirming diffuse shading matches within 3 percent away from shadows.",
    dep: ["channel-sets","depth-compositing","working-space"]
  },
});
