# CricSim

A first-person cricket nets simulator. Move a regulation-width bat with the mouse, face pace or spin, and change the pitch and conditions. Practice only: no teams, innings, runs, or match modes.

## Play

[Play CricSim](https://cricsim-nets.soldoutbudokan.chatgpt.site) (owner account sign-in).

Public GitHub Pages target: https://soldoutbudokan.github.io/CricSim/

The `Deploy Production` workflow publishes `dist` to `gh-pages` after tests pass, matching the racer2 setup. For first-time activation, select **Settings → Pages → Deploy from a branch → gh-pages → / (root)**. Subsequent pushes to `main` publish automatically.

## Run

Serve `dist` with any static HTTP server. For example:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. WebGL 2 is required. Three.js 0.180.0 is vendored with its MIT license, so no package install or CDN JavaScript is required. Optional Google Fonts fall back to system fonts when offline.

For development with automatic reload, use Node 22.12 or newer:

```sh
npm ci
npm run dev
```

The game remains plain static files. Vite is a development-only dependency.

## Controls

| Input | Action |
| --- | --- |
| Mouse movement | Position the blade across the crease and vertically |
| Left click + drag | Mouse travel drives the blade forward; release resets the stroke |
| Right click | Soft-handed block; reposition the blade to meet the ball |
| A / D | Turn the bat face |
| W / S | Increase / reduce loft |
| Q / E | Rotate the blade for cross-bat cuts and pulls |
| C | Reset face, loft and roll |
| Space | Next delivery |
| P / Escape | Pause or resume |
| ? | Instructions |

Touch dragging is supported. A mouse and keyboard provide full control. Start with half-speed practice and middle-stump deliveries to learn contact.

## Simulation

- First-person camera at 1.72 m, a 20.12 m wicket-to-wicket pitch, 0.108 m blade width, 0.072 m ball diameter, and 0.711 m stumps.
- Fixed 240 Hz physics, separate from rendering and simulation speed.
- A numerical release-angle solver, gravity, quadratic aerodynamic drag, a tunable swing side force, spin dip/drift, seam deviation, and pitch-dependent restitution and friction.
- Right- and left-arm fast pace, inswing, outswing, off spin, and leg spin. Handedness changes off/leg line selection; bowling arm changes movement direction. Bowling style descriptions use right-arm/right-handed conventions.
- Hard, green, dry, and damp surfaces; clear, overcast, and evening light; crosswind and ball wear. Cloud cover changes lighting and the air-density preset; it is not used as an arbitrary swing multiplier.
- Continuous collision detection between a moving ball and oriented, finite-width bat face, including edge detection and bat-velocity-dependent rebound.
- Mouse travel controls stroke depth directly instead of triggering a canned swing. Contact includes the surface velocity due to face rotation. Soft-handed defence uses a lower restitution coefficient.
- The ball starts at the animated bowling hand's world position. The eye-level camera sits ahead of the stumps and follows the bounce into the crease.
- Poly Haven ground color/normal/roughness maps and separate clear, overcast and evening HDR environments. Physically based materials and AgX tone mapping. Asset sources and licenses are listed in `ASSETS.md`.
- Local impact synthesis for wood, turf, stumps and nets, with stereo position, distance attenuation and a quiet wind bed. No audio recordings or microphone access.
- Net impacts, stumps, repeated practice deliveries, contact percentage, clean strikes, and exit speed.
- Settings are saved on this device. Session stats stay in memory. No accounts, uploads, analytics, or backend data collection.

### Fidelity limits

This remains a simulation foundation, **not a finished photorealistic or validated coaching model**. The ground and lighting use photographed PBR/HDR assets, but equipment and the articulated bowler are procedural; the bowler does not use motion capture. The source dirt material is not a scan of an actual cricket pitch. Swing/spin and surface coefficients are tunable approximations, without CFD, empirical calibration, full seam orientation dynamics, reverse swing, or bat flex. There are no body/pad collisions, footwork, or LBW decisions. Arm geometry is a visual approximation, not a biomechanics model. Automatic length and line variation is seeded. The ball uses physical scale; slow practice and a trail help develop timing.

A production fidelity pass still needs scanned cricket equipment, a realistic rigged human and captured bowling actions, measured delivery calibration, full body contact, and playtesting on real mouse hardware.

## Structure and checks

- `dist/physics.js`: deterministic simulation, presets, collision model.
- `dist/scene.js`: Three.js environment, procedural models, camera, rendering.
- `dist/game.js`: input, delivery lifecycle, session state, audio, settings.
- `dist/bat-control.js`: mouse-driven stroke and three-axis bat orientation.
- `dist/audio.js`: generated impact sound and ambience.
- `dist/assets`: CC0 ground maps and HDR environments (about 9.8 MB total).
- `dist/index.html` / `dist/style.css`: responsive game interface.
- `tests/physics.test.mjs`: trajectory, speed, bounce, contact, outcome, and determinism checks.
- `tests/bat-control.test.mjs`: drag-driven movement, defensive absorption, cross-bat collision and release continuity.

```sh
node --test tests/*.test.mjs
```

The `.openai/hosting.json` file configures static output. A private deployment adds its own project identifier only in its private source repository; the public manifest contains no deployment identifier. `dist` is also portable to another static host.

### Verification status, 2026-09-05

All 17 automated simulation/control tests pass. JavaScript syntax, asset paths, texture hashes and the three HDR decoders were checked. Browser playtesting was attempted but blocked because the environment's supervised preview service was unavailable. No visual, interaction or frame-rate pass is claimed. Before describing the game as production-ready, test it on a real browser and mouse, including full-speed contact, every condition, left-handed play, pause/resume and touch input.

## References

- [MCC: The pitch](https://www.lords.org/mcc/the-laws/the-pitch)
- [MCC: The bat](https://www.lords.org/mcc/the-laws/the-bat)
- [Three.js documentation](https://threejs.org/docs/)

Third-party Three.js code is distributed under `dist/vendor/THREE-LICENSE.txt`.
