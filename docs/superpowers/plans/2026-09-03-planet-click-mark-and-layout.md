# Planet Click Mark and Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-second surface-anchored gas mark after desktop left-click, lengthen the cursor comet fade to 520ms, and move the complete planet system slightly right on desktop without changing mobile composition.

**Architecture:** Extend the pure planet core with a reusable one-channel texture-space mark mask and optional mark blending in the existing projection pass. The renderer owns one fixed mask and one scalar lifetime, replaces the mark on each valid click, and clears it with every existing interaction blocker. CSS changes remain limited to the comet duration and a desktop-only responsive translation of the whole Saturn system.

**Tech Stack:** Hexo, CommonJS/UMD JavaScript, Canvas 2D typed-array rendering, CSS, Node 22 `node:test`, headless Chrome probes.

## Global Constraints

- The mark is a single blue-violet/cyan gas imprint anchored in texture space and lasts exactly 3000ms.
- The existing impact displacement still decays in 720ms; a new valid click replaces the previous mark.
- The renderer must not allocate DOM nodes, arrays, objects, or timers in its animation hot path.
- Input remains disabled at `max-width: 760px`, for coarse/no-hover pointers, and for reduced motion.
- Cursor comet fade duration is exactly 520ms and still uses exactly eight reusable nodes with `pointer-events: none`.
- Desktop translation is `clamp(3px, calc(1vw - 9px), 12px)`; the mobile rule remains `transform: none`.
- Desktop ring clearance stays at least 8px with no copy collision or horizontal overflow.

---

### Task 1: Texture-space surface mark primitives

**Files:**
- Modify: `test/planet-core.test.cjs`
- Modify: `themes/fluid-particle/source/js/planet-core.js`

**Interfaces:**
- Produces: `captureSurfacePoint(map, textureWidth, basePhase, normalizedX, normalizedY, output): Float64Array`; writes texture X, texture Y, and validity flag to caller-owned `output[0..2]`.
- Produces: `writeSurfaceMarkMask(output, width, height, centerX, centerY): Uint8Array`; clears and rewrites one wrapped, soft spiral mark in a caller-owned single-channel texture mask.
- Extends: `renderProjectedFrame(texturePixels, textureWidth, map, basePhase, outputPixels, markMask?, markEnergy?): Uint8ClampedArray`; optional arguments tint RGB only and preserve alpha.

- [ ] **Step 1: Write failing core tests**

Add these helpers and tests before changing the core:

```js
test('surface point capture maps a visible click to the currently sampled texture coordinate', () => {
  const map = core.createSphereMap({ width: 64, height: 56, sourceWidth: 128, sourceHeight: 64, equatorRadians: -10 * Math.PI / 180 })
  const point = new Float64Array(3)
  assert.equal(core.captureSurfacePoint(map, 128, 0.07, 0, 0, point), point)
  assert.equal(point[2], 1)
  assert.ok(point[0] >= 0 && point[0] < 128)
  assert.ok(point[1] >= 0 && point[1] < 64)
  assert.equal(core.captureSurfacePoint(map, 128, 0.07, 1, 1, point)[2], 0)
})

test('surface mark mask wraps at the longitude seam and reuses caller storage', () => {
  const mask = new Uint8Array(64 * 32)
  assert.equal(core.writeSurfaceMarkMask(mask, 64, 32, 1, 16), mask)
  assert.ok(mask[16 * 64 + 1] > 0)
  assert.ok(mask[16 * 64 + 63] > 0)
  assert.ok(mask.some(value => value > 0))
})

test('projected surface mark follows phase, fades by energy, and preserves alpha', () => {
  const texture = new Uint8ClampedArray(128 * 64 * 4)
  core.fillTexturePixels(texture, 128, 64, 0x706C616E)
  const map = core.createSphereMap({ width: 64, height: 56, sourceWidth: 128, sourceHeight: 64, equatorRadians: 0 })
  const point = new Float64Array(3)
  core.captureSurfacePoint(map, 128, 0, 0, 0, point)
  const mask = new Uint8Array(128 * 64)
  core.writeSurfaceMarkMask(mask, 128, 64, point[0], point[1])
  const baseline = new Uint8ClampedArray(64 * 56 * 4)
  const full = new Uint8ClampedArray(baseline.length)
  const half = new Uint8ClampedArray(baseline.length)
  const zero = new Uint8ClampedArray(baseline.length)
  core.renderProjectedFrame(texture, 128, map, 0, baseline)
  core.renderProjectedFrame(texture, 128, map, 0, full, mask, 1)
  core.renderProjectedFrame(texture, 128, map, 0, half, mask, 0.5)
  core.renderProjectedFrame(texture, 128, map, 0, zero, mask, 0)
  let fullDelta = 0
  let halfDelta = 0
  for (let offset = 0; offset < baseline.length; offset += 4) {
    fullDelta += Math.abs(full[offset] - baseline[offset]) + Math.abs(full[offset + 1] - baseline[offset + 1]) + Math.abs(full[offset + 2] - baseline[offset + 2])
    halfDelta += Math.abs(half[offset] - baseline[offset]) + Math.abs(half[offset + 1] - baseline[offset + 1]) + Math.abs(half[offset + 2] - baseline[offset + 2])
    assert.equal(full[offset + 3], baseline[offset + 3])
  }
  assert.ok(fullDelta > halfDelta)
  assert.ok(halfDelta > 0)
  assert.deepEqual(zero, baseline)
})
```

Keep the new mark branch inside the existing extracted `renderProjectedFrame` body and retain these exact rejections:

```js
assert.doesNotMatch(body, /\bnew\s+|Array\.|Object\.|getContext|getComputedStyle|querySelector|createElement|createImageData/)
```

- [ ] **Step 2: Run the new core tests and verify RED**

Run:

```powershell
npx --yes --cache C:\Users\Lenovo\AppData\Local\Temp\quarkbobo-npm-cache node@22 --test test/planet-core.test.cjs
```

Expected: FAIL because `captureSurfacePoint` and `writeSurfaceMarkMask` are not exported and `renderProjectedFrame` does not blend marks.

- [ ] **Step 3: Implement the minimal pure core**

In `planet-core.js`:

```js
function captureSurfacePoint (map, textureWidth, basePhase, normalizedX, normalizedY, output) {
  output[2] = 0
  const x = Math.max(0, Math.min(map.width - 1, Math.floor((normalizedX + 1) * map.width * 0.5)))
  const y = Math.max(0, Math.min(map.height - 1, Math.floor((normalizedY + 1) * map.height * 0.5)))
  const lookup = map.projectionIndexByPixel[y * map.width + x]
  if (!lookup) return output
  const index = lookup - 1
  output[0] = modulo(map.baseSourceX[index] + basePhase / TAU * textureWidth * map.speedFactors[index], textureWidth)
  output[1] = map.sourceRows[index]
  output[2] = 1
  return output
}
```

Implement `writeSurfaceMarkMask` with these fixed parameters: horizontal radius `Math.max(3, Math.round(width * 0.065))`, vertical radius `Math.max(2, Math.round(height * 0.11))`, wrapped X, clamped Y, and `smoothFalloff(distance) * (0.72 + 0.28 * Math.sin(angle * 3 + distance * 8))`. Call `output.fill(0)` once per click and clamp the result to 0–255. Throw `TypeError('surface mark output length must equal width × height')` unless `output` is a `Uint8Array` of exactly `width * height` bytes.

Extend the existing projection loop after base RGB sampling:

```js
const markEnergyValue = clamp01(markEnergy)
if (markMask && markEnergyValue > 0) {
  const markAlpha = markMask[map.sourceRows[index] * textureWidth + sourceX0] / 255
  const strength = markAlpha * markEnergyValue * markEnergyValue * (3 - 2 * markEnergyValue)
  outputPixels[targetOffset] = clampChannel(outputPixels[targetOffset] + 14 * strength)
  outputPixels[targetOffset + 1] = clampChannel(outputPixels[targetOffset + 1] + 30 * strength)
  outputPixels[targetOffset + 2] = clampChannel(outputPixels[targetOffset + 2] + 48 * strength)
}
```

Keep all scalars local and reuse caller buffers. Export both new functions from the frozen CommonJS/UMD API.

- [ ] **Step 4: Run the core tests and verify GREEN**

Run the Task 1 command again. Expected: all `planet-core` tests pass with no warning or allocation-contract failure.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- test/planet-core.test.cjs themes/fluid-particle/source/js/planet-core.js
git commit -m "feat: add texture-anchored planet marks"
```

---

### Task 2: Three-second click-mark renderer lifecycle

**Files:**
- Modify: `test/planet-renderer-contract.test.cjs`
- Modify: `themes/fluid-particle/source/js/planet-surface.js`

**Interfaces:**
- Consumes: Task 1 `captureSurfacePoint`, `writeSurfaceMarkMask`, and optional mark arguments to `renderProjectedFrame`.
- Produces: one deferred `Uint8Array(sourceWidth * sourceHeight)` mark mask, one `Float64Array(3)` capture scratch, and scalar `markEnergy` state owned by each renderer lifecycle.

- [ ] **Step 1: Write failing renderer tests**

Replace the old “impact returns to baseline after 720ms” expectation with two explicit phases:

```js
test('valid left click keeps one surface mark after impact decay and clears it at 3000ms', () => {
  const h = createHarness({ recordOutputImages: true, fixedPhase: true, clientWidth: 96, clientHeight: 84 })
  const lifecycle = h.renderer.mount(h.canvas, { scene: h.scene, textureWidth: 64, textureHeight: 32 })
  h.flushIdle()
  const baseline = h.lastOutputImage()
  h.flushRaf(0)
  dispatchAt(h, 'pointerdown', 0, 0)
  h.flushRaf(50)
  const earlyDelta = imageDelta(baseline, h.lastOutputImage())
  h.flushRaf(770)
  const markOnlyDelta = imageDelta(baseline, h.lastOutputImage())
  assert.ok(earlyDelta > markOnlyDelta)
  assert.ok(markOnlyDelta > 0)
  h.flushRaf(3050)
  assert.deepEqual(h.lastOutputImage(), baseline)
  lifecycle.destroy()
})
```

Add a “second click replaces the mark” test by capturing the fixed-phase output after a left-side click, then clicking the right side and asserting the old left-side patch equals baseline while the right-side patch differs. Extend the existing table-driven invalid input test with `{ pointerType: 'touch' }`, `{ button: 1 }`, `{ isPrimary: false }`, and corner coordinates; after each input, advance to 770ms and assert exact baseline. In the existing blocker table, advance a valid click to 770ms, apply each blocker, force one static redraw where the harness already does so, and assert exact baseline. After `destroy()`, assert the last output cannot change when RAF callbacks are flushed. Extend the deferred-allocation test to assert no `Uint8Array(sourceWidth * sourceHeight)` or `Float64Array(3)` is created before idle initialization, and the hot-path source test to reject typed-array construction inside `renderFrame`, `updateInteraction`, and `drawCurrentFrame`.

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```powershell
npx --yes --cache C:\Users\Lenovo\AppData\Local\Temp\quarkbobo-npm-cache node@22 --test test/planet-renderer-contract.test.cjs
```

Expected: FAIL because the mark disappears with the 720ms impact and no mask lifecycle exists.

- [ ] **Step 3: Implement mark state without timers**

In `planet-surface.js`, add scalar `markEnergy = 0`, deferred `markMask`, and deferred `markPoint`. Allocate the typed arrays beside the existing texture/projection buffers during idle initialization, not at mount time.

When a valid pending impact is accepted:

```js
core.captureSurfacePoint(projection, sourceWidth, basePhase, x, y, markPoint)
if (markPoint[2]) {
  core.writeSurfaceMarkMask(markMask, sourceWidth, sourceImage.height, markPoint[0], markPoint[1])
  markEnergy = 1
}
```

Decay independently in `updateInteraction`:

```js
if (markEnergy > 0) markEnergy = Math.max(0, markEnergy - elapsed / 3000)
```

Pass `markMask, markEnergy` to `renderProjectedFrame`. Reset `markEnergy` inside `clearInteraction`; do not use `setTimeout`, add DOM nodes, or retain more than one mark.

- [ ] **Step 4: Run renderer and core tests and verify GREEN**

Run:

```powershell
npx --yes --cache C:\Users\Lenovo\AppData\Local\Temp\quarkbobo-npm-cache node@22 --test test/planet-core.test.cjs test/planet-renderer-contract.test.cjs
```

Expected: all tests pass; no blocker, cleanup, deferred-allocation, or hot-loop contract regresses.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- test/planet-renderer-contract.test.cjs themes/fluid-particle/source/js/planet-surface.js
git commit -m "feat: retain fading marks after planet clicks"
```

---

### Task 3: Cursor duration and desktop-only planet shift

**Files:**
- Modify: `test/cursor-comet-contract.test.cjs`
- Modify: `test/planet-renderer-contract.test.cjs`
- Modify: `test/theme-browser-behavior.test.cjs`
- Modify: `themes/fluid-particle/source/css/space-scene.css`

**Interfaces:**
- Consumes: Task 2 mark lifecycle observable through real Canvas pixels.
- Produces: exact 520ms comet CSS contract and desktop translation custom property `--planet-desktop-shift-x`.

- [ ] **Step 1: Write failing CSS and browser acceptance tests**

Add/adjust assertions:

```js
assert.match(spaceSceneCss, /animation:\s*comet-fade-a\s+520ms\s+ease-out\s+both/)
assert.match(spaceSceneCss, /animation:\s*comet-fade-b\s+520ms\s+ease-out\s+both/)
assert.match(spaceSceneCss, /--planet-desktop-shift-x:\s*clamp\(3px,\s*calc\(1vw - 9px\),\s*12px\)/)
assert.match(spaceSceneCss, /transform:\s*translate\(var\(--planet-desktop-shift-x\),\s*-50%\)/)
```

In the Chrome interaction probe, capture a mark-only frame after 770ms and a final frame after 3050ms. Assert the mark-only RGB delta is positive and smaller than the initial impact, while the final frame equals the fixed-phase baseline. Record the computed X translation and assert it is within 3–12px for desktop; retain the 390px `layoutMode === 'mobile'`, overflowing ring crop, and `transform: none` behavior.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npx --yes --cache C:\Users\Lenovo\AppData\Local\Temp\quarkbobo-npm-cache node@22 --test test/cursor-comet-contract.test.cjs test/planet-renderer-contract.test.cjs test/theme-browser-behavior.test.cjs
```

Expected: FAIL on the current 260ms duration, missing desktop X shift, and old 720ms full-baseline browser expectation.

- [ ] **Step 3: Apply the minimal CSS changes**

Update the desktop system declaration and change both existing comet animation shorthands from `260ms` to `520ms`:

```css
.saturn-system {
  --planet-desktop-shift-x: clamp(3px, calc(1vw - 9px), 12px);
  transform: translate(var(--planet-desktop-shift-x), -50%);
}

.cursor-comet__segment[data-active="true"][data-phase="0"] .cursor-comet__ink {
  animation: comet-fade-a 520ms ease-out both;
}

.cursor-comet__segment[data-active="true"][data-phase="1"] .cursor-comet__ink {
  animation: comet-fade-b 520ms ease-out both;
}
```

Keep the existing two animation names/phases so pooled-node restarts still work. Leave the mobile `.saturn-system { transform: none; }` rule unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 3 command again. Expected: all focused contract and Chrome tests pass at 768, 1024, 1280, 1440, and 390 widths; every desktop ring keeps at least 8px clearance.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- test/cursor-comet-contract.test.cjs test/planet-renderer-contract.test.cjs test/theme-browser-behavior.test.cjs themes/fluid-particle/source/css/space-scene.css
git commit -m "feat: extend cursor trail and shift desktop planet"
```

---

### Task 4: Integrated verification and publication

**Files:**
- Verify: all tracked files and generated Hexo output

**Interfaces:**
- Consumes: Tasks 1–3 complete feature set.
- Produces: clean `master`, passing Node 22 CI, deployed GitHub Pages site.

- [ ] **Step 1: Run the exact fresh local suite**

```powershell
npm run test:fresh
git diff --check
git status --short --branch
```

Expected: Hexo build succeeds, all tests pass, diff check is clean, and only intentional changes are present.

- [ ] **Step 2: Request independent code review**

Review against `docs/superpowers/specs/2026-09-03-planet-click-mark-and-layout-design.md`. Resolve every Critical or Important finding with a new failing regression test before changing production code, then rerun Step 1.

- [ ] **Step 3: Push safely**

```powershell
git fetch origin master
git merge-base --is-ancestor origin/master HEAD
git push origin master
```

Expected: ancestry check exits 0 and the push is a normal fast-forward.

- [ ] **Step 4: Monitor the exact pushed SHA**

Use the public GitHub Actions API to find the `Deploy Hexo site to Pages` run whose `head_sha` equals `git rev-parse HEAD`. Wait until both `build` and `deploy` conclude `success`; if `build` fails, read the public reporter annotation and fix from that evidence.

- [ ] **Step 5: Verify the live page**

Open `https://quarkbobo.github.io/` with a cache-busting query. Verify the brand, both Canvas elements, full desktop ring, positive comet segment lifetime after 300ms, a visible mark after 770ms, disappearance after 3000ms, no horizontal overflow, and unchanged 390px mobile composition.
