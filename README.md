# CricSim

A first-person cricket nets simulator. Aim a contact point and swipe through drives, cuts, pulls and sweeps with a regulation-width bat. Face pace or spin and change the pitch and conditions. Practice only: no teams, innings, runs, or match modes.

## Play

[Play CricSim](https://cricsim-nets.soldoutbudokan.chatgpt.site). Public access; no account or sign-in required.

An optional GitHub Pages mirror can use https://soldoutbudokan.github.io/CricSim/ once Pages is enabled in the repository settings.

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
| Mouse movement | Aim the contact ring across the crease and vertically |
| Left click + upward swipe | Lift the bat, then drive through the aimed point |
| Left click + sideways swipe | Cut or pull a high ball; sweep a low ball |
| Diagonal swipe | Angle a drive; swipe speed controls bat speed |
| Release | Follow through after contact, then return to guard |
| Right click | Hold a soft-handed block and move it onto the ball's line |
| 1 / 2 / 3 or shot buttons | Choose Grounded, Lofted or Defend; Defend also works with left click or touch |
| A / D | Fine adjustment of the bat face |
| W / S | Fine adjustment of loft |
| Q / E | Fine adjustment of blade roll |
| C | Clear the three fine adjustments |
| Space | Take guard, then bowl the next delivery |
| P / Escape | Pause or resume; Escape also closes the conditions drawer |
| ? | Instructions |

On touch, put a finger at the contact point and swipe up or across. Select Defend and hold for a block. All shot choices work without a keyboard. **Learn at half speed** starts with slower play and middle-stump deliveries.

Aim before pressing: the contact ring stays anchored during the swipe. Holding without moving prepares the backlift; it does not swing. Hold through contact, then release. The middle section of the stroke meter shows the contact portion of the arc. The bat's path is shaped by your gesture, never by the incoming ball. Guard, cancelled preparation and released follow-through cannot score accidental hits.

## Interface

- The opening screen pairs a warm paper session sheet with a live view along the practice wicket. A serif CricSim masthead, ruled condition rows and a cricket-red Take guard button give it the character of a club scorebook. Bowling, release speed, surface and practice speed reflect the actual saved settings. Conditions, batting help, sound and fullscreen remain accessible before starting.
- The menu uses its own camera and renders inside the visible ground panel; the batting rig stays hidden until taking guard. On phones, the ground sits above the session sheet and the menu scrolls when needed. The in-play camera and controls are unchanged by the menu composition.
- The 3D view fills the window. Conditions, session statistics and delivery information stay at the edges. Shot intent, stroke name and a compact stroke meter replace the three constantly changing angle readouts; fine adjustments appear only when used.
- Taking guard leaves you at the crease; Space or **Next ball** starts the bowler. Short coaching lines appear under the readout for the first three balls.
- Results show outcome, shot, timing, exit speed and contact location on the blade. Timing is sampled at contact or as the ball passes the contact plane, so later pointer input cannot rewrite the feedback. Early, late, released early and missed-line feedback have different advice. Being bowled flashes the frame edge red.
- Conditions open in a drawer over the scene at every size (a bottom sheet on phones), pausing play while you make changes and restoring the previous pause state when closed.
- The ring marks the aimed contact point, fills an arc as the stroke moves, squares off while blocking and flashes on contact. Camera-ray aiming places it under the pointer within the bat's reach. Swipe distance uses screen coordinates, so camera movement or clamping at the edge cannot change a stroke.
- Dark theme only, self-hosted Barlow Condensed and DM Sans, reduced-motion support, keyboard focus rings throughout.

## Simulation

- First-person camera at 1.72 m, a 20.12 m wicket-to-wicket pitch, 0.108 m blade width, 0.072 m ball diameter, and 0.711 m stumps.
- Fixed 240 Hz physics, separate from rendering and simulation speed.
- A numerical release-angle solver, gravity, quadratic aerodynamic drag, a tunable swing side force, spin dip/drift, seam deviation, and pitch-dependent restitution and friction.
- Right- and left-arm fast pace, inswing, outswing, off spin, and leg spin. Handedness changes off/leg line selection; bowling arm changes movement direction. Bowling style descriptions use right-arm/right-handed conventions.
- Hard, green, dry, and damp surfaces; clear, overcast, and evening light; crosswind and ball wear. Cloud cover changes lighting and the air-density preset; it is not used as an arbitrary swing multiplier.
- Continuous collision detection between a moving ball and oriented, finite-width bat face, including edge detection and bat-velocity-dependent rebound.
- Swipe displacement advances a curved backlift, downswing and follow-through. Automatic face and wrist rotation distinguish vertical drives from horizontal cuts, pulls and sweeps. Cross-bat shots stay level through the contact area. Shared curve tangents preserve speed through impact. Gesture direction locks after a small dead zone, so jitter and repeated reversals cannot accumulate power.
- Translation and rotation are smoothed and speed-limited. Blade corners remain above the pitch. Contact includes the surface velocity due to face rotation. Soft-handed defence uses a lower restitution coefficient; lofted intent changes the physical launch angle.
- The ball starts at the animated bowling hand's world position. A steady eye-level view includes the release and contact area without diving after the incoming ball. It tracks a struck ball briefly, then settles back. Portrait screens preserve enough horizontal field of view for off-stump deliveries.

### Scene

- Poly Haven ground colour, normal and roughness maps and three HDR skies (clear, overcast, evening). Each sky is rotated so its photographed sun sits where the shadow-casting light is. ACES tone mapping with per-weather exposure, sun colour and fog.
- Everything else is procedural, generated on canvases at load: knotted netting on sagging panels, grass tufts that lean with the crosswind, lawn mottle and mowing stripes, pitch wear per surface (footmarks, roller lines, cracks on a dry deck), chalk creases, a slatted sight screen, a gabled pavilion with veranda and clock, a groundsman's shed, benches, hedge, fence and floodlights that glow in the evening.
- The batter: a lofted willow blade with a back spine, splice and painted grain; a ribbed rubber grip; padded batting gloves; two-bone arms with elbows, sleeves and cuffs; pads at the bottom of frame. The bat stays on the physics pose. Low shots transfer weight onto the front foot, higher shots sit back, and cross-bat shots turn the shoulders. Both arm segments retain their length, with the shoulder girdle translating on long reaches. Head movement stays small and contact produces a subtle kick.
- The bowler runs in, gathers, bowls and follows through, and idles at the top of the mark between balls. Bails fly and the middle stump leans when bowled.
- Ball trail as a fading ribbon, a bounce puff, marks that accumulate on the strip, and a small glow that keeps a distant ball legible.
- Asset sources and licenses are listed in `ASSETS.md`.

### Audio

Everything is synthesised in the browser from a noise buffer and damped sine modes: a willow contact that changes with strike quality, edges and soft hands and scales with exit speed; bounce thuds that take their tone from the surface; a stump knock and bail rattle when bowled; the net; the bowler's footfalls and gather; a wind-and-leaves bed with occasional birdsong. No recordings, microphone access, or network requests.

### Fidelity limits

This remains a simulation foundation, **not a finished photorealistic or validated coaching model**. The ground and skies use photographed assets; equipment, buildings and the bowler are procedural and the bowler does not use motion capture. Swing/spin and surface coefficients are tunable approximations without CFD, empirical calibration, full seam orientation dynamics, reverse swing, or bat flex. Footwork is procedural body animation, not a separate player-controlled movement system. There are no body/pad collisions or LBW decisions. Automatic length and line variation is seeded. Grounded intent lowers the face angle; incoming bounce, contact location and timing still affect the launch.

## Structure and checks

- `dist/physics.js`: deterministic simulation, presets, collision model.
- `dist/scene.js`: Three.js environment, procedural textures and models, batter rig, camera.
- `dist/game.js`: input, delivery lifecycle, session state, HUD choreography, settings.
- `dist/bat-control.js`: anchored aiming, gesture-shaped stroke arcs, shot intent and three-axis fine adjustment.
- `dist/batter-motion.js`: stance, shoulder/foot placement and stable batting-camera geometry.
- `dist/shot-feedback.js`: feedback from the stroke sampled at contact or at the crease.
- `dist/audio.js`: generated impact sound and ambience.
- `dist/assets`: CC0 ground maps and HDR environments (about 9.8 MB total).
- `dist/fonts`: Barlow Condensed and DM Sans, latin subsets (about 50 KB).
- `dist/index.html` / `dist/style.css`: the interface; `dist/menu.css` isolates the scorebook-style opening screen from the in-play HUD.
- `tests/physics.test.mjs`: trajectory, speed, bounce, contact, outcome, and determinism checks.
- `tests/bat-control.test.mjs`: swipe shape, handedness, displacement, speed limits, ground clearance, defence and release safety.
- `tests/batting-play.test.mjs`: repeatable aimed strokes against seeded deliveries, shot direction, loft, input rates, feedback and camera geometry.

```sh
node --test tests/*.test.mjs
npm run check
```

The `.openai/hosting.json` file configures static output. `dist` is portable to any static host.

### Verification status, 2026-09-07

All 35 automated simulation, control and batting-play tests pass. The tests include seeded contact across four lengths and both stances, cuts and pulls, grounded versus lofted launches, input rates from 30 to 120 Hz, missed aim, release safety and camera projection. JavaScript syntax and local asset references are checked. This revision has not had an interactive browser or visual playtest. Rendering on real GPUs, audio balance, touch ergonomics and subjective mouse feel still need that check.

## References

- [MCC: The pitch](https://www.lords.org/mcc/the-laws/the-pitch)
- [MCC: The bat](https://www.lords.org/mcc/the-laws/the-bat)
- [Three.js documentation](https://threejs.org/docs/)

Third-party Three.js code is distributed under `dist/vendor/THREE-LICENSE.txt`.
