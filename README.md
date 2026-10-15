# CricSim

A first-person cricket nets simulator. Move the bat with the mouse: lift into a backswing, hold it, swing through or pull out. Flow controls need no click and keep the bat under your control throughout. Standard controls keep the click or tap; optional Manual controls keep gesture-driven drives, cuts, pulls and sweeps. Face pace or spin and change the pitch and conditions. Practice only: no teams, innings, runs, or match modes.

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

**Flow** is the default and needs no click. The mouse controls the bat continuously. Lift into a backswing of your chosen height, hold it there, lower it, or change direction. Move through the ball to strike; stop or reverse to check the shot. The bat has weight and follows with a small amount of lag, rather than completing a stroke on its own. The outline shows the actual blade.

Choose Grounded or Lofted to set the face's intent. Hand speed changes the bat's motion and therefore its impact; there is no push threshold or swing trigger setting. To leave, withdraw the blade from the ball's path. A stationary bat can still block a ball that reaches it. A left click does not start an automatic Flow stroke. Right click or a held Defend press gives the explicit soft-handed block.

**Standard** keeps the click or tap. Aim the blade outline where the ball will arrive, choose Grounded or Lofted, then click or tap. Each press commits one complete stroke with repeatable power; you do not need a swipe. The bat reaches the contact area about 100 ms after pressing at normal speed (200 ms at half speed). You can correct your aim during the first 65 ms, then it locks. Holding does not repeat the stroke. To leave a ball, do not start an attack.

Choose **Conditions → Practice tools → Batting controls** to switch between Flow, Standard and the original Manual swipe controls. Your choice is saved on this device. All three modes use the same regulation-width bat and ball physics. None of them tracks the ball or enlarges the contact area.

| Input | Action |
| --- | --- |
| Mouse movement (Flow) | Control the bat continuously, including backswing, hold, downswing and follow-through |
| Stop or reverse (Flow) | Hold the bat or check the shot; withdraw the blade to leave |
| Mouse movement (Standard / Manual) | Aim the contact outline across the crease and vertically |
| Left click / tap (Standard) | Play one complete Grounded or Lofted stroke |
| Left click + upward swipe (Manual) | Lift the bat, then drive through the aimed point |
| Left click + sideways swipe (Manual) | Cut or pull a high ball; sweep a low ball |
| Diagonal swipe (Manual) | Angle a drive; swipe speed controls bat speed |
| Release | Lifting a Flow touch releases control without completing a stroke. Standard attacks finish and remain shot attempts. Manual retains release-to-leave feedback; a committed flick can still hit. In Standard or Manual, release a held block to leave. |
| Right click | Hold a soft-handed block and move it onto the ball's line. Flow resumes direct control on release; Standard and Manual release to leave. |
| 1 / 2 / 3 or shot buttons | Choose Grounded, Lofted or Defend; Defend also works with left click or touch |
| A / D | Fine adjustment of the bat face |
| W / S | Fine adjustment of loft |
| Q / E | Fine adjustment of blade roll |
| C | Clear the three fine adjustments |
| Space | Take guard, then bowl the next delivery |
| P / Escape | Pause or resume; Escape also closes an open panel |
| B · H · R · Y | Cycle bowling style · bowling arm · over or around the wicket · your stance |
| [ / ] | Release speed −5 / +5 km/h |
| J | Cycle pace variation |
| L · K | Cycle length · line |
| U · O | Cycle surface · sky and light |
| − / = | Crosswind −5 / +5 km/h |
| , / . | Ball age −10 / +10 overs |
| T · V | Cycle simulation speed · Manual swipe length |
| G · X | Toggle the bat guide and ball trail · continuous deliveries |
| M · F · N | Sound · fullscreen · the conditions drawer |
| / | The shortcuts sidebar, where every key above can be switched off |
| ? | Instructions |

Every key is listed in the shortcuts sidebar with a switch. Turn off any that clash with your setup; the buttons and menus keep working. Choices are saved on the device. A key that changes a condition shows a short notice under the scorebug and applies to the next ball.

On touch in Flow, touch and move to control the bat, hold your finger still to hold it, and reverse direction to pull back. Lifting releases direct control without an automatic finish. In Standard, tap the contact point to aim and swing. In Manual, put a finger at the contact point and swipe up or across. Select Defend and hold for a block. All shot choices work without a keyboard. **Practise at half speed** on the opening screen starts with slower play and middle-stump deliveries.

In Manual, aim before pressing: the contact ring stays anchored during the swipe. Holding without moving prepares the backlift; it does not swing. The backlift follows the hand both ways until the swing commits a quarter of the way through; from there the blade keeps the pace the hand gave it, eases off rather than stopping dead when the pointer stalls, and never runs backwards. Letting go after the commit point finishes the stroke with the blade live; letting go before it pulls out. The middle section of the stroke meter shows the contact portion of the arc. The bat's path is shaped by your gesture, never by the incoming ball. Guard, cancelled strokes and the return to guard cannot score accidental hits. **Swipe length** in Practice tools sets how far the hand travels for a full stroke.

## Interface

- The opening screen pairs a warm paper session sheet with a live view along the practice wicket. A serif CricSim masthead, ruled condition rows and a cricket-red Take guard button give it the character of a club scorebook. Bowling, release speed, surface, length and line, crosswind, ball age and practice speed reflect the actual saved settings. Half-speed practice sits under Take guard as a secondary button. On a landscape phone the Take guard block stays pinned to the bottom of the sheet. Conditions, batting help, sound and fullscreen remain accessible before starting.
- The menu uses its own camera and renders inside the visible ground panel; the batting rig stays hidden until taking guard. On phones, the ground sits above the session sheet and the menu scrolls when needed. The in-play camera and controls are unchanged by the menu composition.
- The in-play HUD shares the menu's type and paper: the CricSim wordmark and the panel, dialog and pause titles use the same serif, the primary buttons are paper on ink, and lime marks only interactive state.
- The 3D view fills the window. Conditions, session statistics and delivery information stay at the edges. The scorebug keeps fixed widths, so it does not shift as figures change. Shot intent, stroke name and a compact stroke meter replace the three constantly changing angle readouts; fine adjustments appear only when used.
- Taking guard leaves you at the crease; Space or **Next ball** starts the bowler. Short coaching lines appear under the readout for the first three balls. On phones and tablets the readout sits on a glass panel so it stays legible over the pitch, and steps aside while the ball is in flight so it never hides the ball at the crease. On landscape phones, tablets and laptops up to 1280 px wide the stroke panel stacks above **Next ball** at the right edge, clear of the crease line and the off-stump contact point; on landscape phones the scorebug joins the top row so it never covers the bowler's release. The HUD keeps clear of notches and the home indicator.
- On desktop the result card rises as a lower third in place of the delivery readout, with the delivered pace in its label, clear of the bowler and the ball's path; on phones and short landscape screens it stays compact under the scorebug. On smaller screens, a notice that arrives while the card is up moves above the stroke panel.
- Results show outcome, shot, timing, exit speed and contact location on the blade. Stroke intent and timing are sampled at contact or as the ball passes the contact plane, so later pointer input cannot rewrite the feedback. Flow reports the physical contact or miss geometry, without assigning an early/late label from a scripted swing. Standard distinguishes early/late timing from line/height errors, and a committed click that misses reads **Played & missed** even after release or recovery. Manual retains **Left alone** for released misses and **Played & missed** for held committed misses. Being bowled flashes the frame edge red and always remains a dismissal.
- The **Control** figure in the scorebug is the share of balls the bat met or that were left alone safely, including Manual strokes you started and backed off. In Flow, an exposed active blade that misses counts as played, even when held still; withdrawing it is a leave regardless of earlier motion. A Standard attack that misses, a held Manual swing or defensive block that misses, or being bowled is not control. **Clean** counts contact through the middle of the blade. A released flick that hits still counts as a shot. A held block that misses reads **Played & missed**, with **Beaten** timing and the gap diagram. Standard and Manual release a held block to leave; Flow resumes direct bat control and still needs the blade withdrawn. This applies to right-click defence and the Defend mode.
- A full miss gets a larger diagram showing the ball relative to the rotated blade from the batter's side, with left/right and above/below labels and the closest surface gap in centimetres. The diagram fits both the ball and bat without clipping wide misses. Distance is measured across each physics step, including the ball radius and blade thickness, and freezes when the delivery resolves. Safe leaves say **Safe leave**, without a miss-distance label.
- A shortcuts sidebar (the keyboard button or `/`) lists every key, grouped by what it changes, each with its own switch and a master switch.
- Conditions open in a drawer over the scene at every size (a bottom sheet with a grabber on phones), pausing play while you make changes and restoring the previous pause state when closed. The pause card stays hidden behind an open panel or the help dialog.
- In Flow, the blade outline follows the actual bat face and orientation, so the guide never promises contact at a different pose. Standard and Manual retain the contact outline and stroke-progress ring. The guide flashes on contact and marks held defence. Camera-ray input stays within the bat's reach; Manual swipe distance uses screen coordinates.
- Self-hosted Newsreader (serif), Barlow Condensed (numerals and verdicts) and DM Sans (text), reduced-motion support, keyboard focus rings throughout. The help dialog lists touch controls first on touch screens.

## Simulation

- First-person camera at 1.72 m, a 20.12 m wicket-to-wicket pitch, 0.108 m blade width, 0.072 m ball diameter, and 0.711 m stumps.
- Fixed 240 Hz physics, separate from rendering and simulation speed.
- A numerical release-angle solver, gravity, quadratic aerodynamic drag, a tunable swing side force, spin dip/drift, seam deviation, and pitch-dependent restitution and friction.
- **Pace variation** draws each ball's speed from a bell curve around the release speed, clipped at two and a half spreads: consistent, slight (about ±2 km/h), natural (about ±4) or mixed (about ±7, with the odd slower ball). The draw comes after the other seeded noise, so length, line and seam for a seed are the same whatever the spread.
- Right- and left-arm fast pace, inswing, outswing, off spin, and leg spin, bowled over or around the wicket. Handedness changes off/leg line selection; bowling arm changes movement direction. Over the wicket the bowling arm passes beside the stumps and the ball angles in at a batter of the same hand; around the wicket the bowler crosses to the other side of the stumps and the ball angles across. The chosen line and length are reached either way; only the angle of approach changes. The delivery readout and the title sheet name the side the way a scorer would ("Right-arm over · pace"). Bowling style descriptions use right-arm/right-handed conventions.
- Hard, green, dry, and damp surfaces; clear, overcast, and evening light; crosswind and ball wear. Cloud cover changes lighting and the air-density preset; it is not used as an arbitrary swing multiplier.
- Continuous collision detection between a moving ball and oriented, finite-width bat face, including edge detection and bat-velocity-dependent rebound.
- Standard uses a fixed backlift, stable face through contact and follow-through, driven only by the chosen target, intent and the moment the stroke starts. Flow moves the physical bat continuously from the pointer, without a committed stroke timeline. Both supply power through the existing collision physics.
- Flow uses a spring-driven bat target with bounded acceleration and rotation. The same live pose drives the visible bat and collision checks. The controller does not read the incoming ball, and never infers a swing or decides when to finish one. Holding, reversing and checking work throughout the motion. Keeping the bat still in the ball's path remains a physical block; withdrawing it makes a leave.
- In Manual, swipe displacement advances a curved backlift, downswing and follow-through. The stroke's progress is one smooth state with bounded velocity and acceleration; the blade, the stroke meter, the timing feedback and the collision model all read it, so a staircase of pointer events cannot show up as a stutter. Past the commit point the stroke carries a decaying momentum floor, so it completes at the pace the hand set. Automatic face and wrist rotation distinguish vertical drives from horizontal cuts, pulls and sweeps. Cross-bat shots stay level through the contact area. Shared curve tangents preserve speed through impact. Gesture direction is read from the whole backlift and freezes at the commit point, so a hand that curls on its way up still plays the drive it meant, and jitter or reversals cannot accumulate power.
- Translation and rotation are smoothed and speed-limited. Blade corners remain above the pitch. Contact includes the surface velocity due to face rotation. Soft-handed defence uses a lower restitution coefficient; lofted intent changes the physical launch angle.
- The ball starts at the animated bowling hand's world position, about 2.05 m up and 0.57 m to the off side of the stumps over the wicket (0.41 m to the leg side around it, for a right-arm bowler). A steady eye-level view includes the release and contact area without diving after the incoming ball. It tracks a struck ball briefly, then settles back. Portrait screens preserve enough horizontal field of view for off-stump deliveries.

### Scene

- Poly Haven ground colour, normal and roughness maps and three HDR skies (clear, overcast, evening). Each sky is rotated so its photographed sun sits where the shadow-casting light is. Khronos PBR Neutral tone mapping with per-weather exposure, sun colour and fog. In clear weather the sun sits behind the batter's left shoulder, so the bowler and sight screen are front-lit. The lawn shader remaps the photographed sparse-grass map to mown-lawn greens, and the ground runs out far enough to meet the sky without a seam.
- Everything else is procedural, generated on canvases at load: knotted netting on sagging panels that flutters in a crosswind, hung from round galvanised rails and posts with clamp collars and ties, windbreak skirts with folds and reinforced hems, long grass along the net skirts that leans with the crosswind, lawn mottle and mowing stripes, pitch wear per surface (soil grain, grassy edges, soft roller bands, crease scuffs and footmarks, live grass on a green top, a crack network on a dry deck, damp patches on a soft one), chalk creases, a sight screen of bevelled boards on a galvanised frame with rubber-tyred wheels, a weatherboarded pavilion under a slate roof with a veranda, benches, sills, a panelled door, gutters, a chimney and a clock, a timber groundsman's shed with a window, a water butt and the heavy roller parked beside it, benches, hedge, fence and floodlights that glow and light the strip in the evening. The lanes carry their kit: concrete footings under the net posts, the bowler's marker disc at the start of whichever run-up the conditions choose, a bucket of practice balls, kit bags, cones in the neighbouring lanes and a spare bat resting against the side net.
- The batter: a lofted willow blade with a back spine, splice, oiled edges, painted grain and a face sticker that reads the right way round from the bowler's end; a ribbed rubber grip; batting gloves with four curled fingers of different lengths, each a run of separate curved pads over a leather underside with piping along the joints, a padded thumb, a leather palm round the handle, split back-of-hand shields and a knuckle row in the club green with sewn welts, so the panels read from the eye instead of one white shape, and an elastic cuff with a lining and a strap, closed against the hand so the batter never looks into it; leather and fabric keep different roughness under a sub-millimetre grain; ribbed-knit forearm sleeves with round hems that fade out toward the elbow; pads that come into frame on portrait phones and while the view follows a struck ball. Flow uses a shared physical rig for the controller and visible hands: fixed 34 cm upper arms, 29 cm forearms and 42 cm shoulder spacing, with both hands attached at their actual handle positions. One torso frame crouches, leans and turns from the handle position; the controller keeps the bat within reach before rendering. Standard and Manual retain their earlier procedural stance and forearm path. The bat stays on the physics pose. Flow pointer input uses a fixed batting camera, so head movement and the view following a struck ball cannot move the bat. Head movement stays small and contact produces a subtle kick.
- The bowler has shaped body and clothing surfaces: a skull deeper than it is wide with a jaw, ears, nose, lips, brows and eyes, hair under a peaked six-panel cap with a sweatband, a neck that pivots at its base into a folded polo collar, shoulders of an athlete's width with the deltoids continuing the chest line, forearms of full length with flattened palms, curled fingers and thumbs, trousers that close between the thighs with belt loops and seams, and layered running shoes with laces whose tread rests on the pitch. The shirt, sleeves and trouser legs carry tension folds, and each finger is one continuous curved surface. Every part is one vertex-colour mesh, and roughness travels per vertex so skin and eyes catch the sun while the cloth stays matte. The action is a side-on fast bowler's: he runs in beside the stumps on the chosen side of the wicket, gathers with the front knee up and the front arm reaching at the batter, lands the back foot turned across the crease at the bowling crease, braces the front leg with its heel behind the popping crease, flexes forward and away from the bowling arm so the arm comes over the top of the head, pulls the front arm into the chest, and runs off to the side he came in on. No part of him passes through the stumps. Smooth delivery curves continue through the release; two-bone leg animation plants each support foot in world space, lets an airborne leg bend rather than pull the hips down, rolls a foot left behind by the stride onto its toes, pivots the turned back foot on the ball of the foot, and keeps a planted foot where it landed while the body drifts. The ball launches from the animated hand in both bowling arms. Bails fly and the middle stump leans when bowled.
- The blade has bevelled edges, a rounded toe and shoulders and a crowned spine; pads are a cream shell twice as wide as it is deep with seven tapered bolsters following its curve from instep to knee, three knee rolls bent round the shin, a top flap and strap buckles on both sides. Stumps are turned ash with visible grain under a lacquer, a steel shoe, a brass ferrule and a domed cap; bails are barrels with spigots. The ball wears dyed leather with pore grain, quarter seams, six rows of individual stitches either side of a narrow seam groove and a gold maker's stamp; one half is polished and the other rougher, and the whole leather dulls with the ball's age. Material relief is measured in fractions of a millimetre, keeping wood grain and fabric subtle. The bat's regulation dimensions and collision geometry are unchanged.
- Model construction uses shaped chest and forearm sections, a continuous sculpted face, overlapping trouser joints and connected shoe layers. Glove protectors curve across the back of the hand. Opaque windbreaks cast shadows, with a narrow contact shade also visible in Eco; the hedge has a continuous rounded leafy silhouette. These changes add no external assets or runtime dependencies.
- Ball trail as a fading ribbon, a lime bounce ring when the guide is on, a bounce puff, marks that accumulate on the strip, a single contact shadow under the ball, and a small glow that keeps a distant ball legible.
- Asset sources and licenses are listed in `ASSETS.md`.

### Audio

Everything is synthesised in the browser from a noise buffer and damped sine modes: a willow contact that changes with strike quality, edges and soft hands and scales with exit speed; bounce thuds that take their tone from the surface; a stump knock and bail rattle when bowled; the net; the bowler's footfalls and gather; a wind-and-leaves bed with occasional birdsong. No recordings, microphone access, or network requests.

### Fidelity limits

This remains a simulation foundation, **not a finished photorealistic or validated coaching model**. The ground and skies use photographed assets; equipment, buildings and the bowler are procedural and the bowler does not use motion capture. Swing/spin and surface coefficients are tunable approximations without CFD, empirical calibration, full seam orientation dynamics, reverse swing, or bat flex. Footwork is procedural body animation, not a separate player-controlled movement system. There are no body/pad collisions or LBW decisions. Automatic length and line variation is seeded. Grounded intent lowers the face angle; incoming bounce, contact location and timing still affect the launch.

## Structure and checks

- `dist/physics.js`: deterministic simulation, presets, collision model.
- `dist/scene.js`: Three.js environment, procedural textures and models, batter rig, camera.
- `dist/bowler.js`: merged articulated bowler, the over/around line, continuous delivery timeline and planted-foot leg animation.
- `dist/equipment.js`: shaped bat and gloves, sewn panel geometry and leather/fabric surface material.
- `tests/bowler.test.mjs`: the release handoff, continuity under skipped frames, planted feet, the shoe tread on the pitch, the mesh budget, the over/around line for both arms, clearance of the stumps through the whole action and the front heel behind the popping crease.
- `tests/scene-geometry.test.mjs`: real scene construction and geometry checks with browser/GPU boundaries stubbed; environment, quality, handedness and delivery-animation coverage. This does not compile shaders or verify rendered pixels.
- `dist/render-policy.js`: quality budgets, frame pacing and sustained-load adaptation.
- `tests/runtime-smoke.mjs`: actual game entrypoint with a simulated browser lifecycle and real bat/ball physics; run with `npm run test:runtime` (also included in `npm test`).
- `dist/game.js`: input, delivery lifecycle, session state, HUD choreography, settings.
- `dist/bat-control.js`: the shared control interface, direct Flow input, Standard timed strokes and early aim correction, Manual gesture-shaped stroke arcs, physical contact preview, shot intent, swipe length and three-axis fine adjustment.
- `dist/direct-bat.js`: Flow's permanent blade-point spring, rigid shaft, shallow 3D target surface, arm-reach constraints and safe pointer acquisition.
- `dist/shortcuts.js`: the keyboard shortcut table, key matching and the saved on/off state behind the shortcuts sidebar.
- `dist/batter-motion.js`: shared direct-Flow arm dimensions, grip reach, torso frame and elbow solve; Standard/Manual stance and shoulder/foot placement; stable batting-camera geometry.
- `dist/shot-feedback.js`: feedback from the stroke sampled at contact or at the crease, the control rule for leaves, result headlines and miss-diagram geometry.
- `dist/audio.js`: generated impact sound and ambience.
- `dist/assets`: CC0 ground maps and HDR environments (about 9.8 MB total).
- `dist/fonts`: Newsreader (regular and italic), Barlow Condensed and DM Sans, latin subsets (about 130 KB). All three are under the SIL Open Font License; each licence sits beside its fonts in `dist/fonts` (`NEWSREADER-OFL.txt`, `BARLOW-CONDENSED-OFL.txt`, `DM-SANS-OFL.txt`).
- `dist/index.html` / `dist/style.css`: the interface; `dist/menu.css` isolates the scorebook-style opening screen from the in-play HUD.
- `tests/physics.test.mjs`: trajectory, speed, pace variation, bounce, contact, near-miss, outcome, and determinism checks.
- `tests/direct-contact.test.mjs`: stationary blocks, both blade faces, lateral edge entry, finite corners and rebound from actual translation and rotation.
- `tests/direct-feedback.test.mjs`: exposed blade versus withdrawal, stationary blocks, reacquisition, geometric miss advice and frozen result snapshots.
- `tests/flow-control.test.mjs` with `tests/flow-hand.mjs`: deterministic pointer motion and silent holds; continuous Flow control, reversible backswing and downswing, input safety, real bat contact and feedback. Standard and Manual keep their own regression coverage.
- `tests/batter-motion.test.mjs`: shared grip and wrist positions, fixed arm lengths, shoulder spacing, head placement and continuous body response.
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

### Direct Flow revision, 2026-10-15

This revision replaces the earlier push-to-commit controller with continuous bat control. The reference check used the archived Miniclip game's actual input and physics implementation: a permanent mouse joint drives its bat while connected body parts follow. CricSim applies that control principle to its 3D bat and a shared rig with fixed arm lengths and shoulder spacing; it does not import the original game's code or assets. Flow no longer runs Standard's stroke timeline or detects a gesture before enabling play. Players can choose and hold a backswing, lower and raise it again, check a downswing and reverse it. The guide and collision use the visible bat's live pose. Leaving is withdrawal; an exposed stationary bat remains a block.

All 154 automated tests, 25 entrypoint lifecycle checks, syntax checks and the versioned Pages build pass. Coverage includes partial backlift holds, checks and reversals, prompt braking, tiny pointer corrections, continuous face rotation, 30–1000 Hz input, both stances and practice speeds. Contact checks cover entry from either face or a lateral edge, finite blade corners and rebound from actual translation and rotation. Feedback checks distinguish a held blade from withdrawal and keep the captured result unchanged after later mouse motion.

CPU geometry renders of the actual controller and scene verify attached hands, readable low guards and blade-up backlifts with the hands below eye level. Shared arm lengths and shoulder spacing stay fixed; the head follows the crouch and lean while input uses a stable neutral camera. Scene tests also keep the low blade and far release hand inside the view. These checks do not validate WebGL shaders or subjective mouse feel; those still need an interactive player check. The older results below describe earlier builds, including the replaced push-to-commit behavior.

### Earlier verification, 2026-10-15 — push-to-commit preview

The earlier Flow preview had a reversible, hand-driven preparation phase. The contact outline holds at the local onset; the bat follows the initial push into a backlift, then blends from its visible pose into the committed stroke. Pulling back, settling or lifting a touch before commitment leaves without a collision or shot attempt. A previous committed attempt on the same delivery cannot be erased by abandoning a second preparation. Sideways aiming can lead directly into a push. Light/Normal/Firm now pair lower speed thresholds with slightly longer travel, giving ordinary gestures more preparation without adding a fixed delay. Standard's contact path, bat dimensions and ball physics are unchanged.

All 144 automated tests, 25 entrypoint lifecycle checks, syntax checks and the versioned Pages build pass. New coverage includes fixed aim throughout preparation, collision inactivity before commitment, reversals, slow-movement cleanup, touch capture/lift/cancellation, leave scoring on a real seeded delivery, previous-attempt history, 30–1000 Hz samples, quantized slow mouse movement, and trim continuity. At 120–1000 Hz input with 60 Hz rendering, representative pushes at 2/3/6 screen units per second commit after about 67/50/33 ms, with 3/2/1 visible preparation frames; these are deterministic measurements, not human playtesting. At 30 Hz input a fast push can arrive entirely between rendered samples, so preparation cannot always have an intermediate visible frame; launch still blends from the current pose.

The bowler's continuous face, chest, limbs and shoe construction and the fitted glove panels were inspected in CPU geometry renders from front, side and release poses. The bowler uses 14 meshes and 9,712 triangles, slightly less than before. A new ray test catches gaps between shoe layers. Windbreaks now cast shadows and retain a narrow contact shade on Eco; the new continuous leafy hedge is checked for closed, consistent winding. The CPU scene audit reports 72 mesh submissions and 157,596 triangles on High before culling/shadows. No external assets or runtime dependencies were added.

Visual verification limit: the cloud browser reports WebGL disabled, and a local browser download was unavailable. CPU renders check geometry, not final shaders, HDR lighting, shadows or texture filtering. Real mouse/trackpad feel, final appearance and GPU performance still need a player check in the branch preview.

### Verification status, 2026-10-11

The bowler's action was rebuilt and a side-of-the-wicket setting added. Numerical checks of the old action found three faults that the renders confirmed: the body turned toward the bowling arm at back-foot contact (the bowling shoulder led, the opposite of side-on), the front foot swung through the stumps at the bowler's end because the run-up passed over the middle stump, and the front foot landed 0.4 m past the popping crease. The bowler now runs in 0.44 m to the side of the stumps over the wicket (0.54 m around), turns side-on with the front shoulder, lands the back foot turned across the crease, braces the front leg with its heel 0.13 m behind the popping crease, flexes forward and away from the bowling arm at release, and runs off to his own side. The release hand sits at about x 0.57, y 2.05, z -17.65 over the wicket; around the wicket the arm comes over from the far side toward the stumps, so the hand sits at about x -0.41; both mirror for the left arm. The model keeps 14 meshes at 9,744 triangles, within its budget; shoulder width, chest depth and forearm length were corrected. New tests sweep every vertex of the bowler through the whole action for both arms, both sides of the wicket and pace and spin and fail if any enters the stumps' volume, check the front heel against the popping crease, and check the line and release mirror. All 133 automated tests, 21 entrypoint lifecycle checks, JavaScript syntax checks and the static Pages build pass. The two timing-window tests now describe deliveries from over the wicket: a ball angling in meets the Standard and Flow stroke best 5 to 30 ms (Standard) or up to 75 ms (Flow, which reads a push a sample late) after the meter's middle, with a push on the middle still clean; around the wicket the old figures hold. The reworked bowler was rendered in headless Chromium (SwiftShader) from the batting view and from side, front, three-quarter and overhead cameras at the gather, back-foot contact, release and follow-through, over and around the wicket, with both arms; the same renders settled a second pass (a runner's bent elbows and fuller arm swing in the approach, green shields and knuckle rows on the gloves, ash grain on the stumps, softer lawn relief). The real page was then driven in that browser: the title sheet and readout name the side, R cycles it with a notice and saves it, the drawer select updates the readout, and a delivery runs with no console errors. A review pass before release then fixed what it found: the entry point had started to import the bowler module, and with it Three.js, ahead of the lazy scene load (the run-up curve now comes through the view); the hips popped up 7.5 cm within 20 ms at each stride as a swing foot lifted (a foot left behind by the stride now rolls onto its toes instead of pulling the hips down, and the rise is 1 cm); the follow-through drift carried the body 0.2 m past its planted feet (it now ends at the last footfall); the turned back foot rotated about the ankle with its sole sliding (it pivots on the ball of the foot); the marker disc stayed on the old line (it follows the chosen run-up); and the fallback release depth for callers without an animated hand sat 0.45 m behind it (it is back at 0.05 m). Rendering on real GPUs still needs a player check on the preview.

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
