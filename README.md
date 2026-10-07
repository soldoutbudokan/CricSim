# CricSim

A first-person cricket nets simulator. Aim a contact point with the mouse, then push the mouse to play a complete attacking stroke with a regulation-width bat. Flow controls need no click; Standard controls keep the click or tap; optional Manual controls keep gesture-driven drives, cuts, pulls and sweeps. Face pace or spin and change the pitch and conditions. Practice only: no teams, innings, runs, or match modes.

## Play

[Play CricSim on GitHub Pages](https://soldoutbudokan.github.io/CricSim/). Public access; no account or sign-in required. GitHub Pages is the primary and only public game host.

The `Deploy Production` workflow tests the source, runs `npm run build:pages`, and publishes the generated `.pages-dist` folder to the root of `gh-pages` with `scripts/publish-pages.sh`. Pages serves **Deploy from a branch → gh-pages → / (root)**. Every push to `main` publishes automatically. The old ChatGPT-hosted copy is retired from public use; development and publication use this repository. Preferences are stored per browser origin, so settings from the old address do not transfer automatically. The game has no server-side accounts or saved innings to migrate.

Every push to any other branch publishes a playable preview of that branch at `https://soldoutbudokan.github.io/CricSim/preview/<branch-slug>/` through the `Deploy Preview` workflow, beside production in the same `gh-pages` branch. The slug is the branch name in lower case with runs of other characters replaced by `-`, so `claude/epic-wright-f64ay0` is served at `preview/claude-epic-wright-f64ay0/`. The preview's opening screen shows its branch and commit under the loading status. Deleting the branch removes its preview. Production deploys never touch `preview/`. Previews share the browser origin with production, so saved preferences carry across. See `AGENTS.md` for the details.

## Run

Serve `dist` with any static HTTP server. For example:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. WebGL 2 is required. Three.js 0.180.0 is vendored with its MIT license, and the three web fonts are served from `dist/fonts`, so the game makes no third-party requests and works offline once cached.

For development with automatic reload, use Node 22.12 or newer:

```sh
npm ci
npm run dev
```

The game remains plain static files. Vite is a development-only dependency.

For the production copy, run `npm run build:pages`. It copies `dist` into `.pages-dist` and gives local scripts, their imports and stylesheets one content-based release version. This prevents a fresh page from reusing older cached code. Fonts and textures keep their existing cache URLs. The source in `dist` stays unchanged.

## Graphics and multitasking

Open **Conditions → Graphics & performance**. The choice is saved on this device.

| Setting | Active frame limit | Resolution budget | Shadows |
| --- | --- | --- | --- |
| Auto (default) | Up to 60 fps, falling to 30 under sustained load | Starts at Balanced; reduces between deliveries | Adapts with quality |
| Balanced | 60 fps | 1.8 million pixels, pixel ratio capped at 1.25 | 1024² |
| Eco | 30 fps | 1 million pixels, pixel ratio capped at 1 | Contact shadows only |
| High | 60 fps | 3 million pixels, pixel ratio capped at 1.75 | 2048² |

Choose **Eco** when watching a video or using other work apps alongside the game. It also reduces decorative grass and evening lighting work. Every setting uses the same detailed bat, gloves and bowler, and the same fixed 240 Hz collision simulation. High-refresh monitors no longer cause unlimited rendering. Auto lowers its budget only after sustained slow frames, applies changes between deliveries, and holds that level for the session; reselect Auto to reset it.

The opening view renders at up to 20 fps. Pausing retains the last frame, redrawing only when something changes; hidden tabs stop scheduling frames. The audio graph also suspends when paused, hidden or muted. The renderer lets the browser choose its normal GPU instead of requesting a high-performance GPU.

These are rendering budgets, not guaranteed frame rates. At a 1440×900 CSS-pixel window with device scale 2, Balanced allocates about 55% fewer drawing-buffer pixels and 75% fewer shadow-map pixels than the previous build. Actual responsiveness depends on the device and other running apps.

## Controls

**Flow** is the default and needs no click. Rest the blade outline where the ball will arrive, choose Grounded or Lofted, then push the mouse up. The push plays the same complete stroke as a Standard click, with the same repeatable power and the same timing window, aimed at the point where your hand rested before it pushed. Slow movement only aims, and so does any sideways or downward movement: a push counts when it is fast enough, long enough and within about sixty degrees of straight up. The bat reaches the contact area about 100 ms after the push begins at normal speed (200 ms at half speed); the aim is locked from that moment. A mouse click still plays the same stroke. To leave a ball, keep your hand still. With Defend chosen a push only aims; hold to block. **Swing trigger** in Practice tools sets how decisive a push must be (Light, Normal or Firm), and the stroke panel says "Push a little harder to swing" after an upward move that fell short.

**Standard** keeps the click or tap. Aim the blade outline where the ball will arrive, choose Grounded or Lofted, then click or tap. Each press commits one complete stroke with repeatable power; you do not need a swipe. The bat reaches the contact area about 100 ms after pressing at normal speed (200 ms at half speed). You can correct your aim during the first 65 ms, then it locks. Holding does not repeat the stroke. To leave a ball, do not start an attack.

Choose **Conditions → Practice tools → Batting controls** to switch between Flow, Standard and the original Manual swipe controls. Your choice is saved on this device. All three modes use the same regulation-width bat and ball physics. None of them tracks the ball or enlarges the contact area.

| Input | Action |
| --- | --- |
| Mouse movement | Aim the blade outline across the crease and vertically |
| Push up (Flow) | Play one complete Grounded or Lofted stroke from the point where the hand rested; no button |
| Left click / tap (Standard) | Play one complete Grounded or Lofted stroke |
| Left click + upward swipe (Manual) | Lift the bat, then drive through the aimed point |
| Left click + sideways swipe (Manual) | Cut or pull a high ball; sweep a low ball |
| Diagonal swipe (Manual) | Angle a drive; swipe speed controls bat speed |
| Release | Flow and Standard attacks finish and remain shot attempts. Manual retains release-to-leave feedback; a committed flick can still hit. Release a held block to leave in any mode. |
| Right click | Hold a soft-handed block and move it onto the ball's line. Release before the ball passes to leave. |
| 1 / 2 / 3 or shot buttons | Choose Grounded, Lofted or Defend; Defend also works with left click or touch |
| A / D | Fine adjustment of the bat face |
| W / S | Fine adjustment of loft |
| Q / E | Fine adjustment of blade roll |
| C | Clear the three fine adjustments |
| Space | Take guard, then bowl the next delivery |
| P / Escape | Pause or resume; Escape also closes an open panel |
| B · H · Y | Cycle bowling style · bowling arm · your stance |
| [ / ] | Release speed −5 / +5 km/h |
| J | Cycle pace variation |
| L · K | Cycle length · line |
| U · O | Cycle surface · sky and light |
| − / = | Crosswind −5 / +5 km/h |
| , / . | Ball age −10 / +10 overs |
| T · V | Cycle simulation speed · Flow swing trigger or Manual swipe length |
| G · X | Toggle the bat guide and ball trail · continuous deliveries |
| M · F · N | Sound · fullscreen · the conditions drawer |
| / | The shortcuts sidebar, where every key above can be switched off |
| ? | Instructions |

Every key is listed in the shortcuts sidebar with a switch. Turn off any that clash with your setup; the buttons and menus keep working. Choices are saved on the device. A key that changes a condition shows a short notice under the scorebug and applies to the next ball.

On touch in Flow, touch the contact point, hold still for a moment, then swipe up; a plain tap does nothing. In Standard, tap the contact point to aim and swing. In Manual, put a finger at the contact point and swipe up or across. Select Defend and hold for a block. All shot choices work without a keyboard. **Practise at half speed** on the opening screen starts with slower play and middle-stump deliveries.

In Manual, aim before pressing: the contact ring stays anchored during the swipe. Holding without moving prepares the backlift; it does not swing. The backlift follows the hand both ways until the swing commits a quarter of the way through; from there the blade keeps the pace the hand gave it, eases off rather than stopping dead when the pointer stalls, and never runs backwards. Letting go after the commit point finishes the stroke with the blade live; letting go before it pulls out. The middle section of the stroke meter shows the contact portion of the arc. The bat's path is shaped by your gesture, never by the incoming ball. Guard, cancelled strokes and the return to guard cannot score accidental hits. **Swipe length** in Practice tools sets how far the hand travels for a full stroke.

## Interface

- The opening screen pairs a warm paper session sheet with a live view along the practice wicket. A serif CricSim masthead, ruled condition rows and a cricket-red Take guard button give it the character of a club scorebook. Bowling, release speed, surface, length and line, crosswind, ball age and practice speed reflect the actual saved settings. Half-speed practice sits under Take guard as a secondary button. On a landscape phone the Take guard block stays pinned to the bottom of the sheet. Conditions, batting help, sound and fullscreen remain accessible before starting.
- The menu uses its own camera and renders inside the visible ground panel; the batting rig stays hidden until taking guard. On phones, the ground sits above the session sheet and the menu scrolls when needed. The in-play camera and controls are unchanged by the menu composition.
- The in-play HUD shares the menu's type and paper: the CricSim wordmark and the panel, dialog and pause titles use the same serif, the primary buttons are paper on ink, and lime marks only interactive state.
- The 3D view fills the window. Conditions, session statistics and delivery information stay at the edges. The scorebug keeps fixed widths, so it does not shift as figures change. Shot intent, stroke name and a compact stroke meter replace the three constantly changing angle readouts; fine adjustments appear only when used.
- Taking guard leaves you at the crease; Space or **Next ball** starts the bowler. Short coaching lines appear under the readout for the first three balls. On phones and tablets the readout sits on a glass panel so it stays legible over the pitch, and steps aside while the ball is in flight so it never hides the ball at the crease. On landscape phones, tablets and laptops up to 1280 px wide the stroke panel stacks above **Next ball** at the right edge, clear of the crease line and the off-stump contact point; on landscape phones the scorebug joins the top row so it never covers the bowler's release. The HUD keeps clear of notches and the home indicator.
- On desktop the result card rises as a lower third in place of the delivery readout, with the delivered pace in its label, clear of the bowler and the ball's path; on phones and short landscape screens it stays compact under the scorebug. On smaller screens, a notice that arrives while the card is up moves above the stroke panel.
- Results show outcome, shot, timing, exit speed and contact location on the blade. Stroke intent and timing are sampled at contact or as the ball passes the contact plane, so later pointer input cannot rewrite the feedback. Standard distinguishes early/late timing from line/height errors, and a committed click that misses reads **Played & missed** even after release or recovery. Manual retains **Left alone** for released misses and **Played & missed** for held committed misses. Being bowled flashes the frame edge red and always remains a dismissal.
- The **Control** figure in the scorebug is the share of balls the bat met or that were left alone safely, including Manual strokes you started and backed off. A Standard attack that misses, a held Manual swing or defensive block that misses, or being bowled is not control. **Clean** counts contact through the middle of the blade. A released flick that hits still counts as a shot. A held block that misses reads **Played & missed**, with **Beaten** timing and the gap diagram; releasing the block before the ball passes is a leave. This applies to right-click defence and the Defend mode.
- A full miss gets a larger diagram showing the ball relative to the rotated blade from the batter's side, with left/right and above/below labels and the closest surface gap in centimetres. The diagram fits both the ball and bat without clipping wide misses. Distance is measured across each physics step, including the ball radius and blade thickness, and freezes when the delivery resolves. Safe leaves say **Safe leave**, without a miss-distance label.
- A shortcuts sidebar (the keyboard button or `/`) lists every key, grouped by what it changes, each with its own switch and a master switch.
- Conditions open in a drawer over the scene at every size (a bottom sheet with a grabber on phones), pausing play while you make changes and restoring the previous pause state when closed. The pause card stays hidden behind an open panel or the help dialog.
- The blade outline projects the actual contact face and its orientation; the small ring marks its centre. The ring fills an arc as the stroke moves, squares off while blocking and flashes on contact. Camera-ray aiming places it under the pointer within the bat's reach. Swipe distance uses screen coordinates, so camera movement or clamping at the edge cannot change a stroke.
- Self-hosted Newsreader (serif), Barlow Condensed (numerals and verdicts) and DM Sans (text), reduced-motion support, keyboard focus rings throughout. The help dialog lists touch controls first on touch screens.

## Simulation

- First-person camera at 1.72 m, a 20.12 m wicket-to-wicket pitch, 0.108 m blade width, 0.072 m ball diameter, and 0.711 m stumps.
- Fixed 240 Hz physics, separate from rendering and simulation speed.
- A numerical release-angle solver, gravity, quadratic aerodynamic drag, a tunable swing side force, spin dip/drift, seam deviation, and pitch-dependent restitution and friction.
- **Pace variation** draws each ball's speed from a bell curve around the release speed, clipped at two and a half spreads: consistent, slight (about ±2 km/h), natural (about ±4) or mixed (about ±7, with the odd slower ball). The draw comes after the other seeded noise, so length, line and seam for a seed are the same whatever the spread.
- Right- and left-arm fast pace, inswing, outswing, off spin, and leg spin. Handedness changes off/leg line selection; bowling arm changes movement direction. Bowling style descriptions use right-arm/right-handed conventions.
- Hard, green, dry, and damp surfaces; clear, overcast, and evening light; crosswind and ball wear. Cloud cover changes lighting and the air-density preset; it is not used as an arbitrary swing multiplier.
- Continuous collision detection between a moving ball and oriented, finite-width bat face, including edge detection and bat-velocity-dependent rebound.
- Standard and Flow use a fixed backlift, stable face through contact and follow-through, driven only by the chosen target, intent and the moment the stroke starts. Forward blade motion supplies its power through the existing collision physics.
- Flow reads the pointer's speed in real time from the event timestamps, including coalesced samples, in screen units where the shorter window side is 1.6 units. Movement slower than 0.9 units per second is a rest; a push must reach 2.0, 2.6 or 3.4 units per second (Light, Normal, Firm) over 0.06, 0.08 or 0.11 units, within sixty degrees of straight up. The stroke starts at the last resting point and is dated up to 30 ms before the push was noticed, so the bat is where the hand expects it. An event after 80 ms of silence means the hand rested where the last sample was, which is what a still mouse looks like; that first event never decides a push by itself, so a browser that delivers sparse events cannot read slow aiming as a push. The next ball, a pause or a change of intent keeps the hand where it is, so a mouse held still through the run-up can push as the ball arrives. A fresh hand (a finger placed elsewhere, a pointer entering the canvas, a resize, a teleport) must rest, or be silent for 80 ms, before it may swing, and the tail of a push cannot swing again until the hand rests. The thresholds are in real time, so half-speed practice needs the same hand movement.
- In Manual, swipe displacement advances a curved backlift, downswing and follow-through. The stroke's progress is one smooth state with bounded velocity and acceleration; the blade, the stroke meter, the timing feedback and the collision model all read it, so a staircase of pointer events cannot show up as a stutter. Past the commit point the stroke carries a decaying momentum floor, so it completes at the pace the hand set. Automatic face and wrist rotation distinguish vertical drives from horizontal cuts, pulls and sweeps. Cross-bat shots stay level through the contact area. Shared curve tangents preserve speed through impact. Gesture direction is read from the whole backlift and freezes at the commit point, so a hand that curls on its way up still plays the drive it meant, and jitter or reversals cannot accumulate power.
- Translation and rotation are smoothed and speed-limited. Blade corners remain above the pitch. Contact includes the surface velocity due to face rotation. Soft-handed defence uses a lower restitution coefficient; lofted intent changes the physical launch angle.
- The ball starts at the animated bowling hand's world position. A steady eye-level view includes the release and contact area without diving after the incoming ball. It tracks a struck ball briefly, then settles back. Portrait screens preserve enough horizontal field of view for off-stump deliveries.

### Scene

- Poly Haven ground colour, normal and roughness maps and three HDR skies (clear, overcast, evening). Each sky is rotated so its photographed sun sits where the shadow-casting light is. Khronos PBR Neutral tone mapping with per-weather exposure, sun colour and fog. In clear weather the sun sits behind the batter's left shoulder, so the bowler and sight screen are front-lit. The lawn shader remaps the photographed sparse-grass map to mown-lawn greens, and the ground runs out far enough to meet the sky without a seam.
- Everything else is procedural, generated on canvases at load: knotted netting on sagging panels that flutters in a crosswind, hung from round galvanised rails and posts with clamp collars and ties, windbreak skirts with folds and reinforced hems, long grass along the net skirts that leans with the crosswind, lawn mottle and mowing stripes, pitch wear per surface (soil grain, grassy edges, soft roller bands, crease scuffs and footmarks, live grass on a green top, a crack network on a dry deck, damp patches on a soft one), chalk creases, a sight screen of bevelled boards on a galvanised frame with rubber-tyred wheels, a weatherboarded pavilion under a slate roof with a veranda, benches, sills, a panelled door, gutters, a chimney and a clock, a timber groundsman's shed with a window, a water butt and the heavy roller parked beside it, benches, hedge, fence and floodlights that glow and light the strip in the evening. The lanes carry their kit: concrete footings under the net posts, the bowler's marker disc, a bucket of practice balls, kit bags, cones in the neighbouring lanes and a spare bat resting against the side net.
- The batter: a lofted willow blade with a back spine, splice, oiled edges, painted grain and a face sticker that reads the right way round from the bowler's end; a ribbed rubber grip; batting gloves with four curled fingers of different lengths, each a run of separate curved pads over a leather underside with piping along the joints, a padded thumb, a leather palm round the handle, split back-of-hand shields with sewn welts and a knuckle row, and an elastic cuff with a lining and a strap, closed against the hand so the batter never looks into it; leather and fabric keep different roughness under a sub-millimetre grain; ribbed-knit forearm sleeves with round hems that fade out toward the elbow; pads that come into frame on portrait phones and while the view follows a struck ball. The physics grip sits about a metre in front of the eye, beyond a real arm's reach, so only the forearms are drawn and the arms never fill the frame; an elbow solve still aims each forearm and glove cuff. The bat stays on the physics pose. Low shots transfer weight onto the front foot, higher shots sit back, and cross-bat shots turn the shoulders. Head movement stays small and contact produces a subtle kick.
- The bowler has shaped body and clothing surfaces: a skull deeper than it is wide with a jaw, ears, nose, lips, brows and eyes, hair under a peaked six-panel cap with a sweatband, a neck that pivots at its base into a folded polo collar, deltoids domed over the shoulder joints, forearms with flattened palms, curled fingers and thumbs, trousers that close between the thighs with belt loops and seams, and layered running shoes with laces whose tread rests on the pitch. The shirt, sleeves and trouser legs carry tension folds, and each finger is one continuous curved surface. Every part is one vertex-colour mesh, and roughness travels per vertex so skin and eyes catch the sun while the cloth stays matte. Smooth delivery curves continue through the release; two-bone leg animation plants the support foot in world space. The ball launches from the animated hand in both bowling arms. Bails fly and the middle stump leans when bowled.
- The blade has bevelled edges, a rounded toe and shoulders and a crowned spine; pads are a cream shell twice as wide as it is deep with seven tapered bolsters following its curve from instep to knee, three knee rolls bent round the shin, a top flap and strap buckles on both sides. Stumps are turned with a steel shoe, a lacquered shaft, a brass ferrule and a domed cap; bails are barrels with spigots. The ball wears dyed leather with pore grain, quarter seams, six rows of individual stitches either side of a narrow seam groove and a gold maker's stamp; one half is polished and the other rougher, and the whole leather dulls with the ball's age. Material relief is measured in fractions of a millimetre, keeping wood grain and fabric subtle. The bat's regulation dimensions and collision geometry are unchanged.
- Ball trail as a fading ribbon, a lime bounce ring when the guide is on, a bounce puff, marks that accumulate on the strip, a single contact shadow under the ball, and a small glow that keeps a distant ball legible.
- Asset sources and licenses are listed in `ASSETS.md`.

### Audio

Everything is synthesised in the browser from a noise buffer and damped sine modes: a willow contact that changes with strike quality, edges and soft hands and scales with exit speed; bounce thuds that take their tone from the surface; a stump knock and bail rattle when bowled; the net; the bowler's footfalls and gather; a wind-and-leaves bed with occasional birdsong. No recordings, microphone access, or network requests.

### Fidelity limits

This remains a simulation foundation, **not a finished photorealistic or validated coaching model**. The ground and skies use photographed assets; equipment, buildings and the bowler are procedural and the bowler does not use motion capture. Swing/spin and surface coefficients are tunable approximations without CFD, empirical calibration, full seam orientation dynamics, reverse swing, or bat flex. Footwork is procedural body animation, not a separate player-controlled movement system. There are no body/pad collisions or LBW decisions. Automatic length and line variation is seeded. Grounded intent lowers the face angle; incoming bounce, contact location and timing still affect the launch.

## Structure and checks

- `dist/physics.js`: deterministic simulation, presets, collision model.
- `dist/scene.js`: Three.js environment, procedural textures and models, batter rig, camera.
- `dist/bowler.js`: merged articulated bowler, continuous delivery timeline and planted-foot leg animation.
- `dist/equipment.js`: shaped bat and gloves, sewn panel geometry and leather/fabric surface material.
- `tests/scene-geometry.test.mjs`: real scene construction and geometry checks with browser/GPU boundaries stubbed; environment, quality, handedness and delivery-animation coverage. This does not compile shaders or verify rendered pixels.
- `dist/render-policy.js`: quality budgets, frame pacing and sustained-load adaptation.
- `tests/runtime-smoke.mjs`: actual game entrypoint with a simulated browser lifecycle and real bat/ball physics; run with `npm run test:runtime` (also included in `npm test`).
- `dist/game.js`: input, delivery lifecycle, session state, HUD choreography, settings.
- `dist/bat-control.js`: Flow push detection (pointer sampling, rest anchoring, the upward cone and the swing trigger), Standard timed strokes and early aim correction, Manual gesture-shaped stroke arcs, physical contact preview, shot intent, swipe length and three-axis fine adjustment.
- `dist/shortcuts.js`: the keyboard shortcut table, key matching and the saved on/off state behind the shortcuts sidebar.
- `dist/batter-motion.js`: stance, shoulder/foot placement and stable batting-camera geometry.
- `dist/shot-feedback.js`: feedback from the stroke sampled at contact or at the crease, the control rule for leaves, result headlines and miss-diagram geometry.
- `dist/audio.js`: generated impact sound and ambience.
- `dist/assets`: CC0 ground maps and HDR environments (about 9.8 MB total).
- `dist/fonts`: Newsreader (regular and italic), Barlow Condensed and DM Sans, latin subsets (about 130 KB). All three are under the SIL Open Font License; each licence sits beside its fonts in `dist/fonts` (`NEWSREADER-OFL.txt`, `BARLOW-CONDENSED-OFL.txt`, `DM-SANS-OFL.txt`).
- `dist/index.html` / `dist/style.css`: the interface; `dist/menu.css` isolates the scorebook-style opening screen from the in-play HUD.
- `tests/physics.test.mjs`: trajectory, speed, pace variation, bounce, contact, near-miss, outcome, and determinism checks.
- `tests/flow-control.test.mjs` with `tests/flow-hand.mjs`: a simulated hand (120 Hz samples, 1/60 s frames, real timestamps) that rests, pushes, holds still without sending events and clicks; Flow's push detection, rest anchoring, cone, gap rule, trigger levels, click fallback, hint, time-scale independence, timing window, all lengths and lines, bounds and feedback.
- `tests/bat-control.test.mjs`: swipe shape, handedness, displacement, commit and momentum, direction reading, swipe length, speed and acceleration limits, ground clearance, defence and release safety.
- `tests/batting-play.test.mjs`: repeatable aimed strokes against seeded deliveries, shot direction, loft, flick release, input rates, feedback, the control rule and camera geometry.
- `tests/shortcuts.test.mjs`: shortcut matching, modifier chords, per-key and master switches, persistence and setting cycles.
- `tests/pages-build.test.mjs` and `tests/publish-pages.test.mjs`: versioned Pages builds and the build label; publishing to `gh-pages` against a local repository, including previews surviving production deploys, cleanup and a push race.
- `scripts/publish-pages.sh`: commits a built directory into `gh-pages`, at the root for production or under `preview/<slug>/` for a branch; `.github/workflows/deploy-preview.yml` runs it for every other branch and removes the preview when the branch is deleted.

```sh
npm test
npm run check
```

`dist` is portable to any static host and uses relative asset paths, including under GitHub Pages' `/CricSim/` prefix and the `/CricSim/preview/<slug>/` previews. Publication is configured by `.github/workflows/deploy-prod.yml` and `deploy-preview.yml`; `scripts/build-pages.mjs` prepares the versioned static output and `scripts/publish-pages.sh` commits it to `gh-pages`.

### Verification status, 2026-10-07

The model detail pass (bowler clothing, hands and shoes; gloves, blade and ball; net rails, fittings and skirts; sight screen) keeps the blade's collision footprint, the batting controls, the bowler's release and its 14-mesh, under-10,000-triangle budget. All 130 automated tests, 21 entrypoint lifecycle checks, JavaScript syntax checks and the static Pages build pass. The new scene-geometry test constructs the real scene with the browser and GPU stubbed and checks finite geometry and transforms, valid indices, mirrored gloves, and environment, quality, resize and delivery transitions. The merged build was rendered in headless Chromium (SwiftShader) beside the previous build from free cameras: the bowler at rest, mid-stride and at release with close-ups of the face, hands and shoes; the gloves from above, from the bowler's end and in the left-handed stance; the blade, the pads and the ball new and after seventy overs; the net posts, rails, ties and skirt; the sight screen and its wheels; and the batting view in clear, overcast and evening light. The glove material compiled without console errors. Those renders also decided what not to take from the review branch: its re-sculpted face put the eyes under the skin, and its hedge of foliage clusters read as a row of spheres, so the previous face and hedge stay. The scene now submits about 163,000 triangles before culling at High, against about 82,000 before, most of the increase in the net skirts, hems and ties, the gloves and the ball seam. Rendering on real GPUs still needs a player check on the preview.

### Verification status, 2026-10-05

All 126 automated tests, 21 entrypoint lifecycle checks and JavaScript syntax checks pass after the model refresh. The bowler keeps its 14-mesh budget at 9,216 triangles, its release position and the continuity of its delivery. The new models were checked in headless Chromium (SwiftShader) from free cameras: the bowler at rest, mid-stride, at release and in the follow-through in clear and evening light, with close-ups of the head, cap and hands; the gloves from above, from the bowler's end and in the left-handed stance; the pads and the wicket from beside the crease; the ball new and after seventy overs; the pavilion, shed and roller; the far end of the lane with its kit; and the batting view in all three weathers, both stances and portrait. The batting view draws about 118 calls and 106,000 triangles including the shadow pass. Rendering on real GPUs still needs a player check on the preview.

### Verification status, 2026-09-28

All 126 automated tests, 21 entrypoint lifecycle checks and JavaScript syntax checks pass. Flow coverage uses a simulated hand with real timestamps: a push starts one stroke and no button is involved; a vertical push steps in lockstep with a Standard click at the same target; slow aiming, short height corrections and fast sideways moves never swing; the aim is the rest point and stays locked until the stroke is over; the tail of a push cannot swing again; a click still plays the stroke and lands near the rest point mid-push; blocks stay held under a fast hand; only pushes within sixty degrees of straight up swing; a silent still mouse anchors the push where it stopped and re-arms a second push; a restarted hand must rest first, while the next ball keeps a still mouse's place so it can push straight away; a pointer reappearing far away after a silence is a new hand, but a push noticed late after a hitch still swings; sparse one-per-frame events cannot turn slow aiming into a push; with Defend chosen a push only aims; a click during a sideways correction plays where the outline is; a short upward move leaves a hint that a real push clears; Light, Normal and Firm order the trigger; half-speed practice needs the same real hand movement and dates the stroke in stroke time; the Standard timing window (at least 95 ms of clean contact in a 5 ms sweep, for both intents) and all lengths, speeds and lines in both stances are kept; poses mirror with stance within the motion bounds and above the pitch; and feedback treats a push like a click. The entrypoint checks cover the Flow default and fallback, persistence of all three modes and the swing trigger, a click in Flow, a rest-then-push through the contact plane exactly once with the aim at the rest point, resumed aiming, a held block under a fast hand, a touch tap doing nothing, a touch rest-then-swipe swinging, and a new touch never reading as a push. Pages tests cover the build label, publishing previews beside production and the workflow step outputs. The available test browser has WebGL disabled, so the feel of the push on a real mouse, trackpad and phone still needs a player check on the preview.

### Verification status, 2026-09-26

All 95 automated tests, 19 entrypoint lifecycle checks and JavaScript syntax checks pass. Standard coverage includes single-click release, aim correction and locking, no held-button repeats, cancellation, both stances, all lengths, bowling speeds and lines, distinct grounded/lofted launches, and unchanged physical contact dimensions. Manual tests continue to pass. Three build tests check versioned imports, deterministic releases, unchanged static assets and loading fresh dependencies with older modules already cached. Feedback tests preserve committed Standard misses and frozen results, and separate timing from line/height errors.

A deterministic 140 km/h reference delivery with exact arrival-point aim gives clean-contact timing windows of 150 ms grounded and 130 ms lofted, compared with about 20 ms for the previous fast swipe. These are simulation results, not measured player success rates. The player still has to read the ball and aim.

The entrypoint checks use the real game/physics modules with a simulated DOM, frame scheduler, renderer and audio. They cover saved controls and graphics, frame caps, paused and hidden suspension, resume without time catch-up, panels, Auto fallback, mouse/touch defence, and cancelled attacks. Earlier geometry audits cover finite coordinates, bowler anatomy, joints and equipment shape. GitHub Pages asset paths have been checked under `/CricSim/`. The available test browser has WebGL disabled, so final lighting/materials, subjective control feel, and multitasking performance on a work laptop still need a player check.

### Previous verification, 2026-09-23

All 59 automated simulation, control, shortcut and batting-play tests pass. They cover seeded contact across lengths and stances, stroke momentum, input rates, leaves before and after commitment, missed swings held through the ball, held versus released blocks in Defend mode and right-click defence, frozen input snapshots, dismissal precedence, swept miss distances, rotated diagrams and wide-miss bounds. JavaScript syntax checks pass. The visual refresh was checked in headless Chromium (SwiftShader) against the previous build at desktop, laptop, tablet and phone sizes in portrait and landscape, in every weather and on every surface. The checks confirmed the bowler's release point and the batting camera are numerically unchanged, and found no console errors or third-party requests. Rendering on real GPUs, audio balance, touch ergonomics and subjective mouse feel still need an interactive check.

## References

- [MCC: The pitch](https://www.lords.org/mcc/the-laws/the-pitch)
- [MCC: The bat](https://www.lords.org/mcc/the-laws/the-bat)
- [Three.js documentation](https://threejs.org/docs/)

Third-party Three.js code is distributed under `dist/vendor/THREE-LICENSE.txt`.
