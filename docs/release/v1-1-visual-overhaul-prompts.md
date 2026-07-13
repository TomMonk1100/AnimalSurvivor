# V1.1 Visual Overhaul Asset Record

## Wildguard Prism VFX atlas — `assets/ui/vfx/wildguard-prism-atlas-v1.png`

This single 1024×1024 RGBA atlas is the only new runtime bitmap in the visual
overhaul. It is shared across fixed, renderer-only instanced layers for hero
attack accents, XP and power-pickup reads, hostile projectile trails, danger
telegraphs, and impact stars. It never participates in simulation state,
replay hashes, damage, pickup collection, or RNG.

- Tool: Built-in OpenAI image generation
- Date: 2026-07-13
- Reference images: none
- Generated source: `exec-362ca417-fa7d-44d6-8f65-024e7dcb9f17.png`
- Source dimensions: 1254×1254 PNG on a flat `#00ff00` chroma background
- Runtime hash: `1c54ebf0409076cc0b0c087898c3448a0da1055fb86ea435b8a18941b75b19f9`
- Runtime dimensions: 1024×1024 8-bit RGBA PNG, 845,320 bytes

### Generation request

> Create a compact reusable 4 by 4 game VFX sprite atlas for a high-polish
> top-down animal survival game. Perfectly flat neon chroma-key green
> (#00ff00) background only. No text, no UI, no characters, no border, no grid
> lines. Put 16 evenly spaced isolated sprites in a precise 4x4 layout, each
> with generous green padding: ivory fox claw crescents, amber earth fracture
> wave, mint-magenta spit comet, cyan shield tuft, lime XP diamond, blue magnet
> spark, orange bomb burst, red hostile thorn comet, plus variations of
> starbursts, impact shards, ring pulses, and motion streaks. Style: bold
> storybook low-poly hand-painted shapes, crisp opaque edges, saturated
> emissive cores, clean readable silhouette at small scale, no soft gray
> shadows. Every sprite must be separate from the others and surrounded by
> uninterrupted chroma green.

### Alpha cleanup

The runtime texture was produced from that source with the repository's
image-generation chroma-key helper and the bundled image runtime:

```text
remove_chroma_key.py --key-color #00ff00 --tolerance 32 --soft-matte \
  --transparent-threshold 20 --opaque-threshold 96 --edge-contract 1 \
  --spill-cleanup
```

The chroma-cleaned 1254px source was non-destructively reduced to 1024px with
`sips -Z 1024` before being committed. The resulting atlas is intentionally used as a tiled shared texture rather
than a sequence of animation frames. That keeps runtime art payload and draw
calls bounded while allowing motion to remain deterministic and GPU-instanced.
