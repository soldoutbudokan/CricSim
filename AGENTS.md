# CricSim: guide for agents and contributors

CricSim is a first-person cricket nets practice simulator: aim a contact point and push the mouse (Flow, the default), click or tap (Standard) or swipe (Manual) to play a stroke against seeded pace or spin deliveries on a changing pitch. It is a plain static web game (HTML, CSS and ES modules with a vendored Three.js) with no bundler and no runtime dependencies. `README.md` is the player- and maintainer-facing description; this file is the working guide for anyone changing the code.

## Layout

- `dist/` is the shipped source. What is in `dist` is what players run; there is no compile step. `dist/index.html`, `dist/style.css` and `dist/menu.css` are the interface, `dist/game.js` the entry point, and `dist/physics.js`, `dist/bat-control.js`, `dist/bowler.js`, `dist/scene.js`, `dist/render-policy.js`, `dist/batter-motion.js`, `dist/shot-feedback.js`, `dist/shortcuts.js` and `dist/audio.js` the modules. `dist/vendor/` holds Three.js, `dist/assets/` the CC0 ground maps and HDR skies (see `ASSETS.md`), `dist/fonts/` the self-hosted fonts. All asset paths are relative so the game works from any directory, including `/CricSim/` and `/CricSim/preview/<slug>/` on GitHub Pages.
- `tests/` holds `node:test` files (`*.test.mjs`) and `runtime-smoke.mjs`, which boots the real game entry point against a simulated DOM, frame scheduler, renderer and audio. Tests import modules straight from `dist/`.
- `scripts/build-pages.mjs` copies `dist` into `.pages-dist` and gives every local script, import and stylesheet a content-versioned `?v=` URL so a fresh page never mixes cached modules from an older release. `scripts/publish-pages.sh` commits a built directory into the `gh-pages` branch.
- `.github/workflows/deploy-prod.yml` and `deploy-preview.yml` publish production and branch previews (below).
- `vite.config.js` exists only for `npm run dev`; Vite is a development dependency and never part of the shipped game.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | All `tests/*.test.mjs` with Node's built-in runner, then the runtime smoke test. Needs no `npm install`; the publish-script tests need `git` on `PATH`. |
| `npm run check` | `node --check` on every shipped module (syntax only). |
| `npm run build:pages` | Builds `.pages-dist/` (gitignored) from `dist/`. Set `CRICSIM_BUILD_LABEL` to stamp the build (see below). |
| `npm run dev` | Vite dev server over `dist` with reload (`npm ci` first). Node 22.12 or newer. |
| `python3 -m http.server 8000 --directory dist` | Any static server also works; WebGL 2 is required. |

Run `npm test` and `npm run check` before pushing.

## GitHub Pages layout

Everything is served from the `gh-pages` branch, **Deploy from a branch → gh-pages → / (root)**. The branch holds two kinds of content side by side:

| Path in `gh-pages` | URL | Published from |
| --- | --- | --- |
| `/` (root) | `https://soldoutbudokan.github.io/CricSim/` | `main`, by "Deploy Production" on every push to `main` (and by manual dispatch) |
| `preview/<slug>/` | `https://soldoutbudokan.github.io/CricSim/preview/<slug>/` | any other branch, by "Deploy Preview" on every push to that branch (and by manual dispatch) |

`.nojekyll` sits at the root so Pages serves the files verbatim.

**Slug rule.** `<slug>` is the branch name lower-cased, with every run of characters outside `[a-z0-9]` replaced by a single `-`, leading and trailing `-` removed, cut to at most 60 characters (then trailing `-` removed again). `claude/epic-wright-f64ay0` becomes `claude-epic-wright-f64ay0`; `Feature/ABC_123` becomes `feature-abc-123`. Two branches that differ only in case or punctuation share a preview; avoid that.

**Preview workflow for an agent.** Commit on your branch, push it, and the "Deploy Preview" workflow runs tests, checks, the build and the publish (about two minutes). Wait for it to finish (Actions tab, or `gh run watch`), then give the user the preview URL:

```
https://soldoutbudokan.github.io/CricSim/preview/<slug>/
```

The workflow writes the URL to the run summary and, when the branch has an open pull request, keeps one sticky comment (marked `<!-- cricsim-preview -->`) on it with the URL and commit. Each preview build is stamped with `Preview · <branch> · <short sha>` (the `cricsim-build` meta, shown in the menu), so the player can confirm which commit they are on.

**Caching.** GitHub Pages caches `index.html` for up to about ten minutes and the CDN may keep an older copy briefly, so a hard reload (or a private window) may be needed right after a deploy. Modules and stylesheets are versioned by content, so once the new `index.html` loads, everything it references is fresh.

**Build budget.** Pages is served from a branch, so every commit the script pushes to `gh-pages` (one per push to a non-main branch, one per branch deletion, one per production deploy) triggers a Pages build. GitHub applies a soft limit of about ten Pages builds per hour per site; rapid pushes across several branches can queue a production deploy behind it, so batch small changes before pushing when previews are not needed.

**Cleanup.** Deleting a branch triggers the `delete` event and the workflow removes `preview/<slug>/` from `gh-pages`. Delete merged branches so previews do not pile up. To remove one by hand: `DELETE_DESTINATION=1 DESTINATION=preview/<slug> PAGES_REMOTE=origin bash scripts/publish-pages.sh`. Production deploys never touch `preview/`, and preview deploys never touch the root, so the two can run concurrently. The `delete` event runs the workflow file from `main`, so cleanup works only once `deploy-preview.yml` is on `main`.

## `scripts/publish-pages.sh` contract

Bash, `set -euo pipefail`, plain git, no third-party action. It clones only the pages branch (shallow, single branch) into a temporary directory, creates it as an orphan when it does not exist yet, applies one change, commits and pushes.

Inputs, all environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `SOURCE_DIR` | `.pages-dist` | Directory whose contents are published. Must exist and be non-empty. |
| `DESTINATION` | `''` | `''` publishes to the site root; otherwise a relative path such as `preview/<slug>` (no `..`, no leading `/`, never inside `.git`). |
| `DELETE_DESTINATION` (alias `REMOVE_ONLY`) | `0` | `1` removes `DESTINATION` instead of publishing. Refuses an empty destination. Exits 0 if the branch does not exist. |
| `PAGES_REMOTE` | `origin` | Git URL, local directory, or a remote name of the current checkout. In CI it is the token URL `https://x-access-token:<token>@github.com/<owner>/<repo>.git`. |
| `PAGES_BRANCH` | `gh-pages` | Branch that Pages serves. |
| `COMMIT_MESSAGE` | `Publish <destination or site root>` / `Remove <destination>`, plus `from <sha>` when `GITHUB_SHA` is set | Commit message. |
| `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL` | `github-actions[bot]`, `41898282+github-actions[bot]@users.noreply.github.com` | Commit identity (author and committer). |
| `PAGES_URL_BASE` | unset | When set, the resulting URL (`<base>/` or `<base>/<destination>/`) is printed. |
| `PUBLISH_PAGES_MAX_ATTEMPTS`, `PUBLISH_PAGES_RETRY_DELAY` | `5`, `3` | Push retry budget and seconds between attempts. |
| `PUBLISH_PAGES_TEST_HOOK` | unset | Test seam: an executable run once after the first commit and before the first push. |

Behaviour:

- Root deploy: every tracked file is removed except the `preview/` directory and `.nojekyll`, then `SOURCE_DIR` is copied into the root. Stale root files disappear; previews survive.
- Preview deploy: `DESTINATION` is removed completely and `SOURCE_DIR` copied into it, so stale files from an earlier preview never linger.
- `.nojekyll` is always created at the root.
- If the staged tree equals the branch tip it prints `No changes to publish` and exits 0 without committing.
- If the push is rejected because someone published in the meantime, it fetches the new tip, resets to it, re-applies the same change, commits and pushes again, up to `PUBLISH_PAGES_MAX_ATTEMPTS` times.
- It prints `Published <destination> to <branch> (<commit>)` and the URL, and when `GITHUB_OUTPUT` is set writes `changed`, `commit` and `url` step outputs.
- It never runs `git config` or touches the checkout it is run from beyond reading `git remote get-url` when `PAGES_REMOTE` is a remote name.

`tests/publish-pages.test.mjs` exercises all of this against a local bare repository, including the push race.

## Build label

`buildPages({ label })` in `scripts/build-pages.mjs` (CLI: `CRICSIM_BUILD_LABEL=... npm run build:pages`) injects `<meta name="cricsim-build" content="<escaped label>">` directly after the viewport meta in `index.html`. The label is part of the release hash, so relabelling the same tree gives fresh module URLs. Without a label nothing is injected. Production builds carry no label; previews use `Preview · <branch> · <short sha>`.

## Batting controls

Three modes share `dist/bat-control.js` and the same bat, ball and collision physics; the mode is saved as `cricsim-batting-mode` (`flow`, `standard` or `manual`, default `flow`).

- **Flow** (default): no click. `moveBatTarget` receives every pointer sample with its real timestamp (`game.js` feeds coalesced events). Slow movement aims; the last slow sample is the rest point. A push up the screen that is fast and long enough (`SWING_TRIGGERS`, chosen by the `trigger` preference) and within the upward cone (`FLOW.cone`) starts the Standard stroke at the rest point, dated up to `FLOW.backdate` before it was noticed. An event after `FLOW.gap` of silence means the hand rested at the previous sample (a still mouse sends nothing); that first event never decides a push by itself. A cancelled stroke (the next ball, a pause, a change of intent) keeps the last sample, so a mouse that stayed still through the run-up can push straight away. `restartFlow` (new touch, pointer entering the canvas, resize) forgets the samples; the hand must then be seen resting, or be silent for `FLOW.gap`, before it may swing. A teleport faster than `FLOW.jumpSpeed` also disarms. With the Defend intent a push only aims. Speeds are screen units per real second (shorter window side = 1.6), so `timeScale` does not change what counts as a push; `setBatTimeScale` only scales the backdating. A mouse click still plays the stroke; a touch must rest then swipe.
- **Standard**: click or tap plays the same fixed-timing stroke (`STANDARD_STROKE`, `standardPose`), with aim correction for the first 65 ms.
- **Manual**: hold and swipe; displacement drives `strokePose`, commit at `COMMIT`, momentum carries through.

When changing Flow, run `tests/flow-control.test.mjs`; its `tests/flow-hand.mjs` simulates a hand (120 Hz samples, 1/60 s frames, `still()` for a mouse that sends nothing) and never lets the controller see the ball. Keep Standard's behaviour byte-for-byte: `standardPose` is shared. Every `mode === 'standard'` check in `game.js` and `shot-feedback.js` must treat `flow` the same way unless the difference is the point (use `mode !== 'manual'`).

## Git

Commit as the repository owner (author `soldoutbudokan <68517314+soldoutbudokan@users.noreply.github.com>`), not as an agent identity, so history reads as the owner's work. Push the working branch with `git push -u origin <branch>`; never push to `main` or `gh-pages` by hand. The workflows own `gh-pages`: their deploy commits are authored as the GitHub actor who pushed (the script's own default is `github-actions[bot]`, which only applies when it is run without `GIT_AUTHOR_NAME`).

## Conventions

- Keep `README.md` current, in particular its Controls, Structure and checks, and Verification sections, whenever behaviour, files or checks change.
- Tests must be deterministic: seeded physics, fixed time steps, no wall-clock or network dependence, and temporary directories created under the repository root (`.pages-test-*`) and removed in `t.after`.
- Do not add dependencies to the shipped game. `dist` must keep working as plain files from any static host with no build step and no third-party requests. Development-only tooling (Vite, test helpers) is acceptable as a devDependency when it is really needed.
- Keep asset paths relative (`./...`) so the game runs under `/CricSim/` and `/CricSim/preview/<slug>/`.
- Preferences are stored per browser origin (`localStorage`); previews share the origin with production, so a preview that changes a stored setting's format must migrate or namespace it.
- When you finish a piece of work on a branch, push it, wait for "Deploy Preview", and hand the user the preview URL along with the short commit SHA it shows in the menu.
