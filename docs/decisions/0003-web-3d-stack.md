# ADR 0003: Web-First Low-Poly 3D Stack

**Status:** Accepted  
**Date:** 2026-07-10

## Decision

Use strict TypeScript, Vite, and the standalone MIT-licensed PlayCanvas Engine.
Use WebGL 2 as the baseline and WebGPU only as an optional enhancement. Runtime
models are optimized GLB with shared materials and instancing for repeated units.

## Consequences

- Phaser is excluded because the owner chose low-poly 3D.
- Godot remains a future native-first alternative, not the prototype stack.
- Swarm enemies cannot use one full skeletal rig per unit.
- The renderer stays separated from deterministic gameplay state.

