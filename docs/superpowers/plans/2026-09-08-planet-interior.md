# Planet Interior Implementation Plan

> **For agentic workers:** Use subagent-driven-development with independent scene, presentation and verification tasks.

**Goal:** Upgrade the existing deep-space blog with a real 3D planet and an explorable science-fiction interior.

**Architecture:** Keep Hexo and existing content. A local Three.js ES module renders the homepage planet, then moves its canvas into a modal for the approach/interior transition. Dedicated scene builders supply exterior and interior objects; a small controller manages input, camera, modal lifecycle and fallback.

**Tech Stack:** Hexo 8, EJS, CSS, Three.js 0.180.0, native Node tests, Chromium browser verification.

## Global Constraints

- Preserve content routes and user files; use url_for for links.
- Ship libraries locally, no runtime CDN or remote textures.
- Respect reduced motion, pause, visibility, keyboard and mobile interaction.
- Work on codex/planet-interior-upgrade; no remote deployment.

### Task 1: Exterior and interior scene builders

Files: themes/fluid-particle/source/js/planet-world.mjs.

Interface: export createExterior(THREE), createInterior(THREE). Both return { group, update(time), dispose() }. Exterior additionally returns planet (raycast mesh). Interior returns nodes array of { object, id } with ids archives, latest, games; each object is a raycast target attached to group. Coordinates centered at origin, exterior sphere radius 1.5 and rings to 3.0, exterior camera (0,1,8). Interior main objects fit radius 5; default interior orbit radius 10 at pitch 0.26, constrained to radii 6–14 and pitch −0.35–0.85. Atmospheric interior dome radius 24 with BackSide material makes the interior an enclosed space.

- [x] Build deterministic procedural gas bands, lit sphere, atmosphere and particle rings.
- [x] Build luminous core, floating platforms and navigable nodes.
- [x] Verify imports and geometry with Node; visually inspect after integration.

### Task 2: Presentation and semantic controls

Files: home.ejs, head.ejs, new planet-explorer.ejs partial, new planet-explorer.css.

Interface: homepage div #planet-viewport contains canvas #planet-webgl; button #planet-enter opens explorer. dialog #planet-explorer contains #planet-stage canvas host, #planet-close, #planet-reset, #planet-pause, #planet-zoom-in, #planet-zoom-out, live status #planet-status, links [data-planet-node=archives|latest|games]. Controller appends the canvas to #planet-stage then returns it to #planet-viewport. #planet-viewport positioned over old decorative planet. Root home receives class planet-webgl-ready only after first successful render; CSS hides old saturn-system then. Dialog uses data-phase=approach|interior|fallback; canvas receives interaction.

- [x] Implement semantic markup, accessible controls and responsive spatial styling.
- [x] Load new local modules/styles only on homepage.
- [x] Preserve original fallback and make reading/navigating content primary.

### Task 3: Interaction controller and dependencies

Files: new planet-explorer.mjs, tools/copy-three.cjs, package.json, package-lock.json.

- [x] Add browser acceptance checks for entry, Escape exit/focus return, input and fallback; run missing-feature failures.
- [x] Copy pinned three.module.min.js, three.core.min.js and LICENSE into theme vendor during prebuild.
- [x] Implement renderer initialization, Raycaster selection, approach transition and interior camera orbit.
- [x] Implement modal lifecycle, reset, zoom, node activation, pause/reduced motion, visibility and graceful fallback.

### Task 4: Verification and integration

- [x] Run npm test; investigate failures without discarding unrelated regression coverage.
- [x] Serve built public output and capture desktop/mobile/explorer screenshots.
- [x] Exercise planet entry, orbit/zoom, links, exit, pause, reduced motion and renderer failure in browser.
- [x] Review changes independently, address material findings, and open local preview for user.
