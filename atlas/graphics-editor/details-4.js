// Details for the graphics editor plate, part 4: scene graph and the style, component and layout model.
ATLAS.details("graphics-editor", {
  "scene-graph": {
    s: "The tree of nodes that is the document: pages containing frames, groups, shapes, text and images, with parent-child structure, ordering and an index by id.",
    d: "Each node has an id, a type, a parent, an ordered list of children and a bag of typed properties. A hash index finds any node by id, and child lists use stable ordering keys so inserts do not renumber siblings. The tree is the unit of sync, save, hit testing, rendering and layers display. Derived structures such as bounding boxes, world transforms and spatial indexes are cached and invalidated through change tracking. It is hard because it must hold millions of nodes in little memory, support cheap structural edits and stay consistent under concurrent changes.",
    k: ["A pure tree vs a graph with cross-references: a tree is simple to traverse and merge, but components, masks and prototype links need reference properties on top.", "Nodes as objects vs a columnar store: objects are easy to program, while columnar storage is far more compact and cache-friendly for huge files."],
    p: ["Caching world transforms without invalidating descendants leaves children drawn at old positions after a parent moves.", "Recursive traversals overflow the stack on deeply nested documents."],
    v: "Load a document with five million nodes, move a top-level frame and reparent a subtree. Confirm memory stays within budget, only the moved subtree's derived data is recomputed, and hit testing remains correct.",
    dep: ["node-types", "node-identity-and-references", "z-order-and-layering", "coordinate-spaces-and-transforms"]
  },
  "node-types": {
    s: "The catalog of node kinds, each with its own properties and rules: page, frame, group, rectangle, ellipse, path, text, image, component, instance, slice, section.",
    d: "A node type defines which properties exist, their defaults, which children are allowed and how the node renders and lays out. Frames clip and lay out children, groups only organize and take their bounds from children, shapes own geometry, and text and image nodes hold content. Component and instance types add reuse. Types are versioned: new ones are introduced behind a schema version, and older clients degrade them to a known placeholder. It is hard because behaviors differ subtly (a group's bounds versus a frame's), and each type multiplies work in tools, export and handoff.",
    k: ["Groups versus frames as separate types vs one container with flags: separate types make rules clear, but need conversion commands and double the code paths.", "Strict type schemas vs open property bags: strict schemas validate and migrate well, but slow extension."],
    p: ["Ungrouping a group that has effects or masks silently drops them from children.", "A new node type opened in an older client is shown as an empty box and then saved over."],
    v: "Create one node of every type, nest them, copy to another file and round-trip through save and export. Confirm properties, allowed children and appearance survive, and an old client shows a clear placeholder.",
    dep: ["scene-graph", "property-model", "document-schema-and-migration"]
  },
  "z-order-and-layering": {
    s: "The order in which siblings are painted, stored as stable ordering keys, plus the rules for stacking contexts, blend isolation and moving nodes between containers.",
    d: "Painting order is the order of a container's children from back to front. Ordering keys, such as fractional strings, let two users insert between the same neighbors without conflicts or renumbering. Containers that clip, mask, apply opacity or use certain blend modes become isolated groups composited separately; others pass children through. Commands such as bring to front or move above compute new keys. It is hard because the visible stack can differ from the logical one when isolation is involved, and because order must merge deterministically.",
    k: ["Fractional ordering keys vs array indices: keys merge well in multiplayer, but need rebalancing when they become long.", "Always isolating groups vs isolating only when needed: always isolating is simple and predictable, but costs offscreen buffers."],
    p: ["Ordering keys collide when two clients insert at the same spot, producing nondeterministic stacking.", "Setting group opacity changes how blend modes inside it behave because isolation silently turned on."],
    v: "Have two clients insert layers at the same position repeatedly, then reload both. Confirm stacking order is identical, and a 10 percent group opacity change shows the same pixels as the exported image.",
    dep: ["scene-graph", "merge-semantics", "layer-compositing"]
  },
  "node-identity-and-references": {
    s: "Stable unique ids for every node, and the reference properties (component links, masks, prototype targets, comment anchors) that depend on those ids across edits and merges.",
    d: "Ids are generated so that two clients never collide, usually from a client id and a counter. References are stored as ids, never as positions or names. Copying nodes within a file creates new ids and rewrites internal references to match; copying across files maps ids to new ones and rewrites links. Deleted ids are remembered so late operations are discarded safely. It is hard because references to deleted or not-yet-synced nodes must degrade gracefully, and because id remapping during paste must catch every kind of reference.",
    k: ["Client-generated ids vs server-assigned ids: client ids allow offline creation and instant references, but need collision-proof schemes.", "Reusing ids when restoring a deleted node vs creating new ones: reuse preserves references and comments, but conflicts if someone recreated the node."],
    p: ["Paste fails to remap a mask reference, so the pasted shape is masked by the original in another place.", "An id counter resets after local storage is cleared, producing ids that collide with earlier ones."],
    v: "Copy a frame containing masks, prototype links and components to another file and back. Confirm all references point inside the pasted copy, ids are unique, and the original is unchanged.",
    dep: ["scene-graph", "identity-and-ids"]
  },
  "coordinate-spaces-and-transforms": {
    s: "The chain of local, parent, page and screen coordinate systems, with affine transforms per node, and the conversions used by every tool and the renderer.",
    d: "Each node stores a two-dimensional affine transform relative to its parent, plus size. A world transform is the product along the ancestor chain and is cached. Tools convert pointer positions from screen to a node's local space through the inverse. Rotation and skew make a node's axis-aligned bounds differ from its geometry. Frames with scaling or constraints change how children respond to resizing. It is hard because matrices accumulate error, because singular transforms cannot be inverted, and because many properties belong to a specific space, such as strokes in local units.",
    k: ["Storing a matrix vs storing position, rotation and scale: a matrix is exact and composes, but loses editable rotation values that people expect to type.", "Caching world transforms vs computing on demand: caching is fast for rendering and hit testing, but needs correct invalidation."],
    p: ["Zero scale makes a transform singular and every tool reading its inverse produces infinities.", "Rotation shown in the inspector drifts by a fraction after each edit because it is recomputed from a matrix."],
    v: "Nest three frames with rotation and non-uniform scale, then place a point at a known screen location. Confirm round-tripping screen to local and back returns the same location within a tiny tolerance.",
    dep: ["scene-graph", "numeric-precision"]
  },
  "masks-and-clipping-model": {
    s: "How a node's shape limits what is visible: frame clipping, vector masks, alpha and luminance masks, and clipping groups, with defined inheritance and ordering.",
    d: "A frame can clip its children to its bounds or its rounded shape. A mask node designates a shape or image whose alpha or luminance limits the siblings above it, or the group that contains it. Masks can use paths or raster layers. Boolean and mask combinations nest, and each creates an isolated group for correct compositing. Hit testing, bounds and export must all honor masking. It is hard because masks change a node's visible bounds, which affects selection, effects such as shadows and the area to render, and format support varies across export targets.",
    k: ["Mask as a sibling node vs as a property of the masked node: a sibling is flexible and visible in layers, but order-dependent and easy to break.", "Alpha vs luminance masking by default: alpha is simple, luminance matches many import formats and is more expressive."],
    p: ["A shadow is clipped by the mask even though the designer expected it to extend outside.", "Exporting to a format without luminance masks rasterizes the group at low resolution."],
    v: "Mask an image with a gradient shape, then rotate the group and export at 2x. Confirm hit testing follows the visible area only, and the export matches the on-screen result pixel for pixel in the masked region.",
    dep: ["z-order-and-layering", "raster-masks", "boolean-operations"]
  },
  "document-schema-and-migration": {
    s: "The versioned definition of every node type and property, with migrations that upgrade older documents and rules for how newer files behave in older clients.",
    d: "The schema lists each property with type, default and the version that introduced it. Opening a document runs migrations from its stored version to the current one, in order, as pure transforms. Unknown properties are preserved, not dropped, so a newer feature survives a round trip through an older client. The multiplayer server uses the schema to validate operations. It is hard because migrations must also work on operation streams held by offline clients, because defaults change meaning over time, and because every release must keep old files opening for years.",
    k: ["Preserving unknown properties vs dropping them: preserving protects data from newer clients, but lets garbage accumulate.", "Eager migration on open vs lazy migration on edit: eager is simple to reason about, but rewrites files that were only viewed."],
    p: ["An older client strips an unknown property on save and a newer feature disappears for the whole team.", "A migration run on large files takes a minute and blocks opening."],
    v: "Open a corpus of files saved by every past version and edit with an older client that lacks a newer property. Confirm each opens, renders as before, and the newer property survives the older client's save.",
    dep: ["node-types", "file-format", "backward-compatibility"]
  },
  "property-model": {
    s: "The typed, observable set of properties on each node, with defaults, units, validation, ranges and the ability to be bound to a style or variable.",
    d: "A property is a named value of a defined type: number, color, enum, paint list, text, reference. The model validates writes, applies defaults for unset values, exposes metadata for the inspector and records which properties are bound to a style or variable. Resolved values are computed from the stored value, any binding, the active variable mode and the component override chain. Reads must be fast because rendering reads many properties per node per frame. It is hard because resolution order matters, and because every new property must be handled by sync, save, export, handoff and plugins.",
    k: ["Typed property definitions vs free-form values: typed definitions validate and drive the UI automatically, but each addition requires schema work.", "Resolving on read vs caching resolved values: resolving on read is simple and correct, caching is fast but needs dependency tracking."],
    p: ["A binding to a deleted variable returns undefined and the node renders with a default instead of the last known value.", "Out-of-range values from a plugin or import crash the renderer."],
    v: "Set each property type through UI, plugin, import and sync with out-of-range and malformed values. Confirm invalid writes are rejected or clamped with a message, and valid values resolve to the same result in every client.",
    dep: ["node-types", "document-schema-and-migration"]
  },
  "paint-model": {
    s: "How fills and strokes are described: ordered lists of paints (solid, gradient, pattern, image) with opacity and blend mode, plus stroke width, alignment, caps, joins and dashes.",
    d: "A node holds a list of fills and a list of strokes, painted bottom to top, each with type, color or gradient data, opacity, visibility and blend mode. A stroke adds weight, alignment (inside, center, outside), cap, join, miter limit and dash pattern. Image paints carry scaling and cropping rules. Per-side weights and variable-width strokes extend it. The model must map onto both screen rendering and export formats. It is hard because stroke alignment is not native in many vector formats, and because multiple paints with blend modes need isolated compositing.",
    k: ["Lists of multiple paints vs a single paint per property: lists give design flexibility, but multiply rendering passes and export complexity.", "Inside and outside stroke alignment as a property vs as derived geometry: a property keeps editing simple, but needs offsetting for formats without it."],
    p: ["Exporting an inside stroke to a vector format without alignment support produces a stroke centered on the edge and shapes appear thinner.", "Image paints hold their own copy of pixel data and bloat the file."],
    v: "Apply three stacked fills with different blend modes and an outside dashed stroke, then export to a vector format and a raster at 2x. Confirm both match the canvas, and stroke alignment is geometrically correct.",
    dep: ["property-model", "gradients-and-patterns", "stroke-geometry"]
  },
  "gradients-and-patterns": {
    s: "Linear, radial, angular and mesh gradients and tiled or image patterns, defined by stops, transforms and interpolation rules, resolved in a chosen color space.",
    d: "A gradient stores a type, a transform that places it relative to the node and a list of stops with position, color and alpha. Interpolation may happen in the display space, a linear space or a perceptual space, which changes how midpoints look. Dithering reduces banding in smooth ramps. Patterns repeat an image or a shape with transforms. Gradients are edited on canvas with handles. It is hard because renderers and export formats support different gradient types, and because interpolation space must match between the editor and other tools to keep appearance.",
    k: ["Interpolating in a perceptual space vs the device space: perceptual gives smoother, more natural ramps, but differs from what most exported formats and other tools do.", "Mesh gradients as native vs rasterized on export: native keeps editability, but few targets support them."],
    p: ["Gradient banding appears on dark ramps in 8-bit output because dithering was skipped.", "A gradient transform is applied before the node's rotation on import, tilting the ramp."],
    v: "Create a five-stop angular gradient on a rotated shape and compare the canvas with exports to two formats. Confirm colors at each stop match and the midpoint blend differs only where interpolation space is declared different.",
    dep: ["paint-model", "color-profile-handling", "effects-renderer"]
  },
  "effects-model": {
    s: "The non-geometry visual effects on a node: drop and inner shadows, layer and background blur, noise and texture, and glass-like or progressive effects, in an ordered list.",
    d: "Effects are stored as a list with type, parameters and visibility. Shadows have offset, blur radius, spread, color and blend mode; blurs have radius and may be progressive or masked. Effects extend a node's visible bounds beyond its geometry and may depend on content behind it, as background blur does. Rendering them needs offscreen buffers and often a separate pass. It is hard because effects interact with masks, clipping and export formats that lack them, and because their cost grows with area and radius.",
    k: ["Effects as rendered per node vs as a post-process per group: per node gives local control, but multiplies offscreen passes in complex designs.", "Blur radius in document units vs screen pixels: document units make exports match, but zooming in makes the radius expensive."],
    p: ["Background blur reads the wrong content when nested in isolated groups.", "A large blur radius on a huge node allocates a very large offscreen buffer and exhausts GPU memory."],
    v: "Apply a shadow and a background blur to nested nodes over an image, and export to raster at 3x. Confirm the visible bounds include the shadow, edges are not clipped, and blur matches the canvas.",
    dep: ["property-model", "effects-renderer", "masks-and-clipping-model"]
  },
  "shared-styles": {
    s: "Named, reusable bundles of properties (a color, text style, effect set or grid) that nodes link to, so one edit updates every use.",
    d: "A style holds a set of property values under a name and an id. Nodes store a reference to the style, and resolved values come from the style unless detached. Editing the style updates all linked nodes through change tracking. Styles can be published in libraries and carry descriptions. They overlap with variables, and many tools are moving toward variables for color and number values while keeping styles for composite values such as typography. It is hard because publishing and updating must carry existing links, and because detaching or overriding must be visible.",
    k: ["Styles for composite values and variables for atomic values: both cover cases the other handles poorly, but two systems confuse people.", "Linked by reference vs copied on apply: references keep consistency, copies are safe against upstream changes."],
    p: ["A style deleted in the library leaves nodes with a dangling reference and an unnamed look.", "Two styles with the same name in different libraries get merged on import."],
    v: "Apply a text style to 500 nodes in two files, edit it in the library and publish. Confirm every linked node updates after acceptance, detached ones do not, and the update is a single undoable step.",
    dep: ["property-model", "asset-libraries", "variables-and-design-tokens"]
  },
  "components-and-instances": {
    s: "Reusable master designs (components) and their live copies (instances) that follow the master, with nested components and a defined way to find the source.",
    d: "A component is a node tree with a stable key. An instance stores a reference to its component and its overrides, and its visible tree is derived from the master plus overrides, not stored in full. Instances can nest other instances. Changing the master recomputes every instance through dependency tracking. Instances can be detached into ordinary nodes. It is hard because documents contain hundreds of thousands of instances, so the derived trees must be computed lazily and cached, and because a master change must keep overrides attached to the right inner nodes.",
    k: ["Lazily derived instance trees vs materialized copies: lazy saves memory and file size, but needs careful caching and path-based addressing of inner nodes.", "Instances referencing masters in other files vs importing copies: references enable shared systems but break when the library is unavailable."],
    p: ["Deleting a master without a plan leaves instances rendering nothing or as a broken placeholder.", "Rebuilding the inner tree of all instances on every master edit freezes large files."],
    v: "Change a button master used by 50,000 instances. Confirm all instances update within the frame budget on a mid-range machine, overrides remain on the right inner elements, and detaching one keeps its current look.",
    dep: ["scene-graph", "overrides-and-variants", "node-identity-and-references", "asset-libraries"]
  },
  "overrides-and-variants": {
    s: "Per-instance changes to inner properties, and sets of related component variants selected by properties such as size or state, with rules for how overrides survive master edits.",
    d: "An override is a property value stored on an instance, addressed by the path to the inner node inside the component. Variants group several masters under one component set with named properties like state or size; an instance picks a combination. Swapping variants must carry over compatible overrides, matching inner nodes by name or position. Booleans, text and instance-swap properties expose chosen overrides as simple controls. It is hard because inner structure changes in the master, such as renaming a layer, can orphan overrides.",
    k: ["Addressing overrides by node id path vs by layer name: ids survive renames, names survive rebuilds of the master.", "Resetting overrides on variant swap vs carrying them over: reset is predictable, carry-over keeps work but can apply a color to the wrong element."],
    p: ["Renaming a layer in the master drops overrides on every instance without notice.", "A variant swap carries over text to a layer that now means something else."],
    v: "Override text and color in an instance, swap its size variant and rename an inner layer in the master. Confirm overrides persist where the inner node is the same, and a report lists any that could not be placed.",
    dep: ["components-and-instances", "property-model", "node-identity-and-references"]
  },
  "constraints": {
    s: "Rules that say how a child moves or stretches when its parent frame resizes: pinned to edges, centered, scaled or stretched, evaluated against the parent's old and new size.",
    d: "Each child stores a horizontal and a vertical constraint relative to its parent: left, right, both, center or scale. When the parent resizes, a solver computes the child's new bounds from its original offsets and the parent's size change. Constraints apply to direct children and are recursive through nested frames. They are used for responsive design and for resizing instances. It is hard because rotated children, nested transforms and text that reflows make the result differ from what a designer expects, and because constraints interact with auto layout.",
    k: ["Constraints vs auto layout as the main resizing model: constraints are free-form and precise, but do not express flow, wrapping or spacing.", "Resolving constraints on resize only vs continuously: resize only is cheap, while continuous allows live preview at the cost of repeated solving."],
    p: ["Rotated children are constrained as if unrotated, producing skewed results when the parent is resized.", "Constraints applied to a child of an auto layout frame are ignored but still displayed."],
    v: "Resize a frame whose children are pinned left, pinned both sides and centered, including one rotated child. Confirm each follows its rule in both axes and the result is identical on every connected client.",
    dep: ["coordinate-spaces-and-transforms", "scene-graph", "auto-layout"]
  },
  "auto-layout": {
    s: "A flow layout for frames: direction, spacing, padding, alignment, wrapping and per-child sizing (fixed, hug, fill) that positions children and sizes the frame from its content.",
    d: "A frame with auto layout positions children along an axis with gap and padding, aligns them on the cross axis, and may wrap onto new lines. Each child's size mode can be fixed, hug its content or fill remaining space. Layout is recomputed on any change to size, content or child list, bottom up for hugging and top down for filling. Text size feeds back into layout, so text shaping must run first. It is hard because layout is a constraint problem with feedback loops, and because results must match code the developers write.",
    k: ["Implementing a subset modeled on web flexible layout vs a custom model: matching the web makes handoff accurate, but inherits its complexity and edge cases.", "Computing layout synchronously on every change vs deferring: synchronous keeps the canvas correct, deferred is faster but shows stale frames."],
    p: ["Layout loops when a fill child depends on its parent's hug size, and the editor stalls.", "Text edited by a remote user changes the width of a button and shifts the layout under another user's cursor."],
    v: "Build a card with hug and fill children and wrapping, edit the text in one child and resize the parent. Confirm sizes and positions match a reference layout engine's output to within a pixel.",
    dep: ["scene-graph", "paragraph-layout", "change-tracking", "constraints"]
  },
  "variables-and-design-tokens": {
    s: "Named typed values (color, number, string, boolean) with several modes such as light and dark, bound to properties and to each other through aliases.",
    d: "A variable collection holds variables, each with a value per mode. Nodes bind properties to variables; the resolved value depends on the active mode, which can be set per frame, so one design shows light and dark side by side. A variable's value can be another variable, forming alias chains that must not cycle. Variables can drive prototype logic and component properties. They map to design tokens for code. It is hard because resolution depends on mode inherited through the tree, because aliases can cross libraries, and because renaming must keep every binding.",
    k: ["Modes inherited down the tree vs a single global mode: inheritance supports mixed themes in one file, but makes the resolved value depend on context.", "Aliases to other variables vs literal values: aliases give a semantic layer, but add lookup cost and risk of cycles."],
    p: ["A cycle in aliases is created through two libraries and resolution loops forever.", "Changing a variable's type orphans all bindings that expected the old type."],
    v: "Bind a fill to a semantic color alias in two modes, place the same component in a light and a dark frame, and edit the base color. Confirm each frame shows its own resolved color and cycles are rejected on creation.",
    dep: ["property-model", "scene-graph", "asset-libraries"]
  },
});
