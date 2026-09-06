# CricSim

A first-person cricket nets simulator. Move a regulation-width bat with the mouse, face pace or spin, and change the pitch and conditions. Practice only: no teams, innings, runs, or match modes.

## Play

[Play CricSim](https://cricsim-nets.soldoutbudokan.chatgpt.site) (owner account sign-in).

Public GitHub Pages target: https://soldoutbudokan.github.io/CricSim/

The `Deploy Production` workflow publishes `dist` to `gh-pages` after tests pass. For first-time activation, select **Settings → Pages → Deploy from a branch → gh-pages → / (root)**. Later pushes to `main` publish automatically.

## Run

Serve `dist` with any static HTTP server. For example:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. WebGL 2 is required. Three.js 0.180.0 is vendored with its MIT license, and the two web fonts are served from `dist/fonts`, so the game makes no third-party requests and works offline once cached.

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
| Space | Take guard, then bowl the next delivery |
| P / Escape | Pause or resume; Escape also closes the conditions drawer |
| ? | Instructions |

Touch dragging is supported. A mouse and keyboard give full control. Start with half-speed practice and middle-stump deliveries to learn contact.

## Interface

- The 3D view fills the window. Everything else is an overlay: brand and condition chips top-left, a session score bug top-centre, controls top-right, the delivery readout bottom-left and the bat-angle cluster with the primary action bottom-right.
- Taking guard leaves you at the crease; Space or **Next ball** starts the bowler. Short coaching lines appear under the readout for the first three balls.
- Results land as a lower-third strap coloured by outcome. Being bowled flashes the frame edge red.
- Conditions open in a drawer over the scene at every size (a bottom sheet on phones), so the canvas never resizes while you play.
- The reticle marks the middle of the blade, fills an arc as a stroke builds, and squares off while blocking.
- Dark theme only, self-hosted Barlow Condensed and DM Sans, reduced-motion support, keyboard focus rings throughout.

## Simulation

- First-person camera at 1.72 m, a 20.12 m wicket-to-wicket pitch, 0.108 m blade width, 0.072 m ball diameter, and 0.711 m stumps.
- Fixed 240 Hz physics, separate from rendering and simulation speed.
- A numerical release-angle solver, gravity, quadratic aerodynamic drag, a tunable swing side force, spin dip/drift, seam deviation, and pitch-dependent restitution and friction.
- Right- and left-arm fast pace, inswing, outswing, off spin, and leg spin. Handedness changes off/leg line selection; bowling arm changes movement direction. Bowling style descriptions use right-arm/right-handed conventions.
- Hard, green, dry, and damp surfaces; clear, overcast, and evening light; crosswind and ball wear. Cloud cover changes lighting and the air-density preset; it is not used as an arbitrary swing multiplier.
- Continuous collision detection between a moving ball and oriented, finite-width bat face, including edge detection and bat-velocity-dependent rebound.
- Mouse travel controls stroke depth directly instead of triggering a canned swing. Contact includes the surface velocity due to face rotation. Soft-handed defence uses a lower restitution coefficient.
- The ball starts at the animated bowling hand's world position. The eye-level camera follows the ball into the crease, tracks a struck ball briefly, and settles back on the bowler.

### Scene

- Poly Haven ground colour, normal and roughness maps and three HDR skies (clear, overcast, evening). Each sky is rotated so its photographed sun sits where the shadow-casting light is. ACES tone mapping with per-weather exposure, sun colour and fog.
- Everything else is procedural, generated on canvases at load: knotted netting on sagging panels, grass tufts that lean with the crosswind, lawn mottle and mowing stripes, pitch wear per surface (footmarks, roller lines, cracks on a dry deck), chalk creases, a slatted sight screen, a gabled pavilion with veranda and clock, a groundsman's shed, benches, hedge, fence and floodlights that glow in the evening.
- The batter: a lofted willow blade with a back spine, splice and painted grain; a ribbed rubber grip; padded batting gloves; two-bone arms with elbows, sleeves and cuffs; pads at the bottom of frame. The bat stays on the physics pose; the body leans and the head dips with the stroke and kicks on contact.
- The bowler runs in, gathers, bowls and follows through, and idles at the top of the mark between balls. Bails fly and the middle stump leans when bowled.
- Ball trail as a fading ribbon, a bounce puff, marks that accumulate on the strip, and a small glow that keeps a distant ball legible.
- Asset sources and licenses are listed in `ASSETS.md`.

### Audio

Everything is synthesised in the browser from a noise buffer and damped sine modes: a willow contact that changes with strike quality, edges and soft hands and scales with exit speed; bounce thuds that take their tone from the surface; a stump knock and bail rattle when bowled; the net; the bowler's footfalls and gather; a wind-and-leaves bed with occasional birdsong. No recordings, microphone access, or network requests.

### Fidelity limits

This remains a simulation foundation, **not a finished photorealistic or validated coaching model**. The ground and skies use photographed assets; equipment, buildings and the bowler are procedural and the bowler does not use motion capture. Swing/spin and surface coefficients are tunable approximations without CFD, empirical calibration, full seam orientation dynamics, reverse swing, or bat flex. There are no body/pad collisions, footwork, or LBW decisions. Automatic length and line variation is seeded.

## Structure and checks

- `dist/physics.js`: deterministic simulation, presets, collision model.
- `dist/scene.js`: Three.js environment, procedural textures and models, batter rig, camera.
- `dist/game.js`: input, delivery lifecycle, session state, HUD choreography, settings.
- `dist/bat-control.js`: mouse-driven stroke and three-axis bat orientation.
- `dist/audio.js`: generated impact sound and ambience.
- `dist/assets`: CC0 ground maps and HDR environments (about 9.8 MB total).
- `dist/fonts`: Barlow Condensed and DM Sans, latin subsets (about 50 KB).
- `dist/index.html` / `dist/style.css`: the interface.
- `tests/physics.test.mjs`: trajectory, speed, bounce, contact, outcome, and determinism checks.
- `tests/bat-control.test.mjs`: drag-driven movement, defensive absorption, cross-bat collision and release continuity.

```sh
node --test tests/*.test.mjs
npm run check
```

The `.openai/hosting.json` file configures static output. `dist` is portable to any static host.

### Verification status, 2026-09-06

All 17 simulation and control tests pass and the module syntax check is clean. The interface and scene were checked with a headless Chromium (software WebGL) harness that drives the intro, ready, run-up, flight, contact, miss, pause, help and conditions states at desktop, laptop, wide and phone sizes and in all three weathers. Frame rate on real GPUs, audio balance and mouse feel have not been measured on hardware; test on a real browser before calling it production-ready.

## References

- [MCC: The pitch](https://www.lords.org/mcc/the-laws/the-pitch)
- [MCC: The bat](https://www.lords.org/mcc/the-laws/the-bat)
- [Three.js documentation](https://threejs.org/docs/)

Third-party Three.js code is distributed under `dist/vendor/THREE-LICENSE.txt`.
