# Interactive Space Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the desktop Saturn ring, rename the header station, add a pooled meteor-scratch cursor trail, and add gentle hover plus strong local-click gas displacement to the planet.

**Architecture:** Preserve the existing two-Canvas particle/planet scene and split-ring depth model. Add a separate home-only DOM comet layer with a pure geometry core, then extend the planet's pure projection core with a bounded in-place displacement pass driven by the existing planet lifecycle. Keep all new motion behind the current pause, reduced-motion, visibility, viewport, and fine-pointer policies.

**Tech Stack:** Hexo 8, EJS, CSS, browser JavaScript UMD modules, Canvas 2D, Node.js built-in test runner, existing headless Chrome fixture

**Execution preflight:** Before Task 1, use `superpowers:using-git-worktrees` to create an isolated worktree from the current `master`. Run every task, test, commit, screenshot, and publish command from that verified worktree.

## Global Constraints

- Header text must be exactly `政治月测后宫版V3/太空站`; its home link remains `/` and its accessible name is exactly `政治月测后宫版V3/太空站 首页`.
- Desktop `.saturn-system` uses `right: clamp(4rem, 5vw, 5rem)` and leaves at least 8 CSS pixels of right ring clearance at 1440×900, 1280×720, 1024×768, and 768×1024.
- The 390×844 mobile layout retains its existing partial ring crop and existing `.saturn-system` mobile positioning.
- Cursor trail uses exactly eight pre-rendered DOM segments, ignores movement below 4 CSS pixels, caps a segment at 72 CSS pixels, uses 1–2.5 CSS pixel width, and fades out in 260 ms.
- Hover disturbance radius is normalized `0.32` (16% of diameter) and fades out in 240 ms; primary-click disturbance radius is normalized `0.56` (28% of diameter), has four times the source displacement, and fades out in 720 ms.
- Do not change `particle-core.js` or `particle-flow.js`, add a Canvas, add a dependency, load remote runtime code, replace the system cursor, or alter page content outside the header brand.
- The scene stays decorative and noninteractive: every overlay keeps `pointer-events: none`; global passive listeners observe input without blocking links or buttons.
- Coarse/no-hover/mobile/reduced-motion policies disable the new input effects. Pause, particle fallback, hidden document, window leave, offscreen planet, fallback, and destroy clear transient state.
- Pointer event handlers do not read layout or allocate DOM; hot render helpers reuse caller-owned buffers and do not create arrays, objects, Canvas, or DOM nodes.
- Existing planet quality, backing-size, cadence, metrics shape, fallback isolation, fixed light, silhouette, ring angle, and particle source hashes remain unchanged.

## File Map

- `themes/fluid-particle/layout/_partial/header.ejs` — exact visual and accessible station brand.
- `themes/fluid-particle/layout/layout.ejs` and `_partial/cursor-comet.ejs` — home-only fixed comet overlay with eight pooled segments.
- `themes/fluid-particle/layout/_partial/head.ejs` — home-only comet core/runtime loading order.
- `themes/fluid-particle/source/css/main.css` — responsive one-line station brand.
- `themes/fluid-particle/source/css/space-scene.css` — desktop Saturn containment and comet visuals.
- `themes/fluid-particle/source/js/cursor-comet-core.js` — pure segment geometry and pool indexing.
- `themes/fluid-particle/source/js/cursor-comet.js` — comet input policy, fixed-pool lifecycle, and cleanup.
- `themes/fluid-particle/source/js/planet-core.js` — output-pixel lookup and bounded in-place local gas displacement.
- `themes/fluid-particle/source/js/planet-surface.js` — cached pointer hit testing, hover/impact state, decay, and lifecycle ownership.
- `test/*.test.cjs` — pure, lifecycle, template, accessibility, and real-browser regression coverage.
- `docs/development/verification/2026-09-02-interactive-space-scene.md` — final screenshots, metrics, and verification evidence.

---

### Task 1: Rename the station brand and contain the desktop ring

**Files:**
- Modify: `themes/fluid-particle/layout/_partial/header.ejs`
- Modify: `themes/fluid-particle/source/css/main.css`
- Modify: `themes/fluid-particle/source/css/space-scene.css`
- Modify: `test/theme-accessibility-contract.test.cjs`
- Modify: `test/theme-browser-behavior.test.cjs`

**Interfaces:**
- Produces: the exact header link `<a class="site-brand" href="<%= url_for('/') %>" aria-label="政治月测后宫版V3/太空站 首页">政治月测后宫版V3/太空站</a>`.
- Produces: desktop `.saturn-system { right: clamp(4rem, 5vw, 5rem); }` while preserving the current max-760px rule unchanged.
- Preserves: ring `left: -9%`, `width: 118%`, `height: 23%`, `-10deg` equator, split front/back clips, hero/scene overflow guards, and two-Canvas count.

- [ ] **Step 1: Add failing brand and ring-clearance assertions**

Add this generated-output test to `test/theme-accessibility-contract.test.cjs`:

```js
test('generated home brand names the approved station and links home', () => {
  const output = built('index.html')
  const brand = output.match(/<a\b([^>]*)class="site-brand"([^>]*)>([\s\S]*?)<\/a>/)
  assert.ok(brand)
  const attributes = `${brand[1]} ${brand[2]}`
  assert.equal(htmlAttribute(attributes, 'href'), '/')
  assert.equal(htmlAttribute(attributes, 'aria-label'), '政治月测后宫版V3/太空站 首页')
  assert.equal(textContent(brand[3]), '政治月测后宫版V3/太空站')
})
```

Extend `runPlanetCompositionProbe(viewport)` in `test/theme-browser-behavior.test.cjs` to return these exact fields:

- `sceneRect`: the `.space-scene` bounding rectangle.
- `ringRect`: the un-clipped `.saturn-ring` bounding rectangle.
- `ringRightClearance`: `sceneRect.right - ringRect.right`.
- `brandRect`: the `.site-brand` bounding rectangle.
- `brandLineCount`: the number of non-empty rectangles from a `Range` selecting the brand's text.
- `brandNavigationCollision`: whether `brandRect` intersects any currently visible `.nav-toggle` or `.site-nav` rectangle.
- `viewportWidth`: the requested acceptance width used by the clipping probe.

Generalize the narrow-body fixture constraint from only 320px to every requested width below Chrome's minimum headless window width so the 390px acceptance geometry is genuinely constrained to 390 CSS pixels. Add 1280×720, 1024×768, 768×1024, and 390×844 to the current viewport matrix. For every width above 760 assert:

```js
assert.ok(probe.ringRect.left >= probe.sceneRect.left)
assert.ok(probe.ringRightClearance >= 8, `${viewport.width}px ring clearance`)
assert.equal(probe.noHorizontalOverflow, true)
assert.equal(probe.copyIntersectsPlanetOrRing, false)
```

For every viewport assert:

```js
assert.equal(probe.brandLineCount, 1)
assert.ok(probe.brandRect.right <= probe.viewportWidth)
assert.equal(probe.brandNavigationCollision, false)
```

For 390×844, preserve the current mobile composition assertions and explicitly prove the approved crop remains:

```js
assert.equal(probe.mobilePolicy, true)
assert.equal(probe.layoutMode, 'mobile')
assert.ok(probe.ringRect.right > probe.sceneRect.right)
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm run clean
npm run build
node --test test/theme-accessibility-contract.test.cjs test/stellar-scene-contract.test.cjs test/theme-browser-behavior.test.cjs
```

Expected: brand test reports `Q / LOG`/old accessible name, and at least one desktop ring-clearance assertion fails; existing mobile ring policy still passes.

- [ ] **Step 3: Apply the minimal template and CSS changes**

Use this header anchor:

```ejs
<a class="site-brand" href="<%= url_for('/') %>" aria-label="政治月测后宫版V3/太空站 首页">政治月测后宫版V3/太空站</a>
```

Change only the base desktop position and add scoped brand rules:

```css
.site-brand {
  white-space: nowrap;
}

.saturn-system {
  right: clamp(4rem, 5vw, 5rem);
}

@media (max-width: 760px) {
  .site-brand {
    font-size: 0.68rem;
    letter-spacing: 0.08em;
  }
}
```

Do not change the existing mobile `.saturn-system` block.

- [ ] **Step 4: Rebuild and verify GREEN**

Run:

```powershell
npm run build
node --test test/theme-accessibility-contract.test.cjs test/stellar-scene-contract.test.cjs test/theme-browser-behavior.test.cjs
```

Expected: all focused tests pass; desktop ring has at least 8 CSS pixels of clearance, 390×844 keeps its mobile crop, the brand is one line without navigation collision at every viewport, and no overflow/copy collision appears.

- [ ] **Step 5: Commit the isolated visual correction**

```powershell
git add themes/fluid-particle/layout/_partial/header.ejs themes/fluid-particle/source/css/main.css themes/fluid-particle/source/css/space-scene.css test/theme-accessibility-contract.test.cjs test/theme-browser-behavior.test.cjs
git commit -m "feat: contain ring and rename station brand"
```

### Task 2: Add deterministic comet-segment geometry

**Files:**
- Create: `themes/fluid-particle/source/js/cursor-comet-core.js`
- Create: `test/cursor-comet-core.test.cjs`

**Interfaces:**
- Produces frozen UMD/CommonJS API `FluidCursorCometCore`.
- Produces `writeSegment(previous, current, output) -> boolean`; inputs have finite numeric `x`, `y`, `time`, and output is mutated to `{ x, y, length, angle, width }`.
- Produces `nextPoolIndex(index, size) -> number`.
- Constants: `MIN_DISTANCE=4`, `MAX_LENGTH=72`, `MIN_WIDTH=1`, `MAX_WIDTH=2.5`, `MAX_SPEED=8` CSS px/ms.

- [ ] **Step 1: Create failing pure-core tests**

Create `test/cursor-comet-core.test.cjs` with real behavior assertions:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const modulePath = path.resolve(__dirname, '../themes/fluid-particle/source/js/cursor-comet-core.js')
const core = require(modulePath)

test('segment ignores jitter, caps length, and keeps the current point as its head', () => {
  const out = {}
  assert.equal(core.writeSegment({ x: 10, y: 10, time: 0 }, { x: 12, y: 12, time: 16 }, out), false)
  assert.equal(core.writeSegment({ x: 0, y: 0, time: 0 }, { x: 200, y: 0, time: 20 }, out), true)
  assert.deepEqual(out, { x: 128, y: 0, length: 72, angle: 0, width: 2.5 })
})

test('speed maps monotonically to one through two-point-five pixels', () => {
  const slow = {}; const fast = {}
  assert.equal(core.writeSegment({ x: 0, y: 0, time: 0 }, { x: 8, y: 0, time: 80 }, slow), true)
  assert.equal(core.writeSegment({ x: 0, y: 0, time: 0 }, { x: 8, y: 0, time: 1 }, fast), true)
  assert.ok(slow.width >= 1 && slow.width < fast.width && fast.width <= 2.5)
})

test('pool index cycles over exactly eight reusable slots', () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => core.nextPoolIndex(index, 8)), [1, 2, 3, 4, 5, 6, 7, 0, 1, 2])
})
```

Also test a negative diagonal angle/tail, output identity, nonfinite rejection, invalid pool size returning zero, browser export key parity, and both exports being frozen.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/cursor-comet-core.test.cjs`

Expected: FAIL with `MODULE_NOT_FOUND` for `cursor-comet-core.js`.

- [ ] **Step 3: Implement the pure UMD core**

Use the existing module wrapper style and this geometry:

```js
function writeSegment (previous, current, output) {
  if (!finitePoint(previous) || !finitePoint(current) || !output) return false
  const dx = current.x - previous.x
  const dy = current.y - previous.y
  const distance = Math.hypot(dx, dy)
  if (distance < MIN_DISTANCE) return false
  const length = Math.min(distance, MAX_LENGTH)
  const angle = Math.atan2(dy, dx)
  const elapsed = Math.max(1, current.time - previous.time)
  const speed = Math.min(MAX_SPEED, distance / elapsed)
  output.x = current.x - Math.cos(angle) * length
  output.y = current.y - Math.sin(angle) * length
  output.length = length
  output.angle = angle
  output.width = MIN_WIDTH + speed / MAX_SPEED * (MAX_WIDTH - MIN_WIDTH)
  return true
}

function nextPoolIndex (index, size) {
  return Number.isInteger(size) && size > 0 ? (index + 1) % size : 0
}
```

Return a frozen API containing the constants and two functions. Do not read `window`/`document` inside either hot function and do not allocate output storage.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/cursor-comet-core.test.cjs`

Expected: all comet geometry, pool, invalid-input, and UMD tests pass.

- [ ] **Step 5: Commit the pure core**

```powershell
git add themes/fluid-particle/source/js/cursor-comet-core.js test/cursor-comet-core.test.cjs
git commit -m "feat: add comet trail geometry core"
```

### Task 3: Add the home-only eight-segment comet lifecycle

**Files:**
- Create: `themes/fluid-particle/source/js/cursor-comet.js`
- Create: `themes/fluid-particle/layout/_partial/cursor-comet.ejs`
- Modify: `themes/fluid-particle/layout/layout.ejs`
- Modify: `themes/fluid-particle/layout/_partial/head.ejs`
- Modify: `themes/fluid-particle/source/css/space-scene.css`
- Create: `test/cursor-comet-contract.test.cjs`
- Modify: `test/particle-renderer-contract.test.cjs`
- Modify: `test/theme-browser-behavior.test.cjs`

**Interfaces:**
- Consumes: `FluidCursorCometCore.writeSegment()` and `nextPoolIndex()` from Task 2.
- Produces: `FluidCursorComet.mount(overlay, { scene }) -> Object.freeze({ clear, destroy, snapshot })` with idempotent singleton mounting.
- `snapshot()` returns a frozen `{ enabled, listenerAttached, activeSegments, poolIndex }` record.
- Template produces exactly one `#cursor-comet[aria-hidden=true]`, exactly eight `.cursor-comet__segment` nodes, and one permanent `.cursor-comet__ink` child per segment.

- [ ] **Step 1: Write failing lifecycle, template, and asset tests**

Create `test/cursor-comet-contract.test.cjs` with a small fake EventTarget, RAF, media-query, MutationObserver, overlay, and fixed segment styles. Cover these real transitions:

```js
test('fine hover pointer coalesces movement and cycles the fixed eight-node pool', () => {
  const h = createHarness({ fine: true, hover: true })
  const life = h.api.mount(h.overlay, { scene: h.scene })
  h.window.dispatch('pointermove', { clientX: 10, clientY: 10, timeStamp: 0 })
  h.window.dispatch('pointermove', { clientX: 42, clientY: 10, timeStamp: 16 })
  assert.equal(h.pendingRafs(), 1)
  h.flushRaf(16)
  assert.equal(life.snapshot().activeSegments, 1)
  assert.equal(h.overlay.segments.length, 8)
  assert.equal(h.overlay.segments[0].style.getPropertyValue('--comet-length'), '32px')
})
```

Add tests that assert: mobile/coarse/no-hover/reduced starts with zero `pointermove` listeners; listener options are passive; 20 rapid moves queue one RAF; no node is appended; repeated mount is idempotent; `animationend` returns a faded segment to `data-active=false`; pause/fallback/hidden/window leave/blur clears every segment; policy re-enable restores one listener without connecting to the old point; destroy cancels RAF and removes all observers/listeners.

Extend the generated-home checks in `test/particle-renderer-contract.test.cjs`:

```js
assert.equal(occurrences(home, 'id="cursor-comet"'), 1)
assert.equal(occurrences(home, 'class="cursor-comet__segment"'), 8)
assert.equal(occurrences(home, '<canvas'), 2)
assert.equal(occurrences(post, 'cursor-comet'), 0)
```

Assert home script order is particle core/renderer, planet core/renderer, comet core/renderer; inner pages contain neither comet script. Extend the Chrome probe to check eight nodes and computed `pointer-events: none` on overlay and segments.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test test/cursor-comet-contract.test.cjs
npm run build
node --test test/particle-renderer-contract.test.cjs test/theme-browser-behavior.test.cjs
```

Expected: missing runtime/template/assets and absent eight-node overlay assertions fail; the existing two-Canvas assertion remains unchanged.

- [ ] **Step 3: Implement the fixed pool, policy, and CSS**

Render the partial only for home, immediately after `<main>` in `layout.ejs`, and load `cursor-comet-core.js` before `cursor-comet.js` inside the existing home-only head block. Use:

```ejs
<div id="cursor-comet" class="cursor-comet" aria-hidden="true">
  <% for (let index = 0; index < 8; index++) { %>
    <i class="cursor-comet__segment" data-active="false" data-phase="0"><i class="cursor-comet__ink"></i></i>
  <% } %>
</div>
```

In the runtime, query `(max-width: 760px)`, `(pointer: coarse)`, `(pointer: fine)`, `(hover: hover)`, and reduced motion, then define `enabled` exactly as:

```js
const enabled = !mobileQuery.matches && fineQuery.matches && !coarseQuery.matches && hoverQuery.matches &&
  !motionQuery.matches && !document.hidden &&
  !scene.classList.contains('motion-paused') &&
  !scene.classList.contains('particle-fallback')
```

The first eligible passive `pointermove` seeds the preallocated previous point without drawing. Later events update the preallocated pending point; one RAF calls `writeSegment`, sets `--comet-x`, `--comet-y`, `--comet-length`, `--comet-angle`, `--comet-width`, toggles `data-phase`, marks `data-active=true`, and advances the pool index. It never calls DOM creation or layout APIs. Install exactly one `animationend` listener per pooled segment so a completed fade becomes inactive; own and remove those listeners with the lifecycle. `clear()` cancels RAF, resets both points, and marks all eight segments inactive.

Use fixed noninteractive CSS:

```css
.cursor-comet { position: fixed; z-index: 20; inset: 0; overflow: hidden; pointer-events: none; }
.cursor-comet__segment { position: absolute; left: var(--comet-x); top: var(--comet-y); width: var(--comet-length); height: var(--comet-width); transform: rotate(var(--comet-angle)); transform-origin: 0 50%; pointer-events: none; }
.cursor-comet__ink { display: block; width: 100%; height: 100%; border-radius: 999px; background: linear-gradient(90deg, rgba(149,104,255,0), rgba(103,234,255,.58) 70%, #eafbff); box-shadow: 0 0 .65rem rgba(103,234,255,.45); pointer-events: none; }
.cursor-comet__segment[data-active="false"] { display: none; }
.cursor-comet__segment[data-active="true"][data-phase="0"] .cursor-comet__ink { animation: comet-fade-a 260ms ease-out both; }
.cursor-comet__segment[data-active="true"][data-phase="1"] .cursor-comet__ink { animation: comet-fade-b 260ms ease-out both; }
@keyframes comet-fade-a { to { opacity: 0; transform: scaleX(.35); } }
@keyframes comet-fade-b { to { opacity: 0; transform: scaleX(.35); } }
@media (prefers-reduced-motion: reduce) { .cursor-comet { display: none; } }
```

Auto-mount exactly once against `#cursor-comet` and `#space-scene` after deferred script evaluation. Own all five media listeners, MutationObserver, visibility, pointerout-with-null-relatedTarget, blur, pointer listener, animation-end listeners, and RAF in one lifecycle and remove all in `destroy()`.

- [ ] **Step 4: Rebuild and verify GREEN**

Run:

```powershell
npm run build
node --test test/cursor-comet-core.test.cjs test/cursor-comet-contract.test.cjs test/particle-renderer-contract.test.cjs test/theme-accessibility-contract.test.cjs test/theme-browser-behavior.test.cjs
```

Expected: comet behavior and blockers pass; home has exactly eight reusable segments/two canvases; inner pages have no comet assets; existing particle hashes and interactions stay green.

- [ ] **Step 5: Commit the comet lifecycle**

```powershell
git add themes/fluid-particle/source/js/cursor-comet.js themes/fluid-particle/layout/_partial/cursor-comet.ejs themes/fluid-particle/layout/layout.ejs themes/fluid-particle/layout/_partial/head.ejs themes/fluid-particle/source/css/space-scene.css test/cursor-comet-contract.test.cjs test/particle-renderer-contract.test.cjs test/theme-browser-behavior.test.cjs
git commit -m "feat: add home cursor comet trail"
```

### Task 4: Add pure localized gas displacement to the planet core

**Files:**
- Modify: `themes/fluid-particle/source/js/planet-core.js`
- Modify: `test/planet-core.test.cjs`

**Interfaces:**
- Extends `createSphereMap(options)` with `projectionIndexByPixel: Uint32Array(width * height)` where zero is outside the disc and a visible pixel stores `mapIndex + 1`.
- Preserves `renderProjectedFrame(texturePixels, textureWidth, map, basePhase, outputPixels)` unchanged as the zero-interaction fast path.
- Produces `applyLocalizedGasDisplacement(texturePixels, textureWidth, textureHeight, map, basePhase, interaction, outputPixels) -> outputPixels`.
- `interaction` is caller-owned mutable numeric storage: `{ hoverX, hoverY, hoverEnergy, impactX, impactY, impactEnergy }`, with normalized positions in `[-1,1]` and clamped energy in `[0,1]`.

- [ ] **Step 1: Add failing lookup and displacement tests**

Add to `test/planet-core.test.cjs`:

```js
test('localized gas displacement changes only its mapped radius and preserves alpha', () => {
  const texture = new Uint8ClampedArray(128 * 64 * 4)
  core.fillTexturePixels(texture, 128, 64, 0x706C616E)
  const map = core.createSphereMap({ width: 64, height: 56, sourceWidth: 128, sourceHeight: 64, equatorRadians: -10 * Math.PI / 180 })
  const baseline = new Uint8ClampedArray(64 * 56 * 4)
  const disturbed = new Uint8ClampedArray(64 * 56 * 4)
  core.renderProjectedFrame(texture, 128, map, 0.07, baseline)
  disturbed.set(baseline)
  const interaction = { hoverX: 0, hoverY: 0, hoverEnergy: 1, impactX: 0, impactY: 0, impactEnergy: 0 }
  assert.equal(core.applyLocalizedGasDisplacement(texture, 128, 64, map, 0.07, interaction, disturbed), disturbed)
  let changed = 0
  for (let pixel = 0; pixel < map.width * map.height; pixel++) {
    const offset = pixel * 4
    assert.equal(disturbed[offset + 3], baseline[offset + 3])
    const x = ((pixel % map.width) + 0.5) / map.width * 2 - 1
    const y = (Math.floor(pixel / map.width) + 0.5) / map.height * 2 - 1
    const differs = disturbed[offset] !== baseline[offset] || disturbed[offset + 1] !== baseline[offset + 1] || disturbed[offset + 2] !== baseline[offset + 2]
    if (Math.hypot(x, y) > 0.32) assert.equal(differs, false)
    else if (differs) changed++
  }
  assert.ok(changed > 0)
})
```

Add separate behavioral tests: lookup covers every visible target and leaves corners zero; impact at energy 1 changes more pixels and has a larger channel delta than hover at energy 1; hand-authored seam/pole map proves longitude wrap and latitude clamp; zero energy returns the same buffer without modifying baseline; function body has no `new`, Array/Object creation, Canvas, or DOM calls; UMD export remains frozen and keys match CommonJS.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test --test-name-pattern "localized gas displacement|projection lookup|impact at equal energy" test/planet-core.test.cjs
```

Expected: FAIL because `projectionIndexByPixel` and `applyLocalizedGasDisplacement` do not exist.

- [ ] **Step 3: Implement the bounded in-place displacement pass**

During map construction allocate `projectionIndexByPixel`. Immediately after assigning `targetOffsets[visibleCount]`, and before incrementing `visibleCount`, write:

```js
projectionIndexByPixel[targetOffsets[visibleCount] / 4] = visibleCount + 1
```

Return the lookup without changing existing typed-array slices. Add a test that every nonzero lookup entry resolves back to the same target pixel and that every visible target has exactly one lookup entry. In `applyLocalizedGasDisplacement`, compute the union of active hover/impact bounding squares, clamp it to the map, look up visible indices, and add these effect contributions:

```js
const hoverFalloff = smoothFalloff(distanceToHover / 0.32) * clamp01(interaction.hoverEnergy)
const impactFalloff = smoothFalloff(distanceToImpact / 0.56) * clamp01(interaction.impactEnergy)
const sourceShift = hoverFalloff * 1.5 + impactFalloff * 6
```

Use normalized tangent `(-dy / distance, dx / distance)` to offset longitude and half-strength latitude. Pass the explicit `textureHeight` into existing `sampleTextureChannel`, wrapping X and clamping Y; never write alpha. Skip the function call entirely at the lifecycle level when both energies are zero.

- [ ] **Step 4: Run core and renderer tests and verify GREEN**

Run:

```powershell
node --test test/planet-core.test.cjs
node --test test/planet-renderer-contract.test.cjs
node --test test/stellar-scene-contract.test.cjs
```

Expected: all new displacement tests and all existing deterministic projection, allocation, quality, particle-hash, and visual contracts pass.

- [ ] **Step 5: Commit the planet core**

```powershell
git add themes/fluid-particle/source/js/planet-core.js test/planet-core.test.cjs
git commit -m "feat: add localized planet gas displacement core"
```

### Task 5: Add fine-pointer planet interaction and decay lifecycle

**Files:**
- Modify: `themes/fluid-particle/source/js/planet-surface.js`
- Modify: `test/planet-renderer-contract.test.cjs`

**Interfaces:**
- Consumes `core.applyLocalizedGasDisplacement()` from Task 4.
- Preserves `mount(canvas, options)` and frozen lifecycle `{ destroy, snapshot }`; public metrics retain exactly their current keys.
- Owns one preallocated `{ hoverX, hoverY, hoverEnergy, impactX, impactY, impactEnergy }` object and one cached bounds object.

- [ ] **Step 1: Extend the fake harness and add failing lifecycle tests**

Add coarse `(pointer: coarse)` and no-hover `(hover: none)` fake media queries; add a mutable `canvas.getBoundingClientRect()` that increments `state.boundsReads`; capture copies of test-only output image bytes in fake `putImageData`; retain listener counts/options.

Add tests that exercise the real core with rotation held constant in the harness. Implement `fixedPhase` only in the test harness by wrapping the injected core with `advanceBasePhase: phase => phase`; do not add a production option or public hook:

```js
test('fine-pointer interaction accepts the planet ellipse and rejects canvas corners', () => {
  const h = createHarness({ recordOutputImages: true, fixedPhase: true })
  const lifecycle = h.renderer.mount(h.canvas, { scene: h.scene, textureWidth: 64, textureHeight: 32 })
  h.flushIdle()
  const baseline = h.lastOutputImage()
  h.window.dispatch('pointermove', { clientX: h.bounds.left, clientY: h.bounds.top, pointerType: 'mouse', isPrimary: true })
  h.runCompletedDraws(2, 1)
  assert.deepEqual(h.lastOutputImage(), baseline)
  h.window.dispatch('pointermove', { clientX: h.bounds.left + h.bounds.width / 2, clientY: h.bounds.top + h.bounds.height / 2, pointerType: 'mouse', isPrimary: true })
  h.runCompletedDraws(2, 1)
  assert.notDeepEqual(h.lastOutputImage(), baseline)
  lifecycle.destroy()
})
```

Add separate tests proving: pointer handlers use cached bounds with zero synchronous reads; only `button===0` and primary pointer replaces the single impact; impact image delta exceeds hover delta; hover reaches zero after 240 ms and impact after 720 ms with the image returning to fixed-phase baseline; mobile/coarse/no-hover attach neither pointer listener; pause/particle fallback/hidden/offscreen/reduced clears interaction; scroll and resize coalesce one bounds refresh and recompute a stationary pointer; destroy/fallback removes pointer/scroll/media listeners and pending bounds RAF.

- [ ] **Step 2: Run the targeted tests and verify RED**

Run:

```powershell
node --test --test-name-pattern "fine-pointer interaction|cached bounds|primary pointer|impact image|240 ms|mobile coarse|clear interaction|bounds refresh" test/planet-renderer-contract.test.cjs
```

Expected: failures due to missing pointer policy/listeners, cached bounds, hit testing, disturbance call, and decay.

- [ ] **Step 3: Implement interaction state inside the existing lifecycle**

Update `validCore()` to require `applyLocalizedGasDisplacement`. Query `(pointer: coarse)` and `(hover: none)`. Enable input only when:

```js
!mobileQuery.matches && !coarseQuery.matches && !noHoverQuery.matches && !reducedMotion && !destroyed && !fallback
```

Passive pointer handlers only store `clientX/clientY`, primary/button state, and pending flags. A coalesced bounds RAF reads `getBoundingClientRect()` initially and after ResizeObserver/root resize/passive scroll. During the existing render tick convert cached client coordinates using:

```js
const x = (clientX - bounds.left) / bounds.width * 2 - 1
const y = (clientY - bounds.top) / bounds.height * 2 - 1
const inside = x * x + y * y <= 1
```

Hover energy is 1 while inside and decays by `elapsed / 240` after leaving. A valid primary-left `pointerdown` replaces the impact anchor, sets energy to 1, and impact decays by `elapsed / 720`. In `drawCurrentFrame()`, call the unchanged baseline renderer, conditionally call `applyLocalizedGasDisplacement(sourceImage.data, sourceWidth, sourceHeight, projection, basePhase, interaction, outputImage.data)` when either energy is positive, and keep the single `putImageData()`.

One `clearInteraction()` resets energies, hit/pending coordinates, and cached click state whenever any existing blocker begins. Mutation, visibility, intersection, reduced-motion, mobile, coarse-pointer, and no-hover transitions must clear interaction *before* any static redraw or animation cancellation; the reduced-motion redraw must therefore render the clean baseline rather than the last disturbed frame. Extend `cleanupOwned()` to cancel bounds RAF and remove every added pointer, scroll, and media listener; do not start a second animation loop or extend metrics.

- [ ] **Step 4: Run lifecycle, core, and browser-adjacent tests and verify GREEN**

Run:

```powershell
node --test test/planet-renderer-contract.test.cjs
node --test test/planet-core.test.cjs
node --test test/stellar-scene-contract.test.cjs
node --test test/particle-renderer-contract.test.cjs
```

Expected: all interaction/decay/cleanup tests pass, public metrics keys stay exact, no hot-loop allocation assertions regress, and particle renderer/hash contracts remain unchanged.

- [ ] **Step 5: Commit the interaction lifecycle**

```powershell
git add themes/fluid-particle/source/js/planet-surface.js test/planet-renderer-contract.test.cjs
git commit -m "feat: add planet pointer gas interactions"
```

### Task 6: Add browser acceptance, performance evidence, and final verification

**Files:**
- Modify: `test/theme-browser-behavior.test.cjs`
- Create: `docs/development/verification/2026-09-02-interactive-space-scene.md`

**Interfaces:**
- Consumes all prior UI/runtime changes and existing `window.__planetSurfaceMetrics.mark()`, `measureSince()`, and `snapshot()`.
- Produces behavior-based Chrome acceptance for visual composition, comet reuse, planet response, blockers, and the final evidence report.

- [ ] **Step 1: Add deterministic real-browser interaction assertions**

Extend the real browser fixture to dispatch two fine-pointer moves for the comet, and read one segment's active phase/computed styles. Capture bounded `getImageData()` patches before hover, after hover, after primary click, and after decay. Use pixel difference count/sum rather than mock calls:

```js
function patchDifference (before, after) {
  let count = 0
  let sum = 0
  for (let index = 0; index < before.length; index += 4) {
    const delta = Math.abs(after[index] - before[index]) + Math.abs(after[index + 1] - before[index + 1]) + Math.abs(after[index + 2] - before[index + 2])
    if (delta) count++
    sum += delta
  }
  return { count, sum }
}
```

For this fixture only, create a temporary local deferred helper script and insert it between `planet-core.js` and `planet-surface.js`. The helper replaces `window.FluidPlanetCore` with a frozen shallow copy whose `advanceBasePhase(phase)` returns `phase`; this keeps the browser pixels deterministic without adding a production hook. Remove the helper and fixture in `finally`.

Use this interaction sequence: capture baseline; move to the center and capture hover; move outside the ellipse and wait at least 240 ms for a baseline return; dispatch primary-left `pointerdown` at the center without another center move and capture impact; wait at least 720 ms for a second baseline return. Assert: hover changes a bounded center patch; click sum is greater than hover sum; corner pointerdown does not create an impact; both decay checkpoints match baseline; pause prevents both comet and planet response; comet has eight nodes and every overlay node is noninteractive. Launch a separate fixture through the existing `runChromeProbe({ reducedMotion: true })` process for reduced-motion assertions rather than changing that media feature in-place. Re-run the five viewport matrix, but require full ring containment only at widths above 760 and preserve the original 390px mobile geometry assertions.

- [ ] **Step 2: Rebuild and verify the browser acceptance layer**

Run:

```powershell
npm run clean
npm run build
node --test test/theme-browser-behavior.test.cjs
```

Expected: the prior task implementations satisfy every real-browser assertion. If a test fails, treat it as an integration defect: diagnose it, add or tighten a lower-level regression where appropriate, and fix the production code or deterministic fixture without loosening the approved thresholds.

- [ ] **Step 3: Capture deterministic foreground performance and screenshots**

Start the built site with `npm run server -- --port 4000` in a managed terminal session, verify `http://localhost:4000/` responds, and always terminate that exact server session after capture. At 1440×900 with DPR 1, warm up for at least 5 seconds, hold hover for at least 20 completed planet draws, trigger one primary click, allow the 720 ms decay, and record:

```js
const marker = window.__planetSurfaceMetrics.mark()
// after the sample
const evidence = {
  snapshot: window.__planetSurfaceMetrics.snapshot(),
  interaction: window.__planetSurfaceMetrics.measureSince(marker)
}
```

Require complete measurement, p95 draw time at most 4 ms, and no measured draw above 8 ms after warmup. Capture screenshots at 1440×900, 1280×720, 1024×768, 768×1024, and 390×844, plus a 1440×900 paused capture. Save them in one task-specific evidence directory, then record its absolute paths, exact JSON, ring/copy/brand/overflow checks, hover/click observations, and reduced-motion/pause results in the verification document.

- [ ] **Step 4: Run the complete verification suite**

Run:

```powershell
npm run test:fresh
git diff --check
git status --short --branch
```

Expected: Hexo build succeeds; every Node/Chrome test passes with zero failures; diff check is empty; only Task 6's test/evidence files are pending before its commit.

- [ ] **Step 5: Commit browser coverage and evidence**

```powershell
git add test/theme-browser-behavior.test.cjs docs/development/verification/2026-09-02-interactive-space-scene.md
git commit -m "test: verify interactive space scene behavior"
```

- [ ] **Step 6: Run post-commit verification and publish**

Run:

```powershell
npm run test:fresh
git status --short --branch
git push origin HEAD:master
```

After pushing, capture the exact commit with `git rev-parse HEAD`; locate the `pages.yml` run for that commit with GitHub CLI (or the authenticated GitHub UI if CLI access is unavailable), wait using `gh run watch <run-id> --exit-status`, and inspect both `build` and `deploy`. Query the repository's Pages configuration/deployment output for the actual `page_url` rather than trusting `_config.yml`, whose canonical URL may differ. Only after a successful workflow, open the deployed URL with a cache-busting query and verify the exact brand, two-Canvas count, desktop ring containment, and 390px mobile crop. If the workflow fails or the deployed commit/brand does not match, stop and report the failed gate instead of claiming publication succeeded.

Expected: full suite remains green, working tree is clean, remote `master` advances without force, the workflow for the pushed SHA completes with successful `build` and `deploy`, and the actual Pages URL serves that SHA's updated brand and scene.
