# Production bundle audit

Measured with Node 22 and Vite 8.1.4 on 2026-07-10 after the hardware-instancing
renderer landed.

| Build | JavaScript (minified) | JavaScript (gzip) | Source map | `dist/` on disk |
| --- | ---: | ---: | ---: | ---: |
| Before | 1,910.15 kB | 488.08 kB | 4,790.46 kB | about 6.4 MiB |
| After | 1,910.11 kB | 488.05 kB | none | about 1.83 MiB |

The behavior-neutral improvement is disabling production source maps. This
project has no production error-ingestion service, so the 4.79 MB map was a
deployment artifact with no current consumer. Vite development builds still
provide source mapping for local debugging.

## Why the engine was not force-split

PlayCanvas' public `Application` framework imports its registered asset parsers,
which in turn exposes Draco and Gaussian-splat worker modules. That is why Vite
reports three `node:worker_threads` browser-externalization warnings even though
the toy does not load those asset types. The production build still succeeds and
does not require a runtime network dependency.

A package-export facade using only the PlayCanvas symbols referenced by the toy
was tested. It did not reduce the minified or gzip payload, because
`Application` itself reaches the framework/parser graph. It was therefore
rejected rather than preserving a private-module alias that would be fragile
across PlayCanvas releases.

Static vendor chunking was also rejected: the application imports PlayCanvas on
startup, so another chunk would improve cache boundaries but not first-load
bytes. It would not remove the large-chunk warning or reduce the total gzip
payload.

The next meaningful JavaScript download reduction requires a source-level
renderer decision: replace `Application` with a deliberately initialized
`AppBase`, or use lower-level PlayCanvas graphics APIs. That should be evaluated
as its own rendering change with browser regression tests, not hidden in build
configuration.

## Remaining build warnings

- Three `node:worker_threads` externalization warnings originate inside the
  PlayCanvas Draco and Gaussian-splat parser workers.
- The main chunk exceeds Vite's 500 kB advisory threshold.

Both warnings are intentionally left visible. Raising the warning threshold
would only hide the current 488.05 kB gzip / 1.91 MB minified cost.
