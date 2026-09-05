# Environment assets

All ground maps and HDR environments are distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). They were downloaded from the official Poly Haven CDN. [Poly Haven license](https://polyhaven.com/license).

| Asset | Creator | Files | Source |
| --- | --- | --- | --- |
| Dirt | Charlotte Baglioni | `dirt_*_1k.jpg` | [Poly Haven](https://polyhaven.com/a/dirt) |
| Sparse Grass | Amal Kumar | `sparse_grass_*_1k.jpg` | [Poly Haven](https://polyhaven.com/a/sparse_grass) |
| Noon Grass | Greg Zaal | `noon_grass_1k.hdr` | [Poly Haven](https://polyhaven.com/a/noon_grass) |
| Lythwood Field | Greg Zaal | `lythwood_field_1k.hdr` | [Poly Haven](https://polyhaven.com/a/lythwood_field) |
| Evening Field | Sergej Majboroda | `evening_field_1k.hdr` | [Poly Haven](https://polyhaven.com/a/evening_field) |

Ground textures are 1024×1024 and represent 2 m physical tiles. Normal maps use OpenGL orientation. HDR environments are 1024×512. The material set approximates practice turf and compact earth; it is not a documented scan of a cricket strip. Photographed environments are general fields, not a named cricket venue.

Exact download URLs, byte sizes and SHA-256 hashes are in `dist/assets/manifest.json`. The combined asset download is approximately 9.8 MB.

Three.js 0.180.0 and its HDRLoader are vendored under the MIT license in `dist/vendor/THREE-LICENSE.txt`. HDRLoader's import was changed to use the local Three.js module. No third-party humanoid model is included.
