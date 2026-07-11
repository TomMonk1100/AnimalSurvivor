# Low-Poly Visual Grammar

## Target feeling

The hero begins as a toy-like, heroic animal with a clear face and readable
species silhouette. It ends as a majestic little disaster: stranger, more
powerful, asymmetrical, and visibly mutated, but still recognizably the same
character.

The transformation curve is:

```text
cute natural hero -> equipped nature champion -> mythic combat chimera
```

Never cross into gore, exposed organs, horror anatomy, or photorealism.

## Shared camera and rendering

- Orthographic three-quarter camera, approximately 45–55 degrees downward.
- Hero occupies roughly 8–12% of screen height during normal combat.
- Flat-shaded or lightly faceted materials; one shared palette atlas where
  practical.
- One soft directional light plus ambient fill.
- No real-time shadows on swarm enemies. The hero may use one cheap blob shadow.
- No fur simulation, cloth simulation, physics accessories, post-process depth of
  field, or dense transparent particles.
- Enemy danger uses red-orange, sharp triangles, and pulsing outlines. Player
  power uses teal, gold, violet, and rounded/starburst shapes.

## Hero invariants

Every legal final build must preserve:

- both eyes or a clearly readable face plane;
- locomotion direction and ground contact;
- at least two original species cues;
- a clean hurt-flash silhouette;
- an unobstructed gameplay hit marker at the feet;
- no more than three large outer-silhouette changes at once.

## Mutation scale

Each attachment uses three authored stages:

1. **Bud:** compact and charming; occupies no more than one socket region.
2. **Adapted:** larger or animated; establishes its combat behavior visually.
3. **Mythic:** merges two traits into one dominant form, freeing clutter rather
   than stacking both original meshes indefinitely.

Small numerical ranks change glow, markings, cadence, or tiny secondary pieces.
They do not add duplicate horns, wings, glands, or weapons.

## Three direction boards

### A. Storybook Wildguard

- Rounded proportions, warm cream lighting, coral/teal/gold palette.
- Mutations resemble polished natural armor and heroic regalia.
- Highest broad-audience friendliness and clearest silhouettes.
- Risk: may look like a generic mobile game without unusual asymmetry.

### B. Moonlit Menagerie

- Deep indigo environments, turquoise bioluminescence, violet and amber accents.
- Mutations feel magical but remain rooted in real animal traits.
- Strongest spectacle and evolution payoff.
- Risk: emissive effects can conceal combat danger or inflate draw cost.

### C. Curious Chimera

- Bright daylight, mint/lilac/mango palette, slightly uneven handmade forms.
- Starts cutest and becomes the strangest: extra eyes, mismatched trait pairs,
  exaggerated but non-gory anatomy.
- Most distinctive and most aligned with “cute to mutated.”
- Risk: can drift from heroic into random comedy without strict shape hierarchy.

## Proposed hybrid target

If no board clearly dominates testing, use Board A's readability and materials,
Board B's mythic glow only at evolution moments, and Board C's increasing
asymmetry. Do not average all three palettes.

