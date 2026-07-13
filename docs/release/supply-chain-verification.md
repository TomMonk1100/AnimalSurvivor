# Supply-chain verification

The root release command checks all four npm lockfiles before package gates.
Each lockfile must use npm lockfile v3, and every non-root package record must
carry a version, registry resolution, integrity hash, and license field.

This is a deterministic metadata/provenance gate. It does not replace a final
license compatibility review, SBOM publication, vulnerability review, or the
repository software-license decision.
