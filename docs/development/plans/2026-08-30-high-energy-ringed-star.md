# High-Energy Ringed Star Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing blue-violet Saturn hero into a smoothly rotating, high-energy ringed star with prominent SVG limb flares while preserving the particle renderer byte-for-byte.

**Architecture:** Keep the existing scene, Canvas, sphere, fixed lighting, and split ring. Add one decorative SVG prominence field behind the sphere and reuse the sphere's clipped CSS layers for two seamless surface flows plus flare knots. A single inherited `--saturn-equator-angle` aligns the ring and surface movement; all new motion is CSS-only and responds to the existing scene state.

**Tech Stack:** Hexo 8, EJS, CSS/SVG, Node.js `node:test`, headless Chrome/Edge style and geometry probes

## Global Constraints

- Keep the theme display name `流体粒子` and the existing blue-violet deep-space palette.
- Use `--saturn-equator-angle: -10deg` as the single ring/surface direction.
- Surface loops are one-way and seamless: about 26 seconds for gas bands and 38–44 seconds for magnetic filaments.
- Use four to six distinct, asymmetric prominence groups; strongest activity stays on the upper-right, right, and lower limb.
- Animate only `transform` and `opacity`; never animate blur, filter, background position, shadow, or layout properties.
- Do not add Canvas, WebGL, requestAnimationFrame, timers, listeners, or per-frame JavaScript.
- Keep `themes/fluid-particle/source/js/particle-core.js` SHA-256 `A16D193E8874DF1248532458B3114AC0393B746431EF2559C5A2A2035B5F11E0`.
- Keep `themes/fluid-particle/source/js/particle-flow.js` SHA-256 `45982BE65E5F465C730DEA7E3E1FCC8FCBC93F6B9C238B346C11F028FD116D2A`.
- Keep `#particle-flow`, `.particle-fallback #particle-flow`, its desktop/mobile opacity, and the untransformed `.space-scene` Canvas coordinate system unchanged.
- `.motion-paused`, `prefers-reduced-motion: reduce`, and `.particle-fallback` must stop every new animation; fallback also hides its unbound motion button without JavaScript.
- At 1440×900 and a 320×740 constrained layout, no distinct visible prominence group intersects `.home-hero__copy`; at least two groups remain in view and horizontal overflow is absent.
- At 1920×1080, DPR 1, foreground for at least 20 seconds: FPS ≥110, average frame time ≤10 ms, and frames over 24 ms <2%.

---

## File Structure

- Create `test/stellar-scene-contract.test.cjs`: focused static contracts for SVG structure, shared axis, permitted animation properties, fallback selectors, Canvas CSS, and particle hashes.
- Modify `themes/fluid-particle/layout/_partial/space-scene.ejs`: add the decorative prominence SVG and the clipped flare-knot layer; preserve the Canvas element and outer scene markup.
- Modify `themes/fluid-particle/source/css/space-scene.css`: style the prominence field, rebuild the moving surface layers, share the equatorial angle, and add pause/reduced-motion/fallback rules.
- Modify `themes/fluid-particle/source/css/main.css`: add only the hero-level fallback rule that hides the unbound motion button through `:has(.particle-fallback)`.
- Modify `test/theme-browser-behavior.test.cjs`: probe both surface pseudo-elements, flare knots, prominence groups, fallback behavior, reduced motion, shared angle, and real responsive geometry.
- Create `docs/development/verification/2026-08-30-high-energy-ringed-star.md`: record fresh tests, hashes, viewport geometry, screenshots inspected, and foreground performance metrics.

### Task 1: Static high-energy-star composition and protected particle boundary

**Files:**
- Create: `test/stellar-scene-contract.test.cjs`
- Modify: `themes/fluid-particle/layout/_partial/space-scene.ejs:1-11`
- Modify: `themes/fluid-particle/source/css/space-scene.css:53-177`

**Interfaces:**
- Consumes: existing `.saturn-system`, `.saturn`, `.saturn-bands`, `.saturn-light`, split `.saturn-ring`, and `#particle-flow` contracts.
- Produces: `.saturn-prominences`, five `.saturn-prominence` groups, `.saturn-flares`, and inherited `--saturn-equator-angle` used by Task 2.

- [ ] **Step 1: Write the failing static contract tests**

Create `test/stellar-scene-contract.test.cjs` with these helpers and assertions:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const hash = relative => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex').toUpperCase()
const sceneTemplate = () => read('themes/fluid-particle/layout/_partial/space-scene.ejs')
const sceneCss = () => read('themes/fluid-particle/source/css/space-scene.css')

test('ringed star exposes five distinct double-stroked prominence events and clipped surface flares', () => {
  const template = sceneTemplate()
  const groups = [...template.matchAll(/<g\b[^>]*class="[^"]*\bsaturn-prominence\b[^"]*"[^>]*>([\s\S]*?)<\/g>/g)]
  assert.equal(groups.length, 5)
  assert.equal(new Set([...template.matchAll(/saturn-prominence--([\w-]+)/g)].map(match => match[1])).size, 5)
  for (const group of groups) {
    assert.match(group[1], /class="prominence-glow"/)
    assert.match(group[1], /class="prominence-core"/)
  }
  assert.match(template, /<svg\b[^>]*class="saturn-prominences"[^>]*aria-hidden="true"/)
  assert.match(template, /<div class="saturn-flares"><\/div>/)
  assert.ok(template.indexOf('saturn-ring--back') < template.indexOf('saturn-prominences'))
  assert.ok(template.indexOf('saturn-prominences') < template.indexOf('<div class="saturn">'))
  assert.ok(template.indexOf('saturn-light') < template.indexOf('saturn-ring--front'))
})

test('ring and surface share one equatorial angle and animated SVG groups use local transform geometry', () => {
  const css = sceneCss()
  assert.match(css, /\.saturn-system\s*\{[^}]*--saturn-equator-angle:\s*-10deg;/s)
  assert.match(css, /\.saturn-ring\s*\{[^}]*transform:\s*rotate\(var\(--saturn-equator-angle\)\);/s)
  assert.match(css, /\.saturn-bands\s*\{[^}]*transform:\s*rotate\(var\(--saturn-equator-angle\)\)/s)
  assert.match(css, /\.saturn-prominence\s*\{[^}]*transform-box:\s*fill-box;[^}]*transform-origin:\s*var\(--prominence-origin\);/s)
})

test('particle renderer and Canvas visual contract stay unchanged', () => {
  assert.equal(hash('themes/fluid-particle/source/js/particle-core.js'), 'A16D193E8874DF1248532458B3114AC0393B746431EF2559C5A2A2035B5F11E0')
  assert.equal(hash('themes/fluid-particle/source/js/particle-flow.js'), '45982BE65E5F465C730DEA7E3E1FCC8FCBC93F6B9C238B346C11F028FD116D2A')
  const css = sceneCss()
  assert.match(css, /#particle-flow\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*1;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*opacity:\s*0\.88;/s)
  assert.match(css, /\.particle-fallback #particle-flow\s*\{[^}]*display:\s*none;/s)
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?#particle-flow\s*\{[^}]*opacity:\s*0\.68;/)
  assert.doesNotMatch(css.match(/\.space-scene\s*\{([^}]*)\}/)?.[1] || '', /\btransform\s*:/)
  assert.equal((sceneTemplate().match(/<canvas id="particle-flow"><\/canvas>/g) || []).length, 1)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test test/stellar-scene-contract.test.cjs
```

Expected: the prominence/angle tests fail because the SVG, flare layer, and shared variable do not exist; the existing particle-hash assertions pass.

- [ ] **Step 3: Add the exact SVG and flare markup**

In `space-scene.ejs`, retain the existing outer scene and Canvas, then place this SVG after the rear ring and add `.saturn-flares` before `.saturn-light`:

```ejs
<svg class="saturn-prominences" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="prominence-energy" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#67eaff" />
      <stop offset="0.52" stop-color="#9568ff" />
      <stop offset="1" stop-color="#eafbff" />
    </linearGradient>
  </defs>
  <g class="saturn-prominence saturn-prominence--crown">
    <path class="prominence-glow" d="M54 17 C58 1 75 2 78 20" />
    <path class="prominence-core" d="M54 17 C58 1 75 2 78 20" />
  </g>
  <g class="saturn-prominence saturn-prominence--upper-east">
    <path class="prominence-glow" d="M73 20 C93 0 105 17 88 34" />
    <path class="prominence-core" d="M73 20 C93 0 105 17 88 34" />
  </g>
  <g class="saturn-prominence saturn-prominence--east">
    <path class="prominence-glow" d="M87 34 C112 22 116 59 88 63" />
    <path class="prominence-core" d="M87 34 C112 22 116 59 88 63" />
  </g>
  <g class="saturn-prominence saturn-prominence--lower-east">
    <path class="prominence-glow" d="M84 68 C105 78 92 101 67 82" />
    <path class="prominence-core" d="M84 68 C105 78 92 101 67 82" />
  </g>
  <g class="saturn-prominence saturn-prominence--lower">
    <path class="prominence-glow" d="M62 82 C58 96 43 99 38 84" />
    <path class="prominence-core" d="M62 82 C58 96 43 99 38 84" />
  </g>
</svg>
```

- [ ] **Step 4: Add the static composition CSS and shared axis**

Add `--saturn-equator-angle: -10deg` to `.saturn-system`; replace the ring's literal rotation with `rotate(var(--saturn-equator-angle))`; align `.saturn-bands` with the same variable. Add exact base rules for the new SVG:

```css
.saturn-prominences {
  position: absolute;
  z-index: 1;
  top: 4%;
  left: 8%;
  width: 84%;
  height: 80%;
  overflow: visible;
  pointer-events: none;
}

.saturn-prominence {
  --prominence-origin: 0% 50%;
  transform-box: fill-box;
  transform-origin: var(--prominence-origin);
}

.saturn-prominence--crown { --prominence-origin: 50% 100%; }
.saturn-prominence--upper-east { --prominence-origin: 0% 80%; }
.saturn-prominence--east { --prominence-origin: 0% 50%; }
.saturn-prominence--lower-east { --prominence-origin: 0% 0%; }
.saturn-prominence--lower { --prominence-origin: 100% 0%; }

.prominence-glow,
.prominence-core {
  fill: none;
  stroke: url(#prominence-energy);
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.prominence-glow {
  stroke-width: 4.8;
  opacity: 0.2;
  filter: drop-shadow(0 0 0.55rem rgba(103, 234, 255, 0.5));
}

.prominence-core {
  stroke-width: 1.15;
  opacity: 0.82;
}

.saturn-flares {
  position: absolute;
  z-index: 2;
  inset: -10%;
  border-radius: inherit;
  background:
    radial-gradient(ellipse 18% 5% at 70% 25%, rgba(234, 251, 255, 0.9), rgba(103, 234, 255, 0.34) 35%, transparent 72%),
    radial-gradient(ellipse 15% 4% at 48% 58%, rgba(234, 251, 255, 0.72), rgba(149, 104, 255, 0.28) 42%, transparent 74%),
    radial-gradient(ellipse 22% 5% at 82% 74%, rgba(103, 234, 255, 0.58), transparent 72%);
  mix-blend-mode: screen;
  transform: rotate(var(--saturn-equator-angle));
}
```

Keep `.saturn-light` above the new clipped layers. Move the old fixed left/right darkening out of `.saturn-bands::after` and into `.saturn-light` so the light does not rotate.

- [ ] **Step 5: Run focused and existing static tests**

Run:

```powershell
node --test test/stellar-scene-contract.test.cjs test/theme-contract.test.cjs test/theme-template.test.cjs test/theme-accessibility-contract.test.cjs
```

Expected: all selected tests pass; particle hashes match exactly.

- [ ] **Step 6: Commit the static composition**

```powershell
git add -- test/stellar-scene-contract.test.cjs themes/fluid-particle/layout/_partial/space-scene.ejs themes/fluid-particle/source/css/space-scene.css
git commit -m "feat: shape high-energy ringed star"
```

### Task 2: Seamless surface rotation, prominence activity, and motion control

**Files:**
- Modify: `test/stellar-scene-contract.test.cjs`
- Modify: `test/theme-browser-behavior.test.cjs:62-223,367-449`
- Modify: `themes/fluid-particle/source/css/space-scene.css:96-210`
- Modify: `themes/fluid-particle/source/css/main.css:233-270,603-619`

**Interfaces:**
- Consumes: Task 1's five `.saturn-prominence` groups, `.saturn-flares`, and `--saturn-equator-angle`.
- Produces: `saturn-gas-rotation`, `saturn-magnetic-rotation`, `saturn-flare-transit`, and `saturn-prominence-breathe` CSS animations governed by the existing scene classes.

- [ ] **Step 1: Extend static tests with animation and fallback contracts**

Add assertions that every `@keyframes` block contains only `transform` and `opacity`, both surface pseudo-elements use linear one-way infinite animations without `alternate`, `.motion-paused` and `.particle-fallback` pause all four animated targets, and `main.css` contains:

```css
.home-hero:has(.particle-fallback) .motion-toggle {
  display: none;
}
```

The test must explicitly reject `background-position`, animated `filter`, animated `box-shadow`, and `alternate` in the new keyframes/animation declarations.

- [ ] **Step 2: Extend the Chrome fixture and verify RED**

Render a full probe fragment containing `.home-hero`, `#motion-toggle`, `.saturn-system`, `.saturn-ring`, `.saturn-bands`, `.saturn-flares`, and two `.saturn-prominence` SVG groups. Return arrays for the computed animation names/play states of:

```js
const animatedStyles = [
  getComputedStyle(bands, '::before'),
  getComputedStyle(bands, '::after'),
  getComputedStyle(document.querySelector('.saturn-flares')),
  ...Array.from(document.querySelectorAll('.saturn-prominence')).map(node => getComputedStyle(node))
]
```

Add tests requiring all states to be `paused` after `.motion-paused`, `running` after removal, `none` under reduced motion, and `paused` under `.particle-fallback`. Also require the fallback button to compute to `display: none`, both ring and bands to inherit `-10deg`, and `transformBox` to be `fill-box` for each prominence group.

Run:

```powershell
npm run build
node --test test/theme-browser-behavior.test.cjs
```

Expected: new motion-layer assertions fail because only the old `saturn-latitude-drift` animation exists.

- [ ] **Step 3: Implement seamless two-speed surface motion**

Make `.saturn-bands` an oversized, rotated clipping coordinate plane. Give `::before` and `::after` 200% width with horizontally repeating feature maps sized to 50% of the animated element. Use:

```css
.saturn-bands {
  position: absolute;
  inset: -14% -22%;
  overflow: hidden;
  border-radius: 45%;
  transform: rotate(var(--saturn-equator-angle)) scale(1.08);
  transform-origin: center;
}

.saturn-bands::before,
.saturn-bands::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 200%;
  content: "";
  background-repeat: repeat-x;
  background-size: 50% 100%;
}

.saturn-bands::before {
  background-image:
    radial-gradient(ellipse 11% 4% at 17% 29%, rgba(234, 251, 255, 0.62), transparent 72%),
    radial-gradient(ellipse 15% 5% at 36% 49%, rgba(103, 234, 255, 0.46), transparent 74%),
    radial-gradient(ellipse 12% 4% at 27% 70%, rgba(149, 104, 255, 0.54), transparent 75%),
    repeating-linear-gradient(180deg, transparent 0 7%, rgba(103, 234, 255, 0.18) 8% 10%, transparent 11% 17%, rgba(149, 104, 255, 0.2) 18% 22%, transparent 23% 31%);
  mix-blend-mode: screen;
  animation: saturn-gas-rotation 26s linear infinite;
  will-change: transform;
}

.saturn-bands::after {
  background-image:
    radial-gradient(ellipse 10% 6% at 32% 53%, transparent 0 36%, rgba(234, 251, 255, 0.52) 43% 52%, rgba(149, 104, 255, 0.3) 58%, transparent 71%),
    repeating-linear-gradient(174deg, transparent 0 8%, rgba(103, 234, 255, 0.2) 8.5% 9.3%, transparent 10% 16%, rgba(149, 104, 255, 0.24) 16.5% 17.3%, transparent 18% 27%);
  mix-blend-mode: screen;
  opacity: 0.72;
  animation: saturn-magnetic-rotation 42s linear infinite;
  animation-delay: -17s;
  will-change: transform;
}

@keyframes saturn-gas-rotation {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}

@keyframes saturn-magnetic-rotation {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}
```

Both texture images must tile exactly across the 50% repeat boundary. The negative delay offsets their phases while both transforms keep the same screen direction.

- [ ] **Step 4: Implement flare transit and prominent limb breathing**

Use one transform/opacity-only keyframe and per-group variables:

```css
.saturn-prominence {
  --prominence-shift-x: 1%;
  --prominence-shift-y: -2%;
  --prominence-scale: 1.08;
  animation: saturn-prominence-breathe 9s ease-in-out infinite;
  will-change: transform, opacity;
}

.saturn-prominence--crown { --prominence-shift-x: 0%; --prominence-shift-y: -2%; --prominence-scale: 1.09; animation-duration: 10.8s; animation-delay: -4.2s; }
.saturn-prominence--upper-east { --prominence-shift-x: 1.5%; --prominence-shift-y: -1.5%; --prominence-scale: 1.11; animation-duration: 7.6s; animation-delay: -2.8s; }
.saturn-prominence--east { --prominence-shift-x: 2%; --prominence-shift-y: 0%; --prominence-scale: 1.12; animation-duration: 11.6s; animation-delay: -7.1s; }
.saturn-prominence--lower-east { --prominence-shift-x: 1.5%; --prominence-shift-y: 1.5%; --prominence-scale: 1.1; animation-duration: 8.4s; animation-delay: -5.3s; }
.saturn-prominence--lower { --prominence-shift-x: 0%; --prominence-shift-y: 1.5%; --prominence-scale: 1.07; animation-duration: 9.7s; animation-delay: -1.7s; }

.saturn-flares {
  animation: saturn-flare-transit 13s ease-in-out infinite;
  will-change: transform, opacity;
}

@keyframes saturn-prominence-breathe {
  0%, 100% { opacity: 0.68; transform: translate3d(0, 0, 0) scale(1); }
  52% { opacity: 1; transform: translate3d(var(--prominence-shift-x), var(--prominence-shift-y), 0) scale(var(--prominence-scale)); }
}

@keyframes saturn-flare-transit {
  0%, 100% { opacity: 0.44; transform: rotate(var(--saturn-equator-angle)) translate3d(-7%, 0, 0); }
  45% { opacity: 0.88; transform: rotate(var(--saturn-equator-angle)) translate3d(4%, 0, 0); }
  72% { opacity: 0.58; transform: rotate(var(--saturn-equator-angle)) translate3d(9%, 0, 0); }
}
```

Set small per-group shift/scale variables so the upper/right loops move outward from their limb attachment points rather than toward the text.

- [ ] **Step 5: Implement pause, fallback, and reduced-motion rules**

Use the complete selector set in both `.motion-paused` and `.particle-fallback` rules:

```css
.motion-paused .saturn-bands::before,
.motion-paused .saturn-bands::after,
.motion-paused .saturn-flares,
.motion-paused .saturn-prominence,
.particle-fallback .saturn-bands::before,
.particle-fallback .saturn-bands::after,
.particle-fallback .saturn-flares,
.particle-fallback .saturn-prominence {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  .saturn-bands::before,
  .saturn-bands::after,
  .saturn-flares,
  .saturn-prominence {
    animation: none;
  }
}
```

Add the exact `:has(.particle-fallback)` button-hiding rule to `main.css`; do not edit either particle JavaScript file.

- [ ] **Step 6: Run motion tests and verify GREEN**

Run:

```powershell
npm run build
node --test test/stellar-scene-contract.test.cjs test/theme-browser-behavior.test.cjs test/theme-accessibility-contract.test.cjs test/particle-renderer-contract.test.cjs test/particle-core.test.cjs
```

Expected: all selected tests pass; Chrome exposes only transform/opacity star animations; normal, paused, fallback, and reduced-motion states match the contract.

- [ ] **Step 7: Commit motion behavior**

```powershell
git add -- test/stellar-scene-contract.test.cjs test/theme-browser-behavior.test.cjs themes/fluid-particle/source/css/space-scene.css themes/fluid-particle/source/css/main.css
git commit -m "feat: animate stellar surface and prominences"
```

### Task 3: Responsive geometry, visual tuning, and final performance gate

**Files:**
- Modify: `test/theme-browser-behavior.test.cjs`
- Modify: `themes/fluid-particle/source/css/space-scene.css`
- Create: `docs/development/verification/2026-08-30-high-energy-ringed-star.md`

**Interfaces:**
- Consumes: Task 2's complete star composition and animation selectors.
- Produces: verified desktop/mobile positioning and final evidence without changing particle behavior.

- [ ] **Step 1: Add the failing real-home geometry probe**

Add `runStellarCompositionProbe(viewport)` beside the article probe helpers. It reads `public/index.html`, constrains body width to 320 px when requested, pauses `#space-scene`, and returns:

```js
{
  noHorizontalOverflow: document.body.scrollWidth <= acceptanceWidth,
  visibleProminenceGroups: prominenceGroups.filter(group => {
    const rect = group.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 &&
      rect.left < acceptanceWidth && rect.top < viewportHeight
  }).length,
  copyIntersections: prominenceGroups.filter(group => rectanglesIntersect(
    group.getBoundingClientRect(),
    document.querySelector('.home-hero__copy').getBoundingClientRect()
  )).map(group => group.getAttribute('class')),
  ringAngle: getComputedStyle(document.querySelector('.saturn-ring')).getPropertyValue('--saturn-equator-angle').trim(),
  bandsAngle: getComputedStyle(document.querySelector('.saturn-bands')).getPropertyValue('--saturn-equator-angle').trim()
}
```

Test both `{ width: 1440, height: 900 }` and `{ width: 320, height: 740 }`; require no overflow, zero intersections, at least two distinct groups, and matching `-10deg` angles.

- [ ] **Step 2: Run the geometry probe and verify it detects any initial overlap**

Run:

```powershell
npm run build
node --test test/theme-browser-behavior.test.cjs
```

Expected: the new test either fails on initial flare bounds/overflow or establishes that the first implementation already meets the exact geometry contract. If it passes immediately, temporarily change the required visible count to six, observe the expected failure, then restore the specified threshold of two before continuing.

- [ ] **Step 3: Tune only the star's responsive geometry**

Keep the existing `.saturn-system` desktop/mobile placement. If the probe reports overlap, adjust only `.saturn-prominences` position/scale and per-group outward shifts. Under `max-width: 760px`, use:

```css
.saturn-prominences {
  top: 7%;
  left: 10%;
  width: 80%;
  height: 74%;
}

.saturn-prominence {
  --prominence-scale: 1.045;
}
```

Do not change the Canvas selector, opacity, parent coordinate system, or particle files.

- [ ] **Step 4: Run the complete automated suite**

Run:

```powershell
npm test
```

Expected: all Node, build, accessibility, renderer, and Chrome tests pass after a fresh Hexo clean/build.

- [ ] **Step 5: Inspect the live composition at four viewports**

Start or reuse a Hexo preview, then inspect 1920×1080, 1440×900, 768×1024, and 320×740. Pause once and confirm every stellar layer freezes; resume and confirm no layer resets. Confirm the high-energy silhouette, fixed light direction, seamless surface loop, ring occlusion, legible hero copy, and no horizontal scrolling. Capture one desktop and one mobile screenshot for visual comparison outside the repository.

- [ ] **Step 6: Measure foreground performance and verify particle hashes**

At 1920×1080 and DPR 1, keep the preview tab foregrounded for at least 20 seconds and record `window.__fluidParticleMetrics.snapshot()`. Require FPS ≥110, average frame time ≤10 ms, long-frame percentage <2%, 320 particles at quality level 2, and layer counts `{ dust: 269, glint: 42, streak: 9 }`. Then run:

```powershell
Get-FileHash themes/fluid-particle/source/js/particle-core.js -Algorithm SHA256
Get-FileHash themes/fluid-particle/source/js/particle-flow.js -Algorithm SHA256
git diff d9190d2 -- themes/fluid-particle/source/js/particle-core.js themes/fluid-particle/source/js/particle-flow.js
```

Expected: both hashes equal the Global Constraints and the particle-source diff is empty.

- [ ] **Step 7: Record verification evidence**

Create `docs/development/verification/2026-08-30-high-energy-ringed-star.md` containing the exact test count, viewport results, measured performance snapshot, two particle hashes, confirmation that the particle diff is empty, reduced-motion/pause/fallback results, and the screenshot paths inspected. Do not use estimated or rounded substitute values.

- [ ] **Step 8: Commit responsive tuning and evidence**

```powershell
git add -- test/theme-browser-behavior.test.cjs themes/fluid-particle/source/css/space-scene.css docs/development/verification/2026-08-30-high-energy-ringed-star.md
git commit -m "test: verify high-energy star experience"
```

- [ ] **Step 9: Run the final clean-worktree gate**

Run:

```powershell
npm test
git diff --check
git status --short
```

Expected: the full suite passes, `git diff --check` emits nothing, and `git status --short` is empty.
