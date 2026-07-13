# AnimalSurvivor Third-Party Notices

This file is the repository copy of the notices that must travel with a V1
web artifact. The player-facing prep panel provides a short summary; this file
is the complete current notice record.

## Quaternius Ultimate Animated Animal Pack

The runtime Greg fox glTF is from Quaternius's [Ultimate Animated Animal
Pack](https://quaternius.com/packs/ultimateanimatedanimals.html). The
incorporated source is distributed under the CC0 1.0 Public Domain Dedication.
The original `License.txt` is preserved beside the source at
`assets/vendor/quaternius/ultimate_animated_animals/License.txt`; the source
file hashes are recorded in `assets/ASSET_LEDGER.md`.

## Quaternius Stylized Nature MegaKit

The Forest clearing uses a curated set of static props from Quaternius's
[Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html):
two trees, two rocks, and one flower bush with their local textures. The
publisher designates the pack as the
[CC0 1.0 Public Domain Dedication](https://creativecommons.org/publicdomain/zero/1.0/).
The source was downloaded through the publisher's official free-download flow;
the compact runtime glTF containers, geometry buffers, texture derivatives,
source archive hash, and modification record are all listed in
`assets/ASSET_LEDGER.md`.

## PlayCanvas Engine 2.20.6

Copyright (c) 2011-2026 PlayCanvas Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## AI-assisted project artwork

The three Field Guide final-form portrait tiles and two boss-health portrait
tiles are project artwork generated with the built-in OpenAI image-generation
tool on 2026-07-12 without reference images. They are not third-party runtime
models, and their hashes and intended use are recorded in
`assets/ASSET_LEDGER.md`. The playable Forest clearing ground plate; Benny and
Gracie hero sprites; and Bramblehog, Thornwing, Rootback, and Hollowhart Warden
enemy sprites were generated with the same tool on that date without reference
images; their exact prompts and post-processing are recorded in
`docs/release/v1-visual-art-prompts.md`.

## Scope note

The project currently ships no third-party fonts, audio packs, analytics SDK,
advertising SDK, or network service. The dependency lockfiles remain the source
of truth for the complete package dependency graph; a final release build still
needs an automated license/SBOM scan before public distribution.
