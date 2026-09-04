# CricSim

A first-person cricket nets simulator. Move a regulation-width bat with the mouse, face pace or spin, and change the pitch and conditions. Practice only: no teams, innings, runs, or match modes.

## Run

Serve `dist` with any static HTTP server. For example:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. WebGL 2 is required. Three.js 0.180.0 is vendored with its MIT license, so no package install or CDN JavaScript is required. Optional Google Fonts fall back to system fonts when offline.

## Controls

| Input | Action |
| --- | --- |
| Mouse movement | Position the blade across the crease and vertically |
| Left click + movement | Play a stroke; movement speed adds power |
| Right click | Defend; reposition the bat to meet the ball |
| A / D | Turn the bat face |
| W / S | Increase / reduce loft |
| C | Reset face and loft |
| Space | Next delivery |
| P / Escape | Pause or resume |
| ? | Instructions |

Touch dragging is supported. A mouse and keyboard provide full control. Start with half-speed practice and middle-stump deliveries to learn contact.

## Simulation

- First-person camera at 1.72 m, a 20.12 m wicket-to-wicket pitch, 0.108 m blade width, 0.072 m ball diameter, and 0.711 m stumps.
- Fixed 240 Hz physics, separate from rendering and simulation speed.
- A numerical release-angle solver, gravity, quadratic aerodynamic drag, a calibrated swing side force, spin dip/drift, seam deviation, and pitch-dependent restitution and friction.
- Right- and left-arm fast pace, inswing, outswing, off spin, and leg spin. Handedness changes off/leg line selection; bowling arm changes movement direction. Bowling style descriptions use right-arm/right-handed conventions.
- Hard, green, dry, and damp surfaces; clear, overcast, and evening light; crosswind and ball wear. Cloud cover changes lighting and the air-density preset; it is not used as an arbitrary swing multiplier.
- Continuous collision detection between a moving ball and oriented, finite-width bat face, including edge detection and bat-velocity-dependent rebound.
- Net impacts, stumps, repeated practice deliveries, contact percentage, clean strikes, and exit speed.
- Settings are saved on this device. Session stats stay in memory. No accounts, uploads, analytics, or backend data collection.

### Fidelity limits

This is a playable simulation foundation, **not photorealistic or a validated coaching model**. The environment, equipment, and articulated bowler are procedural; the bowler does not use motion capture. Swing/spin and surface coefficients are tunable approximations, without CFD, empirical calibration, full seam orientation dynamics, reverse swing, or bat flex. There are no body/pad collisions, footwork, or LBW decisions. The available automatic length and line variation is seeded. A batter's input defines a single stroke path rather than a full arm biomechanics model. The first-person ball uses physical scale; slow practice and a trail help develop timing.

A production fidelity pass should add scanned PBR ground/equipment assets, a rigged human model and captured actions, spatial environmental sound, measured delivery calibration, full body contact, and playtesting on real mouse hardware.

## Structure and checks

- `dist/physics.js`: deterministic simulation, presets, collision model.
- `dist/scene.js`: Three.js environment, procedural models, camera, rendering.
- `dist/game.js`: input, delivery lifecycle, session state, audio, settings.
- `dist/index.html` / `dist/style.css`: responsive game interface.
- `tests/physics.test.mjs`: trajectory, speed, bounce, contact, outcome, and determinism checks.

```sh
node --test tests/physics.test.mjs
```

The `.openai/hosting.json` file identifies the private Sites deployment; `dist` is also portable to another static host. The game's source is maintained in the CricSim GitHub repository. No browser QA has been performed unless explicitly recorded in a later change.

## References

- [MCC: The pitch](https://www.lords.org/mcc/the-laws/the-pitch)
- [MCC: The bat](https://www.lords.org/mcc/the-laws/the-bat)
- [Three.js documentation](https://threejs.org/docs/)

Third-party Three.js code is distributed under `dist/vendor/THREE-LICENSE.txt`.
