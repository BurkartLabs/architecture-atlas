// Details for the 3D modeling tool plate, part 2: modeling, sculpting, UV mapping, rigging.
ATLAS.details("modeling-3d", {
  "modifier-stack": {
    s: "An ordered list of non-destructive operations attached to an object, each taking the previous result as input, so the base mesh stays editable while the output grows richer.",
    d: "Each modifier has parameters, a type and enable flags for viewport and render. Evaluation feeds the base mesh to the first modifier, then its output to the next. Some modifiers need extra inputs such as another object, a vertex group or a curve, which become dependencies of the object. Order matters: mirror then subdivide is not the same as subdivide then mirror. Difficulty comes from cost, because every change below recomputes everything above.",
    k: ["Linear stack vs graph: a stack is easy to read and reorder, but cannot express branching or shared intermediate results that a node graph handles.", "Separate viewport and render settings vs one setting: separate levels keep editing fast and final output detailed, but the two can differ in unexpected ways."],
    p: ["Reordering two modifiers changes the result and artists do not notice until render.", "A stack with a modifier referencing the object itself creates a dependency cycle that breaks evaluation."],
    v: "Add mirror and subdivision modifiers, swap their order, and confirm the results differ as expected; then disable one in the viewport only and confirm render output still includes it.",
    dep: ["modifier-evaluation", "dependency-graph", "attribute-domains"]
  },
  "modifier-evaluation": {
    s: "Runs the modifier stack on a copy of the base mesh, caches the result, and reruns only the part of the stack affected by a change, possibly on worker threads.",
    d: "The evaluator copies or shares the base mesh data, runs each modifier, and stores the outcome as the evaluated mesh used by the viewport and renderers. Modifiers that only change positions can reuse topology; others rebuild it. Caches at stack positions let a change to the last modifier avoid rerunning the first. The hard part is deciding what can be shared safely and invalidated exactly, because wrong caches show stale geometry, and no caches make every tweak slow.",
    k: ["Cache at every stage vs only the final: stage caches speed up late edits, but multiply memory use on heavy meshes.", "Deform-only fast path vs full rebuild: moving positions without rebuilding topology is fast for animation, but needs modifiers to declare what they change."],
    p: ["A modifier that declares it changes only positions but secretly alters topology corrupts shared data.", "Cached results stay after an input object is deleted, and the viewport shows geometry from an object that no longer exists."],
    v: "Scrub an animation of a character with a heavy stack, and confirm only the deforming modifiers re-evaluate each frame, as shown by an evaluation counter, while the frame rate holds.",
    dep: ["modifier-stack", "dependency-graph", "task-scheduler", "attribute-domains"]
  },
  "subdivision-surfaces": {
    s: "Refines a coarse control mesh into a smooth surface by repeatedly splitting faces with weighted averaging rules, so artists model low and render high.",
    d: "Each level splits every face and repositions vertices using neighborhood rules, so the limit surface is smooth. Creases and boundary rules control sharpness. GPU evaluation keeps the coarse mesh and computes refined positions in a shader, avoiding a CPU copy. Attributes such as UVs are interpolated with their own rules. Hard parts are irregular vertices where not exactly four faces meet, memory growth of about four times per level, and matching results between GPU, CPU and the final renderer.",
    k: ["GPU subdivision vs CPU: GPU evaluation is quick for animation and large levels, but the refined mesh is not available for CPU operators or physics.", "Adaptive refinement vs uniform: adaptive spends polygons only where curvature or screen size needs them, but needs crack-free stitching between levels."],
    p: ["Raising the level from four to six on a dense base mesh multiplies memory sixteen times and exhausts the GPU.", "UV boundaries interpolated with the wrong rule shift texture seams between viewport and render."],
    v: "Subdivide a cube to a limit surface, then add a crease and confirm the shape matches a reference limit-surface evaluation within tolerance and viewport and render display identical silhouettes.",
    dep: ["modifier-evaluation", "creases-edge-flags", "gpu-batch-cache", "attribute-domains", "topology-queries"]
  },
  "boolean-ops": {
    s: "Combines solid meshes by union, difference or intersection, by computing where surfaces cross and keeping the faces on the correct side.",
    d: "The operation finds all triangle-triangle intersections, splits faces along the intersection curves, classifies each fragment as inside or outside the other operand, and keeps the right ones. Exact arithmetic or robust predicates decide intersections reliably. Attributes such as UVs and materials carry across new faces. The hard part is non-manifold or open inputs, where inside is undefined, coplanar overlaps, and speed on meshes with millions of triangles.",
    k: ["Exact-arithmetic kernel vs floating-point with tolerances: exact never leaves holes but is slower; tolerances are fast but fail on coplanar and near-coincident faces.", "Mesh booleans vs implicit-field booleans: mesh results keep sharp edges and existing topology, but fail on bad input, while fields always succeed and lose detail."],
    p: ["Open or self-intersecting input gives garbage inside and outside classification and results with missing faces.", "Chained booleans accumulate sliver faces that later break bevels and subdivision."],
    v: "Subtract a cylinder from a cube with exactly coplanar faces, and confirm the output is a closed manifold with correct volume, no zero-area triangles, and carries the original UV mapping on untouched faces.",
    dep: ["robust-predicates", "bvh-trees", "topology-queries", "attribute-domains", "ngon-triangulation"]
  },
  "bevel-inset": {
    s: "Replaces sharp edges or corners with rounded or chamfered strips, and shrinks faces inward, adding the geometry needed to hold light highlights.",
    d: "Bevel offsets edges along adjacent faces by a width, builds profile segments between the offset lines, and resolves corners where several beveled edges meet. Controls include width types, profile shape, miter handling and limits that clamp the width on short edges. Inset moves the boundary of a face inward and bridges the gap. The difficulty is vertex junctions with different valence, overlapping offsets on small features, and carrying UVs and normals correctly.",
    k: ["Fixed-width vs proportional bevel: fixed width gives consistent real-world edges, but overlaps on small features; proportional never overlaps, and varies in visible size.", "Local operator vs modifier: an operator edits topology once and permits manual cleanup, while a modifier stays adjustable but cannot be hand-fixed."],
    p: ["Width larger than the shortest adjacent edge makes faces overlap and produces inverted geometry.", "Bevels at vertices where five or more edges meet leave n-gons that shade badly after smoothing."],
    v: "Bevel all edges of a cube with three segments and a 0.1 width, and confirm that the result has no overlapping faces, outward normals on every face, and consistent profile curvature at corners.",
    dep: ["boundary-rep-mesh", "topology-queries", "normals-smoothing", "attribute-domains", "creases-edge-flags"]
  },
  "extrude-loop-tools": {
    s: "The core local editing operators: pushing faces or edges outward into new geometry, inserting edge loops across a face ring, bridging, merging, dissolving and filling.",
    d: "Each operator is a sequence of small mesh edits on the editing structure: duplicate the selected elements, connect them to originals, fill the gaps and update selection. Loop tools walk the face ring using adjacency and insert parallel edges. Operators are expressed as chains of lower-level steps that ensure the mesh stays valid. The difficulty is correctness at boundaries and non-manifold cases, plus preserving attributes and selection afterward.",
    k: ["Composable low-level operations vs one-off code per tool: composition keeps validity checks in one place and shortens new tools, at some cost in speed.", "Immediate topology edits vs deferred changes: immediate edits show results at once but leave the mesh invalid between steps unless carefully ordered."],
    p: ["Extruding a face that shares an edge with an unselected face leaves duplicated, overlapping geometry.", "Loop insertion across a triangle ends the loop early without a warning."],
    v: "Extrude one face of a cube, insert a loop cut across the new side, and confirm the mesh is manifold with consistent winding, correct vertex count, and selection contains exactly the new loop.",
    dep: ["boundary-rep-mesh", "topology-queries", "selection-system", "attribute-domains", "operator-framework"]
  },
  "knife-bisect": {
    s: "Cuts new edges across existing faces along a drawn path or plane, splitting faces and connecting intersection points into valid topology.",
    d: "A knife tool projects the pointer path onto the surface, finds where it crosses edges and faces, inserts vertices at each crossing and connects them within each face. Bisect uses an exact plane instead, optionally removing one side. Cutting across hidden geometry needs a choice about visibility. The hard cases are cuts through vertices, cuts through coplanar faces, and snapped cuts that nearly coincide with existing edges, which produce slivers.",
    k: ["Cut visible faces only vs cut through the object: visible-only matches what the artist sees, but through-cuts are needed for planar slicing and cost more.", "Snapping cut points to existing vertices and edges vs exact positions: snapping avoids slivers, but moves the cut away from where the pointer drew it."],
    p: ["A cut passing within floating-point tolerance of a vertex creates a near-zero-length edge that later operators reject.", "Cutting a face with holes connects points across the hole and produces an invalid face."],
    v: "Draw a knife cut across a quad-mesh plane at an arbitrary angle, and confirm every new face is planar-valid, no edge shorter than tolerance exists, and total area equals that of the original.",
    dep: ["picking-hit-testing", "boundary-rep-mesh", "ngon-triangulation", "robust-predicates", "snapping-constraints"]
  },
  "remesh-decimate": {
    s: "Rebuilds a mesh with new, more even topology or fewer polygons, while approximating the original shape, for cleanup, retopology and level-of-detail.",
    d: "Remeshing samples the surface into voxels or a field and extracts a new surface, or relaxes a quad layout toward guide directions. Decimation collapses edges in order of an error metric, such as quadric distance, until a target count is reached, protecting borders, seams and sharp features. The difficulty is preserving attributes and features: UV seams, material boundaries and creases, and avoiding triangles with long slivers or flipped normals.",
    k: ["Voxel remesh vs topology-guided quad remesh: voxel is robust and simple but loses sharp detail; guided quad remesh gives clean flow, but needs good input and fails on difficult shapes.", "Collapse with error metric vs clustering: metric-based keeps shape better, while clustering is faster and gives uniform polygons."],
    p: ["Decimation across UV seams tears textures because seam vertices were merged with their neighbors.", "A voxel size larger than the thinnest feature deletes thin parts such as fingers or fabric edges."],
    v: "Decimate a scanned mesh to ten percent, and confirm the maximum surface deviation stays within a stated tolerance, UV seams remain intact on a checker texture, and no flipped normals appear.",
    dep: ["topology-queries", "sdf-voxels", "attribute-domains", "closest-point-queries", "creases-edge-flags"]
  },
  "procedural-node-geometry": {
    s: "Builds and changes geometry from a graph of nodes that process meshes, curves, points and attributes, so shapes become parametric and reusable.",
    d: "Each node takes geometry and fields, and outputs new geometry. Fields are functions evaluated lazily per element, so one input like a noise or a distance can drive position, density or color. The graph is evaluated on demand, with caching and multithreading across elements. It is hard because of type rules between geometry kinds, evaluation cost on dense data, error reporting inside deep graphs, and giving artists predictable behavior with undefined or empty input.",
    k: ["Lazy field evaluation vs eager attribute arrays: fields compose without storing temporary arrays, but are harder to debug because there is no value to inspect until it is evaluated.", "Instances kept as references vs realized geometry: references scale to millions of copies, but downstream nodes must understand instances."],
    p: ["Realizing millions of instances by accident multiplies memory and freezes the application.", "A node error deep in the graph shows only at the output, and the artist has to bisect by muting nodes."],
    v: "Scatter points on a surface with a density field and instance a mesh on each; confirm that changing the seed gives different positions, 100,000 instances stay interactive, and node inspection shows per-point values.",
    dep: ["attribute-domains", "dependency-graph", "task-scheduler", "shader-node-graph", "instancing-linking"]
  },
  "mirror-symmetry": {
    s: "Applies edits on both sides of a plane or across rotations at once, either live while editing or by generating mirrored geometry that stays welded at the center.",
    d: "A mirror modifier duplicates the mesh across an axis and merges vertices near the plane within a distance. In edit and sculpt modes, symmetry settings mirror each tool action by finding the matching vertex on the other side through a spatial lookup, cached for speed. Radial symmetry repeats around an axis. The difficulty is meshes that are not perfectly symmetric, matching topology lost after edits, and keeping UVs and weights consistent between halves.",
    k: ["Geometric mirroring via a modifier vs topological mirroring: geometric works on any shape but depends on exact positions; topological follows connectivity, so it survives movement but needs symmetric topology.", "Merge threshold large vs small: large closes seams reliably, but welds vertices that should stay apart."],
    p: ["Vertices slightly off the mirror plane stay unmerged, leaving a visible seam and duplicated vertices at the center.", "Symmetric edits applied to a mesh that has asymmetric topology change the wrong side."],
    v: "Enable X symmetry on a symmetric head model, move a vertex, and confirm its mirror counterpart moves by the exact negated offset; then check that vertices on the plane stay on the plane.",
    dep: ["modifier-stack", "bvh-trees", "topology-queries", "attribute-domains", "brush-engine"]
  },
  "brush-engine": {
    s: "Applies sculpting and painting brushes to the surface: finds affected points, evaluates strength with falloff, and updates positions, masks or colors in place.",
    d: "On each stroke sample the engine finds vertices within the brush radius using a spatial tree, computes a weight from distance, pressure and texture, and applies a brush-specific action such as displace, smooth, grab or inflate. Normals and bounding trees are updated for the changed region only. The hard part is doing this on millions of vertices within a frame, using threads, and keeping consistent results regardless of sample spacing.",
    k: ["Updating only the touched region vs recomputing the whole mesh: partial updates give interactivity on huge meshes, but need accurate dirty tracking to avoid visible seams.", "Per-sample actions vs accumulated stroke buffers: accumulation prevents stroke self-overlap from over-applying, but needs extra memory and a rule for ordering."],
    p: ["Fast strokes skip over mesh regions because samples are spaced farther than the radius.", "Region updates miss neighbor vertices whose normals depend on the changed ones and show lighting seams."],
    v: "Drag a smooth brush across a ten-million-vertex mesh and confirm the frame rate stays interactive, the changed region matches a full recompute exactly, and repeating the stroke at different speeds gives equal results.",
    dep: ["stroke-sampling", "bvh-trees", "task-scheduler", "normals-smoothing", "gpu-batch-cache"]
  },
  "stroke-sampling": {
    s: "Turns raw pointer, pressure and tilt events into evenly spaced brush dabs along a smooth path, with falloff curves shaping each dab's influence.",
    d: "Input events arrive at irregular rates. The sampler interpolates a path, optionally smooths or lags it, and emits dabs at a spacing relative to brush radius. Each dab evaluates a falloff curve over distance and maps pressure or tilt to strength and size. For surface strokes, each dab is projected to the surface by a ray cast. The challenge is stable output: spacing independent from event rate, smooth curves without lag, and prediction that does not overshoot.",
    k: ["Spacing by distance vs by time: distance gives results independent of pointer speed, but time-based gives airbrush buildup when held still.", "Stroke smoothing with lag vs raw input: smoothing steadies shaky lines but makes the brush trail behind the pen."],
    p: ["Event rate differences between mouse and pen produce visibly different stroke density for the same gesture.", "Projecting dabs on a fast-moving surface point that changed in the middle of the stroke makes the line jump."],
    v: "Replay a recorded stroke at 60, 125 and 240 events per second and confirm the dab positions along the path differ by less than a small fraction of the radius, and total applied strength is equal.",
    dep: ["pen-tablet-input", "closest-point-queries", "math-library", "picking-hit-testing"]
  },
  "dynamic-topology": {
    s: "Adds and removes mesh detail during sculpting, subdividing triangles where the brush needs more resolution and collapsing them where it does not.",
    d: "The mesh is held in a spatial tree whose leaves track small triangle groups. As the brush passes, edges longer than a detail threshold are split, shorter ones collapsed, and the tree updated locally. This lets artists sketch freely without planning topology first. It is hard because it throws away UVs and other attributes it cannot interpolate, produces irregular triangle meshes, and requires careful local rebuild to remain fast.",
    k: ["Dynamic detail vs fixed multiresolution: dynamic allows any shape change, but breaks UVs and topology for animation; multires keeps structure but cannot add detail where none exists.", "Detail by screen size vs world size: screen-relative detail adapts to zoom, but results vary with view; world size is stable and can be very heavy."],
    p: ["Sculpting at a fine detail size over a large area creates millions of triangles and runs out of memory.", "Existing UV maps are lost when topology changes, so texture work done earlier is invalid."],
    v: "Sculpt a bump onto a flat sphere with dynamic topology, and confirm triangle count rises only near the stroke, edge lengths stay inside the threshold range, and no non-manifold edges appear.",
    dep: ["bvh-trees", "topology-queries", "remesh-decimate", "attribute-domains", "brush-engine"]
  },
  "multires-levels": {
    s: "Stores sculpted detail as displacements over a subdivision hierarchy, so one object can be edited at any level and the finer levels follow coarse changes.",
    d: "A coarse base mesh is subdivided to several levels. Each level stores displacement vectors in a local tangent frame, so a change at a lower level moves higher levels with it. Switching levels reprojects data. Detail is applied at the highest level and propagates to lower ones. The difficulty is keeping the base mesh frozen once detail exists, since changing its topology invalidates displacements, and memory use that quadruples each level.",
    k: ["Displacements in tangent frames vs absolute positions: tangent frames let coarse edits carry detail, but cost extra storage and conversions at each level change.", "Multires vs dynamic topology: multires keeps UVs and animation compatibility; dynamic gives free-form resolution but loses structure."],
    p: ["Editing base mesh topology after sculpting detail either is blocked or destroys the stored displacement.", "A high level count makes every mode switch slow because all levels are reprojected."],
    v: "Sculpt detail at level four, edit the level-one shape, and confirm the detail follows the coarse change in correct orientation, with no cracks between faces at the boundaries.",
    dep: ["subdivision-surfaces", "attribute-domains", "brush-engine", "native-file-format"]
  },
  "masks-face-sets": {
    s: "Per-vertex and per-face data that limit where sculpt tools act: masks protect or isolate regions, and face sets group surface patches that can be hidden or edited together.",
    d: "A mask is a scalar attribute from zero to one that scales the effect of every brush, painted or generated from curvature, cavity or boundaries. Face sets assign each face an integer id, shown as colors, and operations such as hide, extract or grow operate on whole sets. Both are stored as mesh attributes. The difficulty is keeping them valid under topology change, and making them usable: smooth mask edges, expanding by surface connectivity and fast updates.",
    k: ["Masks as float attributes vs binary selections: floats give soft transitions in the effect, but cost memory and need smoothing operators.", "Face sets as attribute vs separate sub-meshes: attributes keep one mesh and cheap regrouping, while separate meshes allow independent editing but complicate merging."],
    p: ["A mask is lost or misaligned after dynamic topology or decimation changes vertex counts.", "Hidden face sets are exported accidentally because the hide flag is not visible in the final file."],
    v: "Mask half of a sphere, apply a strong inflate brush across the whole sphere, and confirm masked vertices do not move and the transition region moves in proportion to the mask value.",
    dep: ["attribute-domains", "brush-engine", "topology-queries", "gpu-batch-cache"]
  },
  "texture-painting": {
    s: "Paints color and material values directly onto a surface, writing into image textures through the model's UV mapping, or into vertex colors.",
    d: "Each dab projects the brush footprint onto the surface, finds the corresponding texels through UVs, and blends color into the image. Seams are handled by bleeding color across island borders. Projection painting paints from the current view or from a reference image. Stroke results are buffered and uploaded to the GPU incrementally. Hard parts are seam artifacts, undo for large images, color spaces for blending, and speed on 8K and tiled textures.",
    k: ["Painting into image tiles vs vertex colors: images give resolution independent of mesh density, but need clean UVs; vertex colors need no UVs, but are limited by vertex count.", "Dirty-tile undo vs full-image snapshots: tiles keep undo memory small, but add bookkeeping across overlapping strokes."],
    p: ["Painting across a seam leaves a visible line because texels on the other island were not updated.", "Blending in a nonlinear color space darkens soft brush edges so strokes look muddy."],
    v: "Paint a continuous stroke across a UV seam on a checker-textured sphere, and confirm no visible discontinuity at the seam in a rendered view, and that undo restores the image bit-exactly.",
    dep: ["uv-editor", "seams-islands", "image-textures-color", "undo-stack", "gpu-batch-cache"]
  },
  "uv-unwrapping": {
    s: "Computes a flat 2D layout for a 3D surface by unfolding it along chosen seams, minimizing the stretching of angles or areas.",
    d: "Given seams that cut the mesh into disk-like charts, the solver finds 2D coordinates for each vertex that minimize a distortion energy. Angle-preserving methods keep local shapes, area-preserving methods keep texel density, and iterative solvers balance both. Pinned vertices anchor the result. The difficulty is charts that are not topologically disks, extreme curvature, overlapping results and numerical failure on degenerate triangles.",
    k: ["Angle-preserving vs area-preserving unfolding: angle-preserving keeps patterns undistorted, but sizes vary; area-preserving gives even texel density, and shears shapes.", "Global optimization vs local relaxation: global solves are accurate but slower on large charts; relaxation is interactive and can converge to poor layouts."],
    p: ["A chart with fold-overs produces mirrored triangles that look fine in UV space but paint backwards.", "Zero-area triangles make the solver diverge and produce infinite coordinates for the entire chart."],
    v: "Unwrap a sphere cut along one seam and confirm no triangle has negative orientation in UV space, and measure maximum angle distortion against a stated bound, with the checker pattern showing no shearing.",
    dep: ["seams-islands", "topology-queries", "math-library", "robust-predicates"]
  },
  "seams-islands": {
    s: "Edges marked as cuts that let a surface unfold flat, and the resulting connected UV pieces, called islands, that the artist can move, rotate and scale independently.",
    d: "A seam is stored as an edge flag. After cutting, the mesh's UV connectivity is computed: faces that share an edge without a seam share UV vertices, and the rest are split. Islands are found by traversing UV-connected faces. Automatic seam placement uses angle thresholds, curvature or a minimum-cut heuristic. The difficulty is where to cut: seams reduce distortion but create visible lines and extra vertices in the exported mesh.",
    k: ["Few long seams vs many short ones: fewer seams give continuous textures, but force more distortion; many seams flatten better, and multiply visible joins.", "Seams stored per edge vs per UV vertex: per-edge is compact and editable, but derived UV connectivity must be rebuilt after each edit."],
    p: ["Marking a seam across a very high-curvature area still stretches, because the cut does not reach a boundary.", "Export duplicates vertices along every seam, so vertex counts differ between tools and surprise artists."],
    v: "Mark seams on a cube along the edges of an unfolded cross, run the unwrap, and confirm exactly one island results, with all six faces at equal scale and no overlaps.",
    dep: ["creases-edge-flags", "topology-queries", "attribute-domains", "uv-unwrapping"]
  },
  "island-packing": {
    s: "Arranges UV islands inside the unit square or tiles to use texture space efficiently, with margins and consistent scale between pieces.",
    d: "The packer normalizes island sizes by texel-density weights, optionally rotates them, and places them with a bin-packing method over their bounding shapes or outlines. A margin keeps neighboring islands from bleeding into each other under filtering and mip levels. Constraints include fixed islands, stacked mirrored islands and distinct tiles. The problem is NP-hard in general, so packers use heuristics that trade runtime against coverage.",
    k: ["Bounding-box packing vs outline-based packing: boxes are fast and predictable, but waste space on concave islands; outlines pack tighter, and cost more computation.", "Allowing rotation vs axis-aligned only: rotation gains area, but breaks directional textures like wood grain."],
    p: ["Margins smaller than the lowest mip level's blur radius let colors from one island leak into another at a distance.", "Re-packing after painting starts moves islands and invalidates the painted textures."],
    v: "Pack 200 islands of varied shapes with a 4-pixel margin at 2048 resolution, and confirm there are no overlaps, coverage exceeds a stated fraction, and an automatically rendered mip chain shows no color leaks.",
    dep: ["seams-islands", "uv-unwrapping", "math-library", "udim-tiles"]
  },
  "uv-editor": {
    s: "A 2D editor for viewing and manipulating UV coordinates, with synchronized selection to the 3D view, distortion overlays and tools for pinning, aligning and straightening.",
    d: "The editor draws UV faces over the texture, and every transform tool works on UV coordinates. Selection can be synced with the mesh selection or independent. Overlays show stretch, overlaps and texel density as colors. Tools straighten edge loops, align to axes and weld islands. The challenge is keeping two views of the same mesh consistent: a UV edit must not change 3D geometry, but selection and visibility must still map correctly.",
    k: ["Synced selection between 2D and 3D vs independent: synced selection is intuitive, but hides faces that are not selected in 3D; independent selection allows isolation, and confuses beginners.", "Live distortion overlay vs on-demand: live overlay gives continuous feedback, and recomputes metrics each edit."],
    p: ["Selecting UVs when 3D sync is on selects different mesh elements than expected when seams duplicate vertices.", "Editing UVs in a multi-object session changes only the active object, so islands across objects do not align."],
    v: "Move a UV island to a new position and confirm the 3D mesh vertex positions are unchanged, the texture shows on the moved region in the viewport, and the stretch overlay updates without a delay.",
    dep: ["seams-islands", "selection-system", "transform-tools", "widget-layout", "attribute-domains"]
  },
  "udim-tiles": {
    s: "Extends UV space across a grid of numbered tiles so a single model can use many high-resolution images without sharing one square.",
    d: "Each tile covers one unit of UV space and maps to its own image file, indexed by a number computed from the tile's column and row. Faces choose a tile by where their UVs lie. Painting, baking and rendering all resolve the image per tile. Hard parts are tile creation and naming, memory use when many tiles are loaded, and keeping island packing within tile boundaries so no face spans two tiles.",
    k: ["Tiled UV space vs one atlas image: tiles allow per-region resolution and parallel work, but need tools and renderers that understand the numbering.", "Lazy loading of tiles vs loading all: lazy loading saves memory in huge assets, but causes stalls when a tile is first drawn."],
    p: ["A face whose UVs cross a tile boundary samples two images and shows a visible edge.", "A missing or misnamed tile file shows as black on one part of the model, and no error is raised."],
    v: "Assign faces to three tiles, paint one stroke across each, save, reload, and confirm each tile's image file contains its stroke and the render shows no seams at tile borders.",
    dep: ["image-textures-color", "island-packing", "texture-painting", "native-file-format"]
  },
  "armatures-bones": {
    s: "Skeleton structures made of bones with parent relations, rest poses and roll angles, which drive mesh deformation and animation.",
    d: "A bone has a head, a tail, a roll and a parent. The rest pose defines its local space; pose transforms are applied relative to it. The armature evaluator multiplies parent-chain transforms into a matrix per bone, which skinning then uses. Pose mode edits the pose, edit mode edits the rest. The hard parts are roll and orientation conventions, which differ between tools, and keeping the rest pose and animation in sync when a rig is changed.",
    k: ["Rest pose separate from pose transforms vs one transform: separation keeps animation resetting to a rest, but needs two matrices and care when exporting.", "Bone-local transforms vs world transforms for animation: local transforms retarget and blend cleanly, and require the full chain evaluation each time."],
    p: ["Changing a bone's roll in edit mode silently rotates the posed result because animation is stored relative to the old roll.", "Exporting to a tool with different axis conventions flips bones by ninety degrees."],
    v: "Pose a three-bone chain, export and reimport it through an interchange format, and confirm the world matrix of each bone matches the original within a small tolerance.",
    dep: ["object-hierarchy", "transform-evaluation", "dependency-graph", "math-library"]
  },
  "skinning-weights": {
    s: "Per-vertex influence values that say how strongly each bone moves each vertex, combined by linear blending or by methods that avoid collapsing joints.",
    d: "Each vertex stores a short list of bone indices and weights summing to one. The deformer transforms the vertex by each bone's pose relative to its rest and blends results. Linear blend skinning is fast but collapses at twists; dual quaternion methods preserve volume with other artifacts. Weights are stored as vertex groups. It is hard to limit influences per vertex for GPU skinning, keep weights normalized after edits, and handle topology changes.",
    k: ["Linear blend vs dual quaternion skinning: linear is cheap and widely supported, but candy-wrapper collapse at twists; dual quaternions avoid it and can bulge at bends.", "Four influences per vertex vs unlimited: four is GPU-friendly and compact, but forces lossy truncation of artist-painted weights."],
    p: ["Weights that do not sum to one make the vertex scale or stay behind when the character moves.", "Merging vertices after weighting averages weights incorrectly and distorts the joint."],
    v: "Rotate a forearm bone through 180 degrees of twist and confirm the skin does not collapse below a stated fraction of its rest radius, and every vertex's weights sum to one within tolerance.",
    dep: ["armatures-bones", "attribute-domains", "modifier-evaluation", "gpu-batch-cache"]
  },
  "weight-painting": {
    s: "Edits bone influences by painting on the surface, with tools to normalize, smooth, mirror, limit and transfer weights between meshes.",
    d: "A weight brush writes to the active bone's vertex group, using the same brush engine as sculpting, and visualizes weights as a color ramp. Auto-normalization adjusts other groups so totals stay one. Auto-weight from bone envelopes or heat diffusion produces a starting point. Hard cases are fixing joints by hand, copying weights between different topologies and keeping the work editable when the mesh changes.",
    k: ["Normalize automatically vs manually: automatic keeps data valid, but makes one-group painting affect others unexpectedly.", "Weight transfer by nearest surface vs by topology: nearest surface works on any pair of meshes, while topology transfer is exact but requires identical structure."],
    p: ["Painting with a locked normalization state produces vertices that exceed the influence limit.", "Heat-diffusion auto-weights fail on meshes with interior faces or open shells and give zero weights."],
    v: "Auto-weight a humanoid, then pose it through standard test poses and confirm no vertex stays at the rest pose when it should follow a bone, and the total weights sum to one everywhere.",
    dep: ["skinning-weights", "brush-engine", "mirror-symmetry", "closest-point-queries", "attribute-domains"]
  },
  "cage-lattice-deformers": {
    s: "Deform a mesh through a coarse control structure, such as a lattice grid, a surrounding cage or a curve, so smooth large-scale changes need only a few handles.",
    d: "Each mesh vertex is bound to the control structure through weights computed from its rest position. Moving control points moves the vertices by interpolation: trilinear for lattices, generalized coordinates for cages, arc-length parameters for curves. Binding stores the coordinates once, and evaluation applies them each frame. It is hard to choose a coordinate scheme that is smooth, local and works for concave cages without inverted results.",
    k: ["Lattice vs arbitrary cage: a lattice is simple, fast and regular, while a cage fits any shape better, but costs more to bind.", "Bind once vs rebind on change: binding once is fast to evaluate, but breaks if base topology changes."],
    p: ["Vertices outside the cage at bind time get zero or wrong weights and stay behind.", "Concave cages can produce unintuitive pulling of far-away vertices due to long-range influence."],
    v: "Bind a mesh to a 4x4x4 lattice, move one control point and confirm that vertex displacement falls off smoothly with distance, and that resetting the lattice restores positions exactly.",
    dep: ["modifier-stack", "modifier-evaluation", "attribute-domains", "curve-surface-eval"]
  },
  "constraints-ik": {
    s: "Rules that drive one transform from others, such as aim at, copy rotation or limit, plus inverse kinematics that solves joint angles to reach a target.",
    d: "Constraints are evaluated in a stack on an object or bone after its base transform, each reading targets and writing a blended result. Inverse kinematics solves a chain: analytic for two bones, iterative for longer ones, and respects joint limits and pole targets. The evaluator orders constraints through the dependency graph. The hard parts are cycles when two things constrain each other, solver stability near full extension, and predictable behavior across a complex rig.",
    k: ["Analytic solver vs iterative solver: analytic is exact and fast for short chains; iterative handles long chains and extra constraints, but may converge slowly or oscillate.", "Constraints evaluated after animation vs before: after is what rigs need for controls; before would let animation override rules and break them."],
    p: ["An IK target at full reach makes the chain flip between two solutions on consecutive frames.", "Two bones constraining each other create a cycle that the dependency graph reports only as an error flag."],
    v: "Move an IK target in a circle just inside and just outside the reach of a two-bone arm, and confirm the elbow does not flip and the tip reaches the target within tolerance when reachable.",
    dep: ["armatures-bones", "dependency-graph", "transform-evaluation", "math-library"]
  },
  "shape-keys": {
    s: "Stored alternative positions of vertices, blended by sliders, used for facial expressions, corrective shapes and morphs between forms.",
    d: "A basis shape defines the rest geometry, and each key stores positions, usually as offsets from the basis. The evaluated mesh is the basis plus a weighted sum of offsets, with optional relative-to-other-key logic and vertex group masks. Sliders can be animated. Because keys are vertex-indexed, any topology change must update every key. The difficulty is memory with many keys, and editing the basis without destroying keys.",
    k: ["Relative to basis vs absolute keys: relative offsets combine naturally and survive basis edits, while absolute keys are simpler but cannot be mixed predictably.", "Storing full vertex arrays vs sparse deltas: sparse deltas save memory for local expressions, but add lookup cost and complexity."],
    p: ["Adding a vertex in edit mode on the basis leaves existing keys with a mismatched vertex count and breaks them.", "Summing many keys at full weight overshoots, producing shapes no single key defined."],
    v: "Create smile and blink keys, blend both at 0.5, and confirm vertex positions equal the basis plus half of each offset, and that exporting then reimporting retains key names and values.",
    dep: ["attribute-domains", "fcurves-keyframes", "modifier-evaluation", "native-file-format"]
  },
  "fcurves-keyframes": {
    s: "Time-varying values stored as keyframes with interpolation handles, evaluated to drive any property: position, color, modifier settings or material inputs.",
    d: "Each animated property is addressed by a data path and array index, with an F-curve of keyframes. Interpolation modes include constant, linear and Bezier with handles that shape ease. The evaluator samples the curve at the current frame and writes results through the property system. Drivers evaluate expressions instead of keys. Hard parts are rotation interpolation, which needs quaternion handling, editing handles intuitively, and keeping paths valid when data is renamed.",
    k: ["Curves per property vs per-object clips: per-property curves are flexible and match the data model, but poses and clips need a layer above to group them.", "Bezier handles vs sampled values: handles are compact and editable; sampled values from motion capture are exact but heavy to edit."],
    p: ["Euler rotation curves interpolate through the wrong path and spin the long way around.", "Renaming a bone breaks every curve that referenced it by path, with no warning until playback."],
    v: "Keyframe a location at frames 1 and 24, play back, and confirm the value at each frame matches the interpolation formula; rename the object and confirm the animation still applies.",
    dep: ["property-reflection", "dependency-graph", "action-layers", "math-library"]
  },
  "action-layers": {
    s: "Reusable bundles of animation curves, called actions, that can be assigned, blended, stacked and sequenced on top of each other on timelines.",
    d: "An action is a named set of F-curves. A layered setup stacks actions as tracks, each with start time, scale, blend mode and influence, and the evaluator mixes results per property. This allows reuse of a walk cycle, overlaying a wave on top, and nonlinear editing of clips. The difficulty is blending different kinds of data: rotations need correct interpolation, and additive layers need a defined reference pose.",
    k: ["Additive layers vs replace layers: additive makes small changes on top of any base, but needs a reference pose; replace is simple and overrides lower layers completely.", "Actions stored in the file vs linked from a library: linked actions share changes across scenes, but break when the source moves."],
    p: ["An action with curves for bones that do not exist in the target rig silently does nothing for those bones.", "Blending two quaternion layers by averaging components gives non-unit rotations that distort the mesh."],
    v: "Blend a walk and a run action at 50 percent and confirm foot positions and rotations lie between the two, bone lengths remain constant, and the result is identical on repeated evaluation.",
    dep: ["fcurves-keyframes", "armatures-bones", "library-overrides", "math-library"]
  },
  "simulation-caches": {
    s: "Stored frame-by-frame results of physics simulations such as cloth, rigid bodies and fluids, so playback and rendering do not rerun the expensive solver.",
    d: "A solver advances state each frame from the previous one, so frames cannot be computed independently. Results are written to a cache on disk or memory per frame, with a hash of the settings that produced them. Playback reads frames, and scrubbing backward reads cache rather than recomputing. Invalidating the cache when inputs change is the hard part, together with deterministic stepping and disk use that can reach hundreds of gigabytes.",
    k: ["Cache everything vs recompute on demand: caching gives instant scrubbing and farm rendering, but uses large disk space and goes stale after any change.", "In-file vs external cache files: in-file keeps the document self-contained, but bloats it; external files are lighter and can be lost or mismatched."],
    p: ["Editing an input object after baking leaves the cache displayed, which no longer matches the scene.", "Rendering on a farm without the cache folder re-simulates differently on each machine."],
    v: "Bake a cloth simulation, scrub to frame 100 and back to 10, and confirm positions at frame 10 equal the first playback exactly; change a setting and confirm the cache is flagged as out of date.",
    dep: ["dependency-graph", "native-file-format", "task-scheduler", "attribute-domains"]
  }
});
