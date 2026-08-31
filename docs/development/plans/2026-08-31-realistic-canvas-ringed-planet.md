# Realistic Canvas Ringed Planet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home hero's high-energy star with a believable, slowly rotating cool/warm gas giant and a wide dark dust ring while leaving the existing particle flow unchanged.

**Architecture:** Add a deterministic UMD `planet-core.js` for texture generation, spherical projection, unwrapped differential rotation, backing-size calculation, and quality hysteresis. Add an independent UMD `planet-surface.js` for the second home-only Canvas, idle initialization, lifecycle blockers, adaptive redraw cadence, fallback, and metrics; keep fixed lighting and the back/body/front dust-ring occlusion in CSS.

**Tech Stack:** Hexo 8.1.1, EJS, CSS, Canvas 2D, vanilla JavaScript, Node `node:test`, VM-based browser harnesses, headless Chrome/Edge probes, and the in-app browser for final visual/performance inspection.

## Global Constraints

- The approved design is `docs/development/specs/2026-08-31-realistic-canvas-ringed-planet-design.md` at commit `4093a71`.
- Do not add bitmap textures, remote assets, watermarks, new npm dependencies, WebGL, workers, React, Next.js, or third-party rendering libraries.
- Do not modify article, archive, category, tag, navigation, typography, route, source-content, or publishing-tool behavior.
- Do not modify `themes/fluid-particle/source/js/particle-core.js` or `themes/fluid-particle/source/js/particle-flow.js`; their normalized-LF SHA256 values must remain `A16D193E8874DF1248532458B3114AC0393B746431EF2559C5A2A2035B5F11E0` and `45982BE65E5F465C730DEA7E3E1FCC8FCBC93F6B9C238B346C11F028FD116D2A`.
- The generated home must contain exactly two Canvas elements: one `#particle-flow` and one `#planet-surface`. Inner pages must contain neither scene Canvas and must load none of the four scene scripts.
- Completely remove the prominence SVG, every prominence group, `.saturn-flares`, obsolete prominence/flare/band keyframes, and their pause/mobile/reduced-motion selectors.
- Use only this palette for the planet art: `#070914`, `#17132c`, `#163a57`, `#563459`, `#b45f68`, `#f0d3b1`, and the restrained lit-edge cyan `#68d9f4`.
- Generate one deterministic seamless `1024×512` equirectangular source texture. Expensive noise/path work occurs only during initialization.
- Use an exact equatorial reference period of `70,000ms`, which is inside the approved `68–72s` range. Keep the accumulated base phase unwrapped; calculate `modulo(basePhase * latitudeSpeedFactor, 2π)` only at sampling time.
- Use `latitudeSpeedFactor(latitude) = 0.94 + 0.06 * cos(latitude)^2`; the equator is `1.0` and both poles are `0.94`.
- The hot redraw path creates no arrays, objects, gradients, paths, timers, canvases, or DOM queries. Reuse the projection arrays, source pixels, output `ImageData`, and quality-sample buffers.
- The planet's shared equatorial direction is `-10deg`; fixed CSS light, atmosphere, ring geometry, and body position do not rotate.
- The ring outer horizontal diameter is `188%–194%` of body width, outer vertical diameter is `34%–38%` of body width, and major-axis belt thickness is `7%–10%` of body width. It is static, dark, density-varied, and has only one restrained cyan outer edge.
- The mobile policy and layout both use `matchMedia('(max-width: 760px)')`; `768×1024` uses the desktop/right-side composition.
- Quality levels are desktop `512/30 → 448/24 → 384/20` and mobile `320/20 → 288/18 → 256/15`, where each pair is maximum backing width/redraw FPS. DPR caps are `1.5` desktop and `1.25` mobile.
- One quality window is exactly `120` completed planet redraws. Ignore the first window for adaptation; then degrade one level for p95 `>4ms` or more than `2%` of draws `>8ms`, and restore one level only after two consecutive windows with average `≤2.2ms`, p95 `≤3.2ms`, and no draw `>6ms`.
- Continuous planet animation runs only when initialized, not destroyed, not `.motion-paused`, not `.particle-fallback`, not `matchMedia('(prefers-reduced-motion: reduce)')`, document-visible, and intersecting. Clearing one blocker cannot resume while another remains.
- A planet failure adds only `.planet-fallback`, hides only `#planet-surface`, preserves the CSS planet/ring/lighting and particle Canvas, and never adds `.particle-fallback` or throws uncaught.
- Acceptance viewports are `1920×1080`, `1440×900`, `768×1024`, and `320×740`. There must be no horizontal overflow or visible planet/ring collision with hero copy.
- Do not stage, discard, or rewrite unrelated user changes. Do not push or publish as part of this plan.

---

## File Structure

### Create

- `themes/fluid-particle/source/js/planet-core.js` — deterministic texture pixels, wrapped sampling, sphere lookup arrays, unwrapped phase math, backing policy, and quality hysteresis.
- `themes/fluid-particle/source/js/planet-surface.js` — Canvas setup, detached source Canvas, first-frame reveal, scheduling, observers, fallback, cleanup, and read-only metrics.
- `test/planet-core.test.cjs` — pure timing, texture, seam, projection, sizing, and quality tests.
- `test/planet-renderer-contract.test.cjs` — VM/fake-DOM lifecycle, reuse, blocker, failure, cadence, resize, and isolation tests.
- `docs/development/verification/2026-08-31-realistic-canvas-ringed-planet.md` — final screenshots, measured metrics, hashes, commands, and result record.

### Modify

- `themes/fluid-particle/layout/_partial/space-scene.ejs` — remove star effects and add static surface plus `#planet-surface` in the approved layer order.
- `themes/fluid-particle/layout/_partial/head.ejs` — load `planet-core.js` and `planet-surface.js` on the home route only, after the unchanged particle scripts.
- `themes/fluid-particle/source/css/space-scene.css` — real-planet fallback, fixed light/atmosphere, dark dust ring, Canvas reveal/failure state, and exact responsive layout.
- `test/stellar-scene-contract.test.cjs` — replace obsolete high-energy-star assertions with the realistic planet/ring/particle-protection contract.
- `test/particle-renderer-contract.test.cjs` — change only the generated-page boundary from one home Canvas to the approved two; keep every existing particle lifecycle test intact.
- `test/theme-contract.test.cjs` — require the two new renderer entry points.
- `test/theme-browser-behavior.test.cjs` — replace old prominence/CSS-animation probes with Canvas state, ring geometry, four-viewport composition, reduced-motion, and overflow probes.

### Keep byte-for-byte unchanged

- `themes/fluid-particle/source/js/particle-core.js`
- `themes/fluid-particle/source/js/particle-flow.js`
- All files under `source/`

---

## Execution Preflight

- [ ] **Step 1: Create or select an isolated worktree**

Invoke `superpowers:using-git-worktrees` before editing. Create the execution branch as `codex/realistic-canvas-planet` from the commit containing this plan, using the skill-selected worktree directory. Do not move the current main checkout or copy its unstaged planning-log changes into the worktree.

- [ ] **Step 2: Verify the clean baseline and protected hashes**

Run in the isolated worktree:

```powershell
git status --short --branch
git rev-parse --show-toplevel
npm run test:fresh
$normalize = { param($p) ((Get-Content -Raw -LiteralPath $p) -replace "`r`n", "`n") }
$particleCoreHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes((& $normalize 'themes/fluid-particle/source/js/particle-core.js'))))
$particleFlowHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes((& $normalize 'themes/fluid-particle/source/js/particle-flow.js'))))
if ($particleCoreHash -ne 'A16D193E8874DF1248532458B3114AC0393B746431EF2559C5A2A2035B5F11E0') { throw 'particle-core baseline changed' }
if ($particleFlowHash -ne '45982BE65E5F465C730DEA7E3E1FCC8FCBC93F6B9C238B346C11F028FD116D2A') { throw 'particle-flow baseline changed' }
```

Expected: clean execution worktree, fresh Hexo build succeeds, `99` baseline tests pass, and both hashes match.

---

### Task 1: Implement unwrapped rotation, backing policy, and adaptive quality with TDD

**Files:**
- Create: `themes/fluid-particle/source/js/planet-core.js`
- Create: `test/planet-core.test.cjs`
- Modify: `test/theme-contract.test.cjs:115-129`

**Interfaces:**
- Produces browser/CommonJS global `FluidPlanetCore`.
- Produces constants `TAU`, `ROTATION_PERIOD_MS`, `TEXTURE_WIDTH`, `TEXTURE_HEIGHT`, `QUALITY_WINDOW`, `DESKTOP_LEVELS`, and `MOBILE_LEVELS`.
- Produces `modulo(value, divisor): number`, `latitudeSpeedFactor(latitudeRadians): number`, `advanceBasePhase(basePhase, elapsedMs, periodMs = 70000): number`, and `sampleLongitude(baseLongitude, basePhase, speedFactor): number`.
- Produces `computeBackingSize({ cssWidth, aspectRatio, devicePixelRatio, mobile, level }): { width, height, effectiveDpr, fps, maxWidth }`.
- Produces `createQualityState(level = 2)` and allocation-free `recordDrawCost(state, drawMs): number`, which mutates and returns `state.level`.
- Produces `resetQualitySamples(state): state`, which clears only observation counters and preserves `state.level`.

- [ ] **Step 1: Write failing time, size, and quality tests**

Create the test harness and exact boundary assertions in `test/planet-core.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const modulePath = path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-core.js')
const core = require(modulePath)
const feedWindow = (state, values) => {
  for (let index = 0; index < core.QUALITY_WINDOW; index++) {
    core.recordDrawCost(state, values[index] ?? values.at(-1))
  }
}

test('rotation is frame-rate independent and keeps the equatorial base phase unwrapped', () => {
  const split = core.advanceBasePhase(core.advanceBasePhase(0, 400), 600)
  const whole = core.advanceBasePhase(0, 1000)
  assert.ok(Math.abs(split - whole) < 1e-12)
  assert.ok(core.advanceBasePhase(0, 70001) > core.TAU)
  assert.equal(core.ROTATION_PERIOD_MS, 70000)
})

test('latitude speed and sampling stay continuous across the equatorial 2π boundary', () => {
  assert.equal(core.latitudeSpeedFactor(0), 1)
  assert.ok(Math.abs(core.latitudeSpeedFactor(Math.PI / 4) - 0.97) < 1e-12)
  assert.ok(Math.abs(core.latitudeSpeedFactor(Math.PI / 2) - 0.94) < 1e-12)
  const factor = core.latitudeSpeedFactor(Math.PI / 3)
  const before = core.sampleLongitude(0.7, core.TAU - 1e-6, factor)
  const after = core.sampleLongitude(0.7, core.TAU + 1e-6, factor)
  const circularDelta = Math.abs(core.modulo(after - before + Math.PI, core.TAU) - Math.PI)
  assert.ok(circularDelta < 3e-6, circularDelta)
})

test('backing sizes obey caps, eight-pixel rounding, aspect, and policy levels', () => {
  assert.deepEqual(core.computeBackingSize({ cssWidth: 400, aspectRatio: 43 / 38, devicePixelRatio: 2, mobile: false, level: 2 }), {
    width: 512, height: 456, effectiveDpr: 1.5, fps: 30, maxWidth: 512
  })
  assert.deepEqual(core.computeBackingSize({ cssWidth: 400, aspectRatio: 43 / 38, devicePixelRatio: 2, mobile: true, level: 2 }), {
    width: 320, height: 280, effectiveDpr: 1.25, fps: 20, maxWidth: 320
  })
  assert.equal(core.computeBackingSize({ cssWidth: 3, aspectRatio: 43 / 38, devicePixelRatio: 1, mobile: false, level: 0 }).width, 8)
  assert.deepEqual(core.DESKTOP_LEVELS.map(level => [level.maxWidth, level.fps]), [[384, 20], [448, 24], [512, 30]])
  assert.deepEqual(core.MOBILE_LEVELS.map(level => [level.maxWidth, level.fps]), [[256, 15], [288, 18], [320, 20]])
})

test('quality ignores warmup, degrades one level per bad window, and needs two good windows to restore', () => {
  const state = core.createQualityState(2)
  const samples = state.samples
  feedWindow(state, [5])
  assert.equal(state.level, 2)
  feedWindow(state, [5])
  assert.equal(state.level, 1)
  feedWindow(state, [9, 9, 9, ...Array(117).fill(3)])
  assert.equal(state.level, 0)
  feedWindow(state, [2])
  assert.equal(state.level, 0)
  feedWindow(state, [2])
  assert.equal(state.level, 1)
  assert.equal(state.samples, samples)
  core.resetQualitySamples(state)
  assert.equal(state.level, 1)
  assert.equal(state.count, 0)
})
```

Also extend the renderer-entry-point list in `test/theme-contract.test.cjs` with `source/js/planet-core.js` only. Task 4 adds `source/js/planet-surface.js` to the contract in the same commit that creates it, so no intermediate commit carries a deliberately failing suite.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test test/planet-core.test.cjs
node --test test/theme-contract.test.cjs
```

Expected: `planet-core.test.cjs` fails with `MODULE_NOT_FOUND`; the theme contract reports the missing `planet-core.js` entry point.

- [ ] **Step 3: Add the UMD core and exact policy implementation**

Start `planet-core.js` with the same CommonJS/browser shape as the protected particle core and add these exact policies:

```js
(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.FluidPlanetCore = api
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict'

  const TAU = Math.PI * 2
  const ROTATION_PERIOD_MS = 70000
  const TEXTURE_WIDTH = 1024
  const TEXTURE_HEIGHT = 512
  const QUALITY_WINDOW = 120
  const DESKTOP_LEVELS = Object.freeze([
    Object.freeze({ maxWidth: 384, fps: 20 }),
    Object.freeze({ maxWidth: 448, fps: 24 }),
    Object.freeze({ maxWidth: 512, fps: 30 })
  ])
  const MOBILE_LEVELS = Object.freeze([
    Object.freeze({ maxWidth: 256, fps: 15 }),
    Object.freeze({ maxWidth: 288, fps: 18 }),
    Object.freeze({ maxWidth: 320, fps: 20 })
  ])

  function modulo (value, divisor) {
    const result = value % divisor
    return result < 0 ? result + divisor : result
  }

  function latitudeSpeedFactor (latitudeRadians) {
    const cosine = Math.cos(latitudeRadians)
    return 0.94 + 0.06 * cosine * cosine
  }

  function advanceBasePhase (basePhase, elapsedMs, periodMs) {
    return basePhase + Math.max(0, elapsedMs) / (periodMs || ROTATION_PERIOD_MS) * TAU
  }

  function sampleLongitude (baseLongitude, basePhase, speedFactor) {
    return modulo(baseLongitude + basePhase * speedFactor, TAU)
  }

  function roundToEight (value) {
    return Math.max(8, Math.round(value / 8) * 8)
  }

  function computeBackingSize (options) {
    const levels = options.mobile ? MOBILE_LEVELS : DESKTOP_LEVELS
    const level = Math.max(0, Math.min(2, options.level | 0))
    const policy = levels[level]
    const requestedDpr = Number.isFinite(options.devicePixelRatio) && options.devicePixelRatio > 0 ? options.devicePixelRatio : 1
    const effectiveDpr = Math.min(requestedDpr, options.mobile ? 1.25 : 1.5)
    const width = roundToEight(Math.min(policy.maxWidth, Math.max(1, options.cssWidth) * effectiveDpr))
    const height = roundToEight(width / options.aspectRatio)
    return { width, height, effectiveDpr, fps: policy.fps, maxWidth: policy.maxWidth }
}
```

Use these preallocated quality functions; `recordDrawCost` allocates nothing and makes at most one level change per complete window:

```js
function createQualityState (level) {
  return {
    level: Math.max(0, Math.min(2, Number.isInteger(level) ? level : 2)),
    samples: new Float64Array(QUALITY_WINDOW),
    sorted: new Float64Array(QUALITY_WINDOW),
    count: 0,
    cursor: 0,
    warmupComplete: false,
    restoreWindows: 0,
    averageDrawMs: 0,
    p95DrawMs: 0,
    maxDrawMs: 0,
    over8msPercent: 0
  }
}

function recordDrawCost (state, drawMs) {
  state.samples[state.cursor] = Math.max(0, drawMs)
  state.cursor++
  state.count++
  if (state.count < QUALITY_WINDOW) return state.level

  let sum = 0
  let maximum = 0
  let overEight = 0
  state.sorted.set(state.samples)
  state.sorted.sort()
  for (let index = 0; index < QUALITY_WINDOW; index++) {
    const sample = state.samples[index]
    sum += sample
    if (sample > maximum) maximum = sample
    if (sample > 8) overEight++
  }
  state.averageDrawMs = sum / QUALITY_WINDOW
  state.p95DrawMs = state.sorted[Math.ceil(0.95 * QUALITY_WINDOW) - 1]
  state.maxDrawMs = maximum
  state.over8msPercent = overEight / QUALITY_WINDOW * 100
  state.count = 0
  state.cursor = 0

  if (!state.warmupComplete) {
    state.warmupComplete = true
    state.restoreWindows = 0
    return state.level
  }
  if (state.p95DrawMs > 4 || state.over8msPercent > 2) {
    state.level = Math.max(0, state.level - 1)
    state.restoreWindows = 0
    return state.level
  }
  const restorative = state.averageDrawMs <= 2.2 && state.p95DrawMs <= 3.2 && state.maxDrawMs <= 6
  if (!restorative || state.level === 2) {
    state.restoreWindows = 0
    return state.level
  }
  state.restoreWindows++
  if (state.restoreWindows >= 2) {
    state.level++
    state.restoreWindows = 0
  }
  return state.level
}

function resetQualitySamples (state) {
  state.samples.fill(0)
  state.sorted.fill(0)
  state.count = 0
  state.cursor = 0
  state.restoreWindows = 0
  return state
}
```

The first completed window only sets `warmupComplete = true`. `resetQualitySamples` deliberately preserves `level`, `warmupComplete`, and the last complete-window diagnostic values.

Export every interface named above from one frozen API object.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
node --test test/planet-core.test.cjs
npm run test:node
```

Expected: all rotation, boundary, backing, and hysteresis tests pass; the complete existing Node suite, including `test/theme-contract.test.cjs`, also passes with the new core entry point.

- [ ] **Step 5: Commit the first core slice**

Run:

```powershell
git add -- themes/fluid-particle/source/js/planet-core.js test/planet-core.test.cjs test/theme-contract.test.cjs
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: add planet timing and quality core"
```

Expected: one focused commit; protected particle files are absent from the diff.

---

### Task 2: Generate the seamless mineral texture and reusable spherical projection

**Files:**
- Modify: `themes/fluid-particle/source/js/planet-core.js`
- Modify: `test/planet-core.test.cjs`

**Interfaces:**
- Consumes phase and latitude functions from Task 1.
- Produces `createRng(seed): () => number`.
- Produces `fillTexturePixels(output, width = 1024, height = 512, seed = 0x706C616E): Uint8ClampedArray`.
- Produces allocation-free `sampleTextureChannel(pixels, width, height, x, y, channel): number` for exact wrapped sampling tests.
- Produces `createSphereMap({ width, height, sourceWidth, sourceHeight, equatorRadians }): { targetOffsets, sourceRows, baseSourceX, speedFactors, limbCoverage, visibleCount, width, height }`.
- Produces allocation-free `renderProjectedFrame(texturePixels, textureWidth, map, basePhase, outputPixels): Uint8ClampedArray`; it returns the exact supplied output buffer.

- [ ] **Step 1: Add failing deterministic texture, seam, projection, and reuse tests**

Append these contracts to `test/planet-core.test.cjs`:

```js
test('fixed-seed mineral texture is deterministic, opaque, detailed, warm/cool, and horizontally periodic', () => {
  const width = 64
  const height = 32
  const first = new Uint8ClampedArray(width * height * 4)
  const second = new Uint8ClampedArray(first.length)
  const different = new Uint8ClampedArray(first.length)
  assert.equal(core.fillTexturePixels(first, width, height, 0x706C616E), first)
  core.fillTexturePixels(second, width, height, 0x706C616E)
  core.fillTexturePixels(different, width, height, 0x706C616F)
  assert.deepEqual(first, second)
  assert.notDeepEqual(first, different)

  const colors = new Set()
  let warm = 0
  let cool = 0
  for (let offset = 0; offset < first.length; offset += 4) {
    colors.add(`${first[offset]},${first[offset + 1]},${first[offset + 2]}`)
    if (first[offset] > first[offset + 2] * 1.08) warm++
    if (first[offset + 2] > first[offset] * 1.08) cool++
    assert.equal(first[offset + 3], 255)
  }
  assert.ok(colors.size > 180, colors.size)
  assert.ok(warm > width * height * 0.12, warm)
  assert.ok(cool > width * height * 0.12, cool)

  let seamDelta = 0
  let interiorDelta = 0
  for (let y = 0; y < height; y++) {
    for (let channel = 0; channel < 3; channel++) {
      seamDelta += Math.abs(first[(y * width) * 4 + channel] - first[(y * width + width - 1) * 4 + channel])
      for (let x = 0; x < width - 1; x++) {
        interiorDelta += Math.abs(first[(y * width + x) * 4 + channel] - first[(y * width + x + 1) * 4 + channel])
      }
    }
  }
  const seamMean = seamDelta / (height * 3)
  const interiorMean = interiorDelta / (height * 3 * (width - 1))
  assert.ok(seamMean <= interiorMean * 2.5 + 1, `${seamMean} > ${interiorMean}`)

  for (const channel of [0, 1, 2, 3]) {
    assert.equal(
      core.sampleTextureChannel(first, width, height, -0.25, 13.4, channel),
      core.sampleTextureChannel(first, width, height, width - 0.25, 13.4, channel)
    )
  }
})

test('sphere map excludes corners, stays in bounds, and records differential latitude speed', () => {
  const map = core.createSphereMap({
    width: 64,
    height: 56,
    sourceWidth: 128,
    sourceHeight: 64,
    equatorRadians: -10 * Math.PI / 180
  })
  assert.ok(map.visibleCount > 0 && map.visibleCount < 64 * 56)
  assert.equal(map.targetOffsets.length, map.visibleCount)
  assert.ok(map.targetOffsets instanceof Uint32Array)
  assert.ok(map.sourceRows instanceof Uint16Array || map.sourceRows instanceof Uint32Array)
  assert.ok(map.baseSourceX instanceof Float32Array)
  assert.ok(map.speedFactors instanceof Float32Array)
  assert.ok(map.limbCoverage instanceof Uint8Array)
  for (let index = 0; index < map.visibleCount; index++) {
    assert.ok(map.targetOffsets[index] <= (64 * 56 - 1) * 4)
    assert.ok(map.sourceRows[index] < 64)
    assert.ok(map.baseSourceX[index] >= 0 && map.baseSourceX[index] < 128)
    assert.ok(map.speedFactors[index] >= 0.94 && map.speedFactors[index] <= 1)
    assert.ok(map.limbCoverage[index] >= 0 && map.limbCoverage[index] <= 255)
  }
})

test('projected redraw changes phase while reusing every caller-owned buffer', () => {
  const texture = new Uint8ClampedArray(128 * 64 * 4)
  core.fillTexturePixels(texture, 128, 64, 0x706C616E)
  const map = core.createSphereMap({ width: 64, height: 56, sourceWidth: 128, sourceHeight: 64, equatorRadians: -10 * Math.PI / 180 })
  const output = new Uint8ClampedArray(64 * 56 * 4)
  const targetOffsets = map.targetOffsets
  assert.equal(core.renderProjectedFrame(texture, 128, map, 0, output), output)
  const firstFrame = Uint8ClampedArray.from(output)
  assert.equal(core.renderProjectedFrame(texture, 128, map, 0.07, output), output)
  assert.notDeepEqual(output, firstFrame)
  assert.equal(map.targetOffsets, targetOffsets)
})

test('projected hot loop contains no allocation or DOM work', () => {
  const source = require('node:fs').readFileSync(modulePath, 'utf8')
  const body = source.match(/function renderProjectedFrame[\s\S]*?\n  }/)?.[0] || ''
  assert.ok(body)
  assert.doesNotMatch(body, /\bnew\s+|Array\.|Object\.|getContext|getComputedStyle|querySelector|createElement|createImageData/)
})

test('browser UMD export exposes the same frozen core API as CommonJS', () => {
  const fs = require('node:fs')
  const vm = require('node:vm')
  const source = fs.readFileSync(modulePath, 'utf8')
  const window = {}
  vm.runInNewContext(source, { window, globalThis: window, Math, Object, Number, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Float32Array, Float64Array, TypeError })
  assert.deepEqual(Object.keys(window.FluidPlanetCore).sort(), Object.keys(core).sort())
  assert.ok(Object.isFrozen(core))
  assert.ok(Object.isFrozen(window.FluidPlanetCore))
})
```

- [ ] **Step 2: Run the texture/projection tests and verify RED**

Run: `node --test test/planet-core.test.cjs`

Expected: the Task 1 tests remain green; new tests fail because `fillTexturePixels`, `sampleTextureChannel`, `createSphereMap`, and `renderProjectedFrame` are undefined.

- [ ] **Step 3: Implement deterministic periodic mineral bands and one wrapped vortex**

Add a Mulberry32 RNG and use integer horizontal frequencies so every field is exactly periodic. Fill the caller-owned output with this arithmetic pipeline; clamp channels with `Math.max(0, Math.min(255, Math.round(value)))`:

```js
const PALETTE = Object.freeze({
  night: [23, 19, 44],
  ocean: [22, 58, 87],
  violet: [86, 52, 89],
  terracotta: [180, 95, 104],
  sand: [240, 211, 177]
})

function createRng (seed) {
  let state = seed >>> 0
  return function random () {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function mixChannel (left, right, amount) {
  return left + (right - left) * Math.max(0, Math.min(1, amount))
}

function fillTexturePixels (output, width, height, seed) {
  const textureWidth = width || TEXTURE_WIDTH
  const textureHeight = height || TEXTURE_HEIGHT
  if (!(output instanceof Uint8ClampedArray) || output.length !== textureWidth * textureHeight * 4) {
    throw new TypeError('texture output length must equal width × height × 4')
  }
  const rng = createRng(Number.isInteger(seed) ? seed : 0x706C616E)
  const phases = new Float64Array(8)
  for (let index = 0; index < phases.length; index++) phases[index] = rng() * TAU
  const vortexU = 0.68 + rng() * 0.08
  const vortexV = 0.58 + rng() * 0.08

  for (let y = 0; y < textureHeight; y++) {
    const v = y / Math.max(1, textureHeight - 1)
    for (let x = 0; x < textureWidth; x++) {
      const u = x / textureWidth
      const fieldA = Math.sin(TAU * (3 * u + 1.15 * v) + phases[0])
      const fieldB = Math.sin(TAU * (7 * u - 2.4 * v) + phases[1] + 0.48 * fieldA)
      const fieldC = Math.sin(TAU * (13 * u + 4.2 * v) + phases[2] + 0.31 * fieldB)
      const fieldD = Math.sin(TAU * (19 * u - 7.3 * v) + phases[3] + 0.18 * fieldC)
      const warpedV = v + 0.018 * fieldA + 0.01 * fieldB
      const broadBand = 0.5 + 0.5 * Math.sin(TAU * (5.2 * warpedV + 0.07 * fieldB) + phases[4])
      const fineBand = 0.5 + 0.5 * Math.sin(TAU * (12.4 * warpedV + 0.025 * fieldC) + phases[5])
      const seam = Math.pow(1 - Math.abs(Math.sin(TAU * (8.1 * warpedV + 0.018 * fieldD) + phases[6])), 18)
      const filament = Math.pow(1 - Math.abs(Math.sin(TAU * (17 * u + 5.7 * warpedV) + phases[3])), 24) * Math.max(0, fieldC)
      const localizedDarkening = Math.min(0.72, seam * (0.38 + 0.2 * Math.max(0, fieldB)) + filament * 0.34)
      const wrappedDx = modulo(u - vortexU + 0.5, 1) - 0.5
      const vortexDy = (v - vortexV) * 1.8
      const radius = Math.hypot(wrappedDx * 5.4, vortexDy * 5.4)
      const angle = Math.atan2(vortexDy, wrappedDx)
      const vortex = Math.max(0, 1 - radius) * (0.5 + 0.5 * Math.sin(angle * 2.2 + radius * 15 + phases[7]))
      const warmMix = Math.max(0, Math.min(1, broadBand * 0.72 + fineBand * 0.22 + vortex * 0.28))
      const coolMix = Math.max(0, Math.min(1, 0.38 + 0.28 * fieldA - 0.16 * fieldC))
      const base = coolMix > 0.62 ? PALETTE.ocean : coolMix > 0.34 ? PALETTE.violet : PALETTE.night
      const warm = fineBand > 0.57 ? PALETTE.sand : PALETTE.terracotta
      const offset = (y * textureWidth + x) * 4
      output[offset] = mixChannel(base[0], warm[0], warmMix) * (1 - localizedDarkening)
      output[offset + 1] = mixChannel(base[1], warm[1], warmMix) * (1 - localizedDarkening * 1.04)
      output[offset + 2] = mixChannel(base[2], warm[2], warmMix * 0.82) * (1 - localizedDarkening * 0.8)
      output[offset + 3] = 255
    }
  }
  return output
}
```

The circular `wrappedDx` is the required boundary copy: a vortex that approaches either horizontal edge continues from the other edge without an image seam. Do not create paths, gradients, or per-pixel objects.

- [ ] **Step 4: Implement wrapped bilinear sampling and the precomputed sphere map**

Use modulo for horizontal neighbors, clamp vertical rows, and inverse-rotate normalized disc coordinates by `equatorRadians` before calculating longitude and latitude:

```js
function sampleTextureChannel (pixels, width, height, x, y, channel) {
  const wrappedX = modulo(x, width)
  const clampedY = Math.max(0, Math.min(height - 1, y))
  const x0 = Math.floor(wrappedX)
  const x1 = x0 + 1 === width ? 0 : x0 + 1
  const y0 = Math.floor(clampedY)
  const y1 = Math.min(height - 1, y0 + 1)
  const horizontal = wrappedX - x0
  const vertical = clampedY - y0
  const topLeft = pixels[(y0 * width + x0) * 4 + channel]
  const topRight = pixels[(y0 * width + x1) * 4 + channel]
  const bottomLeft = pixels[(y1 * width + x0) * 4 + channel]
  const bottomRight = pixels[(y1 * width + x1) * 4 + channel]
  const top = topLeft + (topRight - topLeft) * horizontal
  const bottom = bottomLeft + (bottomRight - bottomLeft) * horizontal
  return top + (bottom - top) * vertical
}

function createSphereMap (options) {
  const capacity = options.width * options.height
  const targetOffsets = new Uint32Array(capacity)
  const sourceRows = options.sourceHeight <= 65535 ? new Uint16Array(capacity) : new Uint32Array(capacity)
  const baseSourceX = new Float32Array(capacity)
  const speedFactors = new Float32Array(capacity)
  const limbCoverage = new Uint8Array(capacity)
  const cosine = Math.cos(options.equatorRadians)
  const sine = Math.sin(options.equatorRadians)
  let visibleCount = 0

  for (let y = 0; y < options.height; y++) {
    const normalizedY = ((y + 0.5) / options.height) * 2 - 1
    for (let x = 0; x < options.width; x++) {
      const normalizedX = ((x + 0.5) / options.width) * 2 - 1
      const sphereX = normalizedX * cosine + normalizedY * sine
      const sphereY = -normalizedX * sine + normalizedY * cosine
      const radiusSquared = sphereX * sphereX + sphereY * sphereY
      if (radiusSquared > 1) continue
      const sphereZ = Math.sqrt(Math.max(0, 1 - radiusSquared))
      const latitude = Math.asin(Math.max(-1, Math.min(1, sphereY)))
      const longitude = Math.atan2(sphereX, sphereZ)
      targetOffsets[visibleCount] = (y * options.width + x) * 4
      sourceRows[visibleCount] = Math.min(options.sourceHeight - 1, Math.max(0, Math.round((latitude / Math.PI + 0.5) * (options.sourceHeight - 1))))
      baseSourceX[visibleCount] = modulo(longitude / TAU + 0.5, 1) * options.sourceWidth
      speedFactors[visibleCount] = latitudeSpeedFactor(latitude)
      limbCoverage[visibleCount] = Math.round(Math.min(1, Math.max(0, (1 - Math.sqrt(radiusSquared)) * options.width * 0.7)) * 255)
      visibleCount++
    }
  }

  return {
    targetOffsets: targetOffsets.subarray(0, visibleCount),
    sourceRows: sourceRows.subarray(0, visibleCount),
    baseSourceX: baseSourceX.subarray(0, visibleCount),
    speedFactors: speedFactors.subarray(0, visibleCount),
    limbCoverage: limbCoverage.subarray(0, visibleCount),
    visibleCount,
    width: options.width,
    height: options.height
  }
}
```

Use this allocation-free hot redraw; it interpolates only longitude because latitude rows were precomputed during resize:

```js
function renderProjectedFrame (texturePixels, textureWidth, map, basePhase, outputPixels) {
  const phaseScale = basePhase / TAU * textureWidth
  for (let index = 0; index < map.visibleCount; index++) {
    const sourceX = modulo(map.baseSourceX[index] + phaseScale * map.speedFactors[index], textureWidth)
    const sourceX0 = Math.floor(sourceX)
    const sourceX1 = sourceX0 + 1 === textureWidth ? 0 : sourceX0 + 1
    const horizontal = sourceX - sourceX0
    const rowOffset = map.sourceRows[index] * textureWidth * 4
    const sourceOffset0 = rowOffset + sourceX0 * 4
    const sourceOffset1 = rowOffset + sourceX1 * 4
    const targetOffset = map.targetOffsets[index]
    outputPixels[targetOffset] = texturePixels[sourceOffset0] + (texturePixels[sourceOffset1] - texturePixels[sourceOffset0]) * horizontal
    outputPixels[targetOffset + 1] = texturePixels[sourceOffset0 + 1] + (texturePixels[sourceOffset1 + 1] - texturePixels[sourceOffset0 + 1]) * horizontal
    outputPixels[targetOffset + 2] = texturePixels[sourceOffset0 + 2] + (texturePixels[sourceOffset1 + 2] - texturePixels[sourceOffset0 + 2]) * horizontal
    outputPixels[targetOffset + 3] = map.limbCoverage[index]
  }
  return outputPixels
}
```

Pixels outside the visible map remain transparent from the one-time `ImageData` allocation. Do not clear or recreate that output buffer between frames.

- [ ] **Step 5: Run core tests and the static hot-loop check**

Run:

```powershell
node --test test/planet-core.test.cjs
node --check themes/fluid-particle/source/js/planet-core.js
npm run test:node
```

Expected: all Task 1–2 core tests and the complete Node suite pass; the deterministic texture includes both warm and cool pixels; wrapped samples are exact; projected output changes without replacing caller buffers.

- [ ] **Step 6: Commit the texture/projection slice**

Run:

```powershell
git add -- themes/fluid-particle/source/js/planet-core.js test/planet-core.test.cjs
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: generate seamless spherical planet texture"
```

---

### Task 3: Replace the high-energy star markup and CSS with the approved static planet composition

**Files:**
- Modify: `themes/fluid-particle/layout/_partial/space-scene.ejs`
- Modify: `themes/fluid-particle/source/css/space-scene.css`
- Modify: `test/stellar-scene-contract.test.cjs`
- Modify: `test/particle-renderer-contract.test.cjs:471-483`
- Modify: `test/theme-browser-behavior.test.cjs:62-275,400-479,484-577,614-633`

**Interfaces:**
- Consumes the unchanged `.saturn-system`, `.saturn`, `.saturn-ring--back`, `.saturn-light`, and `.saturn-ring--front` stacking model.
- Produces one `.planet-static-surface`, one `#planet-surface`, one fixed `.saturn-light`, and two clipped ring segments.
- Produces scene state classes `.planet-ready` and `.planet-fallback` for Task 4.
- Preserves `--saturn-equator-angle: -10deg` as the single CSS/Canvas direction source.

- [ ] **Step 1: Rewrite obsolete star contracts before changing production markup**

Replace the first three tests in `test/stellar-scene-contract.test.cjs` with the approved structure and negative assertions while retaining the existing normalized particle-hash test:

```js
test('realistic planet has one static fallback and one surface canvas with no stellar effects', () => {
  const template = sceneTemplate()
  const css = sceneCss()
  assert.equal((template.match(/id="planet-surface"/g) || []).length, 1)
  assert.equal((template.match(/class="planet-static-surface"/g) || []).length, 1)
  assert.equal((template.match(/class="saturn-ring saturn-ring--back"/g) || []).length, 1)
  assert.equal((template.match(/class="saturn-ring saturn-ring--front"/g) || []).length, 1)
  assert.doesNotMatch(template, /saturn-prominence|saturn-flares|<svg\b/i)
  assert.doesNotMatch(`${template}\n${css}`, /https?:\/\/|data:image|url\(/i)
  assert.ok(template.indexOf('saturn-ring--back') >= 0)
  assert.ok(template.indexOf('saturn-ring--back') < template.indexOf('<div class="saturn">'))
  assert.ok(template.indexOf('planet-static-surface') < template.indexOf('id="planet-surface"'))
  assert.ok(template.indexOf('id="planet-surface"') < template.indexOf('saturn-light'))
  assert.ok(template.indexOf('saturn-light') < template.indexOf('saturn-ring--front'))
})

test('dust ring and Canvas surface share the one minus-ten-degree equator', () => {
  const css = sceneCss()
  assert.match(css, /\.saturn-system\s*\{[^}]*--saturn-equator-angle:\s*-10deg;/s)
  assert.match(css, /\.saturn-system\s*\{[^}]*transform:\s*translateY\(-50%\);/s)
  assert.doesNotMatch(css.match(/\.saturn-system\s*\{([^}]*)\}/s)?.[1] || '', /rotate\(/)
  assert.match(css, /\.saturn-ring\s*\{[^}]*transform:\s*rotate\(var\(--saturn-equator-angle\)\);/s)
  assert.match(css, /#planet-surface\s*\{[^}]*--planet-equator-angle:\s*var\(--saturn-equator-angle\);/s)
  assert.doesNotMatch(css, /@keyframes\s+saturn-|saturn-(?:prominence|flare|gas|magnetic)/)
})

test('ring dimensions and restrained edge encode the approved dust geometry', () => {
  const css = sceneCss()
  const ringRule = css.match(/\.saturn-ring\s*\{([^}]*)\}/s)?.[1] || ''
  assert.match(css, /\.saturn\s*\{[^}]*width:\s*62%;[^}]*aspect-ratio:\s*43\s*\/\s*38;/s)
  assert.match(css, /\.saturn-ring\s*\{[^}]*left:\s*-9%;[^}]*width:\s*118%;[^}]*height:\s*23%;/s)
  assert.match(css, /--ring-inner-stop:\s*90\.5%;/)
  assert.equal((ringRule.match(/rgba\(104,\s*217,\s*244,\s*0\.2[0-9]\)/g) || []).length, 1)
  assert.doesNotMatch(ringRule, /\b(?:border|box-shadow|filter)\s*:/)
  assert.doesNotMatch(css, /drop-shadow\([^)]*(?:149,\s*104,\s*255|234,\s*251,\s*255)/)
})
```

Change only the generated-page boundary in `test/particle-renderer-contract.test.cjs`:

```js
test('the generated home owns the approved particle and planet canvases while inner pages load no scene assets', () => {
  const home = built('index.html')
  const post = built(path.join('个人博客', 'Hello-World', 'index.html'))
  assert.equal(occurrences(home, 'id="particle-flow"'), 1)
  assert.equal(occurrences(home, 'id="planet-surface"'), 1)
  assert.equal(occurrences(home, '<canvas'), 2)
  assert.equal(occurrences(home, '<script src="/js/particle-core.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<script src="/js/particle-flow.js" defer></script>'), 1)
  assert.equal(occurrences(home, '<link rel="stylesheet" href="/css/space-scene.css">'), 1)
  assert.equal(occurrences(post, '<canvas'), 0)
  assert.equal(occurrences(post, 'space-scene.css'), 0)
  assert.equal(occurrences(post, 'particle-core.js'), 0)
  assert.equal(occurrences(post, 'particle-flow.js'), 0)
})
```

Leave all other particle-renderer tests byte-for-byte unchanged.

- [ ] **Step 2: Replace the old browser fixture vocabulary and geometry assertions**

In `runChromeProbe`, replace the prominence/band/flare fixture with the new planet body:

```html
<div class="saturn-system">
  <div class="saturn-halo"></div>
  <div class="saturn-ring saturn-ring--back"></div>
  <div class="saturn">
    <div class="planet-static-surface"></div>
    <canvas id="planet-surface" aria-hidden="true"></canvas>
    <div class="saturn-light"></div>
  </div>
  <div class="saturn-ring saturn-ring--front"></div>
</div>
```

Delete the mutation rules and JavaScript queries that mention `.saturn-bands`, `.saturn-flares`, `.saturn-prominence`, or old animation names. Replace their result payload with:

```js
const planet = document.querySelector('.saturn')
const surface = document.getElementById('planet-surface')
const ring = document.querySelector('.saturn-ring')
const sceneAnimations = scene.getAnimations({ subtree: true })
  .filter(function (animation) { return animation.constructor.name === 'CSSAnimation' })
  .map(function (animation) {
    return animation.animationName || animation.effect?.target?.className || 'anonymous'
  })
// Add to the existing result object:
planetPresentation: {
  sceneAnimations,
  surfaceOpacity: getComputedStyle(surface).opacity,
  equatorAngles: {
    ring: getComputedStyle(ring).getPropertyValue('--saturn-equator-angle').trim(),
    surface: getComputedStyle(surface).getPropertyValue('--planet-equator-angle').trim()
  }
}
```

In the existing general Chrome presentation test, keep every accessibility/card/safe-area assertion but replace `saturnAnimationName` and `animationProperties` assertions with:

```js
assert.deepEqual(probe.planetPresentation.sceneAnimations, [])
assert.equal(probe.planetPresentation.surfaceOpacity, '0')
assert.deepEqual(probe.planetPresentation.equatorAngles, { ring: '-10deg', surface: '-10deg' })
```

Replace `motion controls pause every star animation...` with `static planet composition has no CSS motion and preserves shared geometry`, asserting the same empty animation list and equator-angle object. Replace the old reduced-motion Saturn assertion with:

```js
assert.equal(probe.control.display, 'none')
assert.deepEqual(probe.planetPresentation.sceneAnimations, [])
assert.equal(probe.scrollBehavior, 'auto')
```

Task 6 replaces these static presentation checks with live Canvas lifecycle snapshots after the renderer exists.

Rename `runStellarCompositionProbe` to `runPlanetCompositionProbe`. Probe `planet.offsetWidth`, `ring.offsetWidth`, `ring.offsetHeight`, the planet/ring/copy rectangles, two Canvas IDs, overflow, and the same synthetic clipping sentinel. Assert all four acceptance viewports:

```js
test('planet and dust ring keep approved geometry clear of copy at every acceptance viewport', () => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 320, height: 740 }
  ]) {
    const probe = runPlanetCompositionProbe(viewport)
    assert.equal(probe.noHorizontalOverflow, true, `${viewport.width}px overflow`)
    assert.deepEqual(probe.canvasIds, ['particle-flow', 'planet-surface'])
    assert.equal(probe.copyIntersectsPlanetOrRing, false, `${viewport.width}px copy collision`)
    assert.ok(probe.ringWidthRatio >= 1.88 && probe.ringWidthRatio <= 1.94, probe.ringWidthRatio)
    assert.ok(probe.ringHeightRatio >= 0.34 && probe.ringHeightRatio <= 0.38, probe.ringHeightRatio)
    assert.equal(probe.ringAngle, '-10deg')
    assert.equal(probe.surfaceAngle, '-10deg')
    assert.equal(probe.mobilePolicy, viewport.width <= 760)
    assert.equal(probe.layoutMode, viewport.width <= 760 ? 'mobile' : 'desktop')
  }
})
```

For headless Chrome's minimum-window-width behavior, keep the existing 320px body-width constraint. Calculate `mobilePolicy` with `matchMedia('(max-width: 760px)').matches` and `layoutMode` from the computed `--planet-layout-mode`; do not infer either from `window.innerWidth < 768` or pointer coarseness. The `768×1024` assertion must report `mobilePolicy === false` and `layoutMode === 'desktop'`.

- [ ] **Step 3: Run the rewritten contracts and verify RED against the old star**

Run:

```powershell
npm run clean
npm run build
node --test test/stellar-scene-contract.test.cjs test/particle-renderer-contract.test.cjs test/theme-browser-behavior.test.cjs
```

Expected: failures name the missing `#planet-surface`/static surface, forbidden prominence/flare markup, old ring treatment, old animations, and missing four-viewport geometry. Existing particle lifecycle subtests remain green.

- [ ] **Step 4: Replace the scene markup in the exact approved order**

Set `space-scene.ejs` to:

```ejs
<div id="space-scene" class="space-scene" aria-hidden="true">
  <div class="saturn-system">
    <div class="saturn-halo"></div>
    <div class="saturn-ring saturn-ring--back"></div>
    <div class="saturn">
      <div class="planet-static-surface"></div>
      <canvas id="planet-surface" aria-hidden="true"></canvas>
      <div class="saturn-light"></div>
    </div>
    <div class="saturn-ring saturn-ring--front"></div>
  </div>
  <canvas id="particle-flow"></canvas>
</div>
```

Do not retain hidden SVG or flare nodes. The whole scene remains `aria-hidden`; the explicit attribute on the new Canvas makes its decorative status robust if markup is later moved.

- [ ] **Step 5: Replace the planet/ring section of `space-scene.css`**

Keep `.space-scene`, the static stars, and every `#particle-flow` declaration unchanged. Replace the old planet blocks with these geometry and state rules, then tune only gradient stop values during visual QA:

```css
.saturn-system {
  position: absolute;
  z-index: 2;
  top: 50%;
  right: clamp(-3rem, -1vw, 0rem);
  width: clamp(21rem, 40vw, 35rem);
  aspect-ratio: 1;
  --saturn-equator-angle: -10deg;
  --planet-layout-mode: desktop;
  transform: translateY(-50%);
}

.saturn-halo {
  position: absolute;
  z-index: 0;
  top: 16%;
  left: 19%;
  width: 62%;
  aspect-ratio: 43 / 38;
  border-radius: 50%;
  background: radial-gradient(ellipse at 28% 30%, rgba(104, 217, 244, 0.11), rgba(22, 58, 87, 0.04) 42%, transparent 70%);
  filter: blur(1.25rem);
  transform: scale(1.08);
}

.saturn {
  position: absolute;
  z-index: 2;
  top: 16%;
  left: 19%;
  width: 62%;
  aspect-ratio: 43 / 38;
  overflow: hidden;
  border-radius: 50%;
  background: #17132c;
  box-shadow: inset -1.1rem -0.7rem 2.7rem rgba(7, 9, 20, 0.78);
}

.planet-static-surface,
#planet-surface,
.saturn-light {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.planet-static-surface {
  z-index: 1;
  background:
    radial-gradient(ellipse 20% 12% at 68% 62%, transparent 0 32%, rgba(240, 211, 177, 0.42) 38% 46%, rgba(180, 95, 104, 0.34) 52%, transparent 66%),
    repeating-linear-gradient(180deg, rgba(240, 211, 177, 0.44) 0 5%, rgba(86, 52, 89, 0.5) 7% 12%, rgba(22, 58, 87, 0.72) 14% 21%, rgba(180, 95, 104, 0.48) 23% 29%, rgba(23, 19, 44, 0.78) 31% 38%);
  transform: rotate(var(--saturn-equator-angle)) scale(1.08);
}

#planet-surface {
  z-index: 2;
  display: block;
  opacity: 0;
  --planet-equator-angle: var(--saturn-equator-angle);
  transition: opacity 200ms ease-out;
}

.planet-ready #planet-surface { opacity: 1; }
.planet-fallback #planet-surface { display: none; }

.saturn-light {
  z-index: 3;
  background:
    radial-gradient(ellipse at 24% 25%, rgba(240, 211, 177, 0.2), transparent 29%),
    radial-gradient(ellipse at 27% 37%, transparent 0 25%, rgba(7, 9, 20, 0.15) 54%, rgba(7, 9, 20, 0.93) 100%),
    linear-gradient(112deg, rgba(7, 9, 20, 0.18), transparent 31% 58%, rgba(7, 9, 20, 0.55));
  box-shadow: inset 0.13rem 0.1rem 0 rgba(104, 217, 244, 0.38), inset -0.2rem -0.15rem 0.5rem rgba(7, 9, 20, 0.7);
}

.saturn-ring {
  position: absolute;
  left: -9%;
  width: 118%;
  height: 23%;
  --ring-inner-stop: 90.5%;
  border-radius: 50%;
  background: radial-gradient(ellipse closest-side,
    transparent 0 var(--ring-inner-stop),
    rgba(23, 19, 44, 0.58) 91%,
    rgba(86, 52, 89, 0.24) 93%,
    rgba(240, 211, 177, 0.08) 94.2%,
    rgba(22, 58, 87, 0.5) 96%,
    rgba(23, 19, 44, 0.46) 98%,
    rgba(104, 217, 244, 0.24) 99.2%,
    transparent 100%);
  transform: rotate(var(--saturn-equator-angle));
}

.saturn-ring--back { z-index: 1; top: 40%; clip-path: inset(0 0 49% 0); opacity: 0.7; }
.saturn-ring--front { z-index: 3; top: 40%; clip-path: inset(51% 0 0 0); opacity: 0.86; }
```

Delete all old planet keyframes and animation pause selectors. Under `@media (max-width: 760px)`, keep the current lower-right system placement, set `--planet-layout-mode: mobile`, and remove prominence overrides. Under reduced motion, set `#planet-surface { transition: none; }`; do not hide the static surface, fixed light, or ring.

- [ ] **Step 6: Run the focused suite, full suite, and build**

Run:

```powershell
npm run clean
npm run build
node --test test/stellar-scene-contract.test.cjs test/particle-renderer-contract.test.cjs test/theme-browser-behavior.test.cjs
npm run test:node
```

Expected: all tests pass with the static realistic composition; browser probes cover all four viewports; the baseline test total has increased but no prior non-stellar test regresses.

- [ ] **Step 7: Commit the markup/CSS replacement**

Run:

```powershell
git add -- themes/fluid-particle/layout/_partial/space-scene.ejs themes/fluid-particle/source/css/space-scene.css test/stellar-scene-contract.test.cjs test/particle-renderer-contract.test.cjs test/theme-browser-behavior.test.cjs
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: replace stellar effects with realistic dust-ring planet"
```

---

### Task 4: Mount the independent Canvas renderer and reveal only a complete first frame

**Files:**
- Create: `themes/fluid-particle/source/js/planet-surface.js`
- Create: `test/planet-renderer-contract.test.cjs`
- Modify: `themes/fluid-particle/layout/_partial/head.ejs:9-13`
- Modify: `test/theme-contract.test.cjs:115-129`
- Modify: `test/particle-renderer-contract.test.cjs:471-483`
- Modify: `test/theme-accessibility-contract.test.cjs:114-124`

**Interfaces:**
- Consumes `window.FluidPlanetCore`, `#planet-surface`, `#space-scene`, and `--planet-equator-angle` from Tasks 1–3.
- Produces browser/CommonJS `FluidPlanetSurface.mount(canvas, { scene?, seed?, textureWidth?, textureHeight? })`.
- `mount` returns one idempotent lifecycle `{ destroy(): void, snapshot(): Readonly<PlanetSnapshot> }`; it does not expose `start`/`stop` and never binds the motion button.
- Produces read-only `window.__planetSurfaceMetrics` with `snapshot()`, allocation-free `mark()`, and observational `measureSince(marker)`. `snapshot()` has exact keys `averageDrawMs`, `p95DrawMs`, `maxDrawMs`, `over8msPercent`, `redrawFps`, `qualityLevel`, `canvasWidth`, `canvasHeight`, `effectiveDpr`, `initialized`, `running`, `fallback`, `visible`, `pageVisible`, `basePhase`, and `drawCount`; `mark()` returns the current draw serial without mutating renderer state, and `measureSince()` summarizes the retained caller-selected foreground interval.
- Task 4 renders a deterministic first frame and leaves it static. Task 5 adds continuous scheduling and every blocker without changing this public interface.

- [ ] **Step 1: Create a VM/fake-DOM harness and failing initialization tests**

Create `test/planet-renderer-contract.test.cjs` with `node:test`, `assert`, `fs`, `path`, and `vm`. The harness must provide deterministic queues rather than real time:

```js
function createHarness (options = {}) {
  const state = {
    nextId: 1,
    rafs: new Map(),
    idles: new Map(),
    timers: new Map(),
    sourceCanvases: [],
    outputPutCount: 0,
    sourcePutCount: 0,
    createdImageData: 0,
    documentQueries: 0
  }
  const classes = new Set()
  const scene = {
    classList: {
      add: token => classes.add(token),
      remove: token => classes.delete(token),
      contains: token => classes.has(token)
    }
  }
  const makeContext = kind => ({
    createImageData (width, height) {
      state.createdImageData++
      return { width, height, data: new Uint8ClampedArray(width * height * 4) }
    },
    putImageData () {
      if (kind === 'source') state.sourcePutCount++
      else state.outputPutCount++
    }
  })
  const outputContext = options.outputContext === null ? null : makeContext('output')
  const canvas = {
    clientWidth: options.clientWidth || 344,
    clientHeight: options.clientHeight || 304,
    width: 0,
    height: 0,
    style: {},
    getContext: () => outputContext,
    closest: selector => selector === '#space-scene' ? scene : null
  }
  let exposeAutoCanvas = Boolean(options.autoMount)
  const document = {
    hidden: false,
    visibilityState: 'visible',
    getElementById (id) {
      state.documentQueries++
      if (!exposeAutoCanvas) return null
      return id === 'planet-surface' ? canvas : id === 'space-scene' ? scene : null
    },
    createElement (name) {
      assert.equal(name, 'canvas')
      const source = { width: 0, height: 0, getContext: () => options.sourceContext === null ? null : makeContext('source') }
      state.sourceCanvases.push(source)
      return source
    },
    addEventListener () {},
    removeEventListener () {}
  }
  const window = {
    document,
    FluidPlanetCore: options.core || require('../themes/fluid-particle/source/js/planet-core.js'),
    devicePixelRatio: options.devicePixelRatio || 1,
    innerWidth: options.innerWidth || 1440,
    requestAnimationFrame: options.noRaf ? undefined : callback => { const id = state.nextId++; state.rafs.set(id, callback); return id },
    cancelAnimationFrame: id => state.rafs.delete(id),
    requestIdleCallback: options.noIdle ? undefined : callback => { const id = state.nextId++; state.idles.set(id, callback); return id },
    cancelIdleCallback: id => state.idles.delete(id),
    setTimeout: callback => { const id = state.nextId++; state.timers.set(id, callback); return id },
    clearTimeout: id => state.timers.delete(id),
    getComputedStyle: () => ({ getPropertyValue: name => name === '--planet-equator-angle' ? '-10deg' : '' }),
    matchMedia: query => ({ media: query, matches: query.includes('max-width') ? Boolean(options.mobile) : Boolean(options.reducedMotion), addEventListener () {}, removeEventListener () {} }),
    performance: { now: () => 0 }
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../themes/fluid-particle/source/js/planet-surface.js'), 'utf8')
  vm.runInNewContext(source, { window, globalThis: window, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Float32Array, Float64Array, Math, Object, Number, Error, TypeError })
  const flush = queue => { const entries = [...queue.values()]; queue.clear(); entries.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 })); return entries.length }
  exposeAutoCanvas = true
  return { state, scene, canvas, window, renderer: window.FluidPlanetSurface, flushIdle: () => flush(state.idles), flushTimers: () => flush(state.timers) }
}
```

Add exact tests:

```js
const metricKeys = ['averageDrawMs', 'basePhase', 'canvasHeight', 'canvasWidth', 'drawCount', 'effectiveDpr', 'fallback', 'initialized', 'maxDrawMs', 'over8msPercent', 'p95DrawMs', 'pageVisible', 'qualityLevel', 'redrawFps', 'running', 'visible']

test('mount defers work, builds a detached 1024x512 texture, and reveals only a complete frame', () => {
  const harness = createHarness()
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene })
  assert.equal(lifecycle.snapshot().initialized, false)
  assert.equal(harness.scene.classList.contains('planet-ready'), false)
  assert.equal(harness.state.outputPutCount, 0)
  harness.flushIdle()
  const snapshot = lifecycle.snapshot()
  assert.equal(harness.state.sourceCanvases.length, 1)
  assert.deepEqual([harness.state.sourceCanvases[0].width, harness.state.sourceCanvases[0].height], [1024, 512])
  assert.equal(harness.state.sourcePutCount, 1)
  assert.equal(harness.state.outputPutCount, 1)
  assert.equal(harness.scene.classList.contains('planet-ready'), true)
  assert.equal(snapshot.initialized, true)
  assert.equal(snapshot.running, false)
  assert.deepEqual(Object.keys(snapshot).sort(), metricKeys)
  assert.ok(Object.isFrozen(snapshot))
  assert.equal(typeof harness.window.__planetSurfaceMetrics.snapshot, 'function')
  assert.equal(typeof harness.window.__planetSurfaceMetrics.mark, 'function')
  assert.equal(typeof harness.window.__planetSurfaceMetrics.measureSince, 'function')
  lifecycle.destroy()
})

test('mount is idempotent and destroy permits one clean remount', () => {
  const harness = createHarness()
  const first = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  const second = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  assert.equal(first, second)
  first.destroy()
  const third = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  assert.notEqual(third, first)
  third.destroy()
})

test('browser auto-mount creates the same single lifecycle returned by a later mount call', () => {
  const harness = createHarness({ autoMount: true })
  assert.equal(harness.state.idles.size, 1)
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene })
  assert.equal(harness.state.idles.size, 1)
  harness.flushIdle()
  assert.equal(lifecycle.snapshot().initialized, true)
  lifecycle.destroy()
})

test('initialization failures isolate the planet and never mutate particle state', async t => {
  for (const [name, options] of [
    ['2d context', { outputContext: null }],
    ['source context', { sourceContext: null }],
    ['animation frame', { noRaf: true }],
    ['texture generation', { core: { ...require('../themes/fluid-particle/source/js/planet-core.js'), fillTexturePixels: () => { throw new Error('texture failure') } } }],
    ['projection setup', { core: { ...require('../themes/fluid-particle/source/js/planet-core.js'), createSphereMap: () => { throw new Error('projection failure') } } }]
  ]) {
    await t.test(name, () => {
      const harness = createHarness(options)
      const particleSentinel = Object.freeze({ qualityLevel: 2 })
      harness.window.__fluidParticleMetrics = particleSentinel
      const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
      harness.flushIdle()
      assert.equal(harness.scene.classList.contains('planet-fallback'), true)
      assert.equal(harness.scene.classList.contains('particle-fallback'), false)
      assert.equal(harness.scene.classList.contains('planet-ready'), false)
      assert.equal(harness.window.__fluidParticleMetrics, particleSentinel)
      assert.equal(lifecycle.snapshot().fallback, true)
      assert.doesNotThrow(() => lifecycle.destroy())
    })
  }
})

test('a missing target Canvas returns an isolated no-op fallback without throwing', () => {
  const harness = createHarness()
  const lifecycle = harness.renderer.mount(null, { scene: harness.scene })
  assert.equal(harness.scene.classList.contains('planet-fallback'), true)
  assert.equal(harness.scene.classList.contains('particle-fallback'), false)
  assert.equal(lifecycle.snapshot().fallback, true)
  assert.doesNotThrow(() => lifecycle.destroy())
})
```

Add a timer-fallback test that creates `{ noIdle: true }`, asserts one pending timer, flushes it, and observes one complete frame. Add a descriptor test matching the particle metrics hardening: `__planetSurfaceMetrics` has a getter, no setter, `configurable: false`, and rejects `Reflect.set`; also assert the frozen metrics API exposes exactly `mark`, `measureSince`, and `snapshot`.

- [ ] **Step 2: Add failing generated-page and accessibility assertions**

Extend the Task 3 generated-home test with:

```js
assert.equal(occurrences(home, '<script src="/js/planet-core.js" defer></script>'), 1)
assert.equal(occurrences(home, '<script src="/js/planet-surface.js" defer></script>'), 1)
assert.equal(occurrences(post, 'planet-core.js'), 0)
assert.equal(occurrences(post, 'planet-surface.js'), 0)
const sceneScriptOrder = ['particle-core.js', 'particle-flow.js', 'planet-core.js', 'planet-surface.js']
  .map(name => home.indexOf(`/js/${name}`))
assert.ok(sceneScriptOrder.every(index => index >= 0))
assert.deepEqual(sceneScriptOrder, [...sceneScriptOrder].sort((left, right) => left - right))
```

In `test/theme-accessibility-contract.test.cjs`, extend the existing background-motion test with:

```js
assert.equal((output.match(/<canvas\b/g) || []).length, 2)
assert.match(output, /id="space-scene"[^>]*aria-hidden="true"[\s\S]*id="planet-surface"[^>]*aria-hidden="true"/)
```

Add `source/js/planet-surface.js` to the entry-point list in `test/theme-contract.test.cjs` now, in the same task that creates it.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
node --test test/planet-renderer-contract.test.cjs
npm run clean
npm run build
node --test test/theme-contract.test.cjs test/particle-renderer-contract.test.cjs test/theme-accessibility-contract.test.cjs
```

Expected: renderer tests fail because `planet-surface.js` is missing; generated-home tests fail because planet scripts are not loaded; all unrelated accessibility and particle tests stay green.

- [ ] **Step 4: Implement the safe UMD shell, immutable metrics, fallback, and idle initialization**

Follow the protected particle renderer's module pattern but keep state isolated:

```js
(function (root, factory) {
  const api = factory(root)
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.FluidPlanetSurface = api
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict'

  let mountedLifecycle = null
  let activeSnapshot = emptySnapshot
  let activeMark = function () { return 0 }
  let activeMeasure = emptyMeasurement
  const metricsApi = Object.freeze({
    snapshot: function () { return activeSnapshot() },
    mark: function () { return activeMark() },
    measureSince: function (marker) { return activeMeasure(marker) }
  })

  function emptySnapshot () {
    return Object.freeze({
      averageDrawMs: 0, p95DrawMs: 0, maxDrawMs: 0, over8msPercent: 0,
      redrawFps: 0, qualityLevel: 2, canvasWidth: 0, canvasHeight: 0,
      effectiveDpr: 1, initialized: false, running: false, fallback: false,
      visible: true, pageVisible: true, basePhase: 0, drawCount: 0
    })
  }

  function emptyMeasurement () {
    return Object.freeze({ complete: false, drawCount: 0, averageDrawMs: 0, p95DrawMs: 0, maxDrawMs: 0, over8msPercent: 0 })
  }

  if (root && !Object.prototype.hasOwnProperty.call(root, '__planetSurfaceMetrics')) {
    Object.defineProperty(root, '__planetSurfaceMetrics', {
      configurable: false,
      enumerable: false,
      get: function () { return metricsApi }
    })
  }

  function validCore (core) {
    return core && typeof core.fillTexturePixels === 'function' &&
      typeof core.createSphereMap === 'function' &&
      typeof core.renderProjectedFrame === 'function' &&
      typeof core.computeBackingSize === 'function' &&
      typeof core.createQualityState === 'function'
  }
```

`mount` resolves `scene` from `config.scene || canvas.closest('#space-scene')`; do not use `canvas.parentElement` because the Canvas parent is `.saturn`. Validate Canvas, scene, core, 2D context, `requestAnimationFrame`, and `cancelAnimationFrame` inside `try/catch`. On any failure, remove `.planet-ready`, add `.planet-fallback`, set `canvas.style.display = 'none'`, and return a no-op lifecycle whose frozen snapshot reports only `fallback: true` changes. At the start of a valid mount and again before adding `.planet-ready`, set `canvas.style.display = ''` so a destroyed failed lifecycle cannot poison a later remount. Never query or assign the motion button.

During idle initialization:

```js
const sourceCanvas = document.createElement('canvas')
sourceCanvas.width = config.textureWidth || core.TEXTURE_WIDTH
sourceCanvas.height = config.textureHeight || core.TEXTURE_HEIGHT
const sourceContext = sourceCanvas.getContext('2d', { alpha: false })
if (!sourceContext) throw new Error('planet source context unavailable')
const sourceImage = sourceContext.createImageData(sourceCanvas.width, sourceCanvas.height)
core.fillTexturePixels(sourceImage.data, sourceCanvas.width, sourceCanvas.height, Number.isInteger(config.seed) ? config.seed : 0x706C616E)
sourceContext.putImageData(sourceImage, 0, 0)

const mobile = root.matchMedia('(max-width: 760px)').matches
const backing = core.computeBackingSize({
  cssWidth: canvas.clientWidth,
  aspectRatio: 43 / 38,
  devicePixelRatio: root.devicePixelRatio,
  mobile,
  level: qualityState.level
})
canvas.width = backing.width
canvas.height = backing.height
const angleValue = root.getComputedStyle(canvas).getPropertyValue('--planet-equator-angle').trim()
const equatorRadians = Number.parseFloat(angleValue) * Math.PI / 180
projection = core.createSphereMap({ width: canvas.width, height: canvas.height, sourceWidth: sourceCanvas.width, sourceHeight: sourceCanvas.height, equatorRadians })
outputImage = context.createImageData(canvas.width, canvas.height)
core.renderProjectedFrame(sourceImage.data, sourceCanvas.width, projection, basePhase, outputImage.data)
context.putImageData(outputImage, 0, 0)
initialized = true
drawCount = 1
scene.classList.remove('planet-fallback')
scene.classList.add('planet-ready')
```

Use `requestIdleCallback(initialize, { timeout: 300 })` with `setTimeout(initialize, 32)` fallback. Do not expose a partially filled source or output image. The Task 4 lifecycle remains static after this draw; Task 5 owns animation.

- [ ] **Step 5: Load both planet scripts only on home, in deterministic defer order**

Change the home-only block in `head.ejs` to:

```ejs
<% if (page.path === 'index.html' || page.path === '/') { %>
  <%- css('css/space-scene.css') %>
  <script src="<%= url_for('/js/particle-core.js') %>" defer></script>
  <script src="<%= url_for('/js/particle-flow.js') %>" defer></script>
  <script src="<%= url_for('/js/planet-core.js') %>" defer></script>
  <script src="<%= url_for('/js/planet-surface.js') %>" defer></script>
<% } %>
```

At the renderer bottom, export frozen `{ mount }` and auto-mount only when `document.getElementById('planet-surface')` returns a Canvas. Inner pages never load the file, so they cannot create observers or globals from this module.

- [ ] **Step 6: Run the new renderer, generated-page, and full test suites**

Run:

```powershell
node --check themes/fluid-particle/source/js/planet-surface.js
node --test test/planet-renderer-contract.test.cjs
npm run test:fresh
Test-Path public/js/planet-core.js
Test-Path public/js/planet-surface.js
```

Expected: all tests pass; both `Test-Path` calls are `True`; generated home has four defer scene scripts and two Canvas elements; inner pages have none; the Canvas reveals only after one complete frame.

- [ ] **Step 7: Commit the first-frame renderer slice**

Run:

```powershell
git add -- themes/fluid-particle/source/js/planet-surface.js themes/fluid-particle/layout/_partial/head.ejs test/planet-renderer-contract.test.cjs test/theme-contract.test.cjs test/particle-renderer-contract.test.cjs test/theme-accessibility-contract.test.cjs
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: render deterministic planet surface canvas"
```

---

### Task 5: Add continuous rotation, stacked blockers, resize coalescing, and adaptive cadence

**Files:**
- Modify: `themes/fluid-particle/source/js/planet-surface.js`
- Modify: `test/planet-renderer-contract.test.cjs`

**Interfaces:**
- Preserves Task 4's public `mount → { destroy, snapshot }` interface and metrics keys.
- Owns one `MutationObserver`, one `IntersectionObserver`, one `ResizeObserver` when available, one reduced-motion media-query listener, one mobile-policy media-query listener, and one document visibility listener.
- Never owns a motion-button listener and never mutates `.motion-paused`, `.particle-fallback`, or particle metrics.
- Maintains scalar blocker flags `manualPaused`, `particleFailed`, `reducedMotion`, `pageHidden`, and `offscreen`; animation is their exact conjunction with initialized/not-destroyed.
- Retains the latest `1024` successful draw costs in a preallocated circular `Float64Array`; `mark()` and `measureSince()` provide exact read-only evidence for one caller-selected foreground interval without resetting quality state or allocating in the draw loop.

- [ ] **Step 1: Extend the fake harness with deterministic observers, events, time, and redraw helpers**

Add reusable fakes to `test/planet-renderer-contract.test.cjs`:

```js
class FakeEventTarget {
  constructor () { this.listeners = new Map() }
  addEventListener (type, handler) {
    const handlers = this.listeners.get(type) || []
    handlers.push(handler)
    this.listeners.set(type, handlers)
  }
  removeEventListener (type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(candidate => candidate !== handler))
  }
  dispatch (type, event = {}) {
    for (const handler of [...(this.listeners.get(type) || [])]) handler({ type, ...event })
  }
  listenerCount (type) { return (this.listeners.get(type) || []).length }
}

class FakeObserver {
  constructor (callback, registry) { this.callback = callback; this.disconnected = false; registry.push(this) }
  observe (target) { this.target = target }
  disconnect () { this.disconnected = true }
  trigger (entries) { if (!this.disconnected) this.callback(entries, this) }
}

class FakeMediaQuery extends FakeEventTarget {
  constructor (media, matches) { super(); this.media = media; this.matches = matches }
  setMatches (matches) {
    if (Boolean(matches) === this.matches) return
    this.matches = Boolean(matches)
    this.dispatch('change', { matches: this.matches, media: this.media })
  }
  addListener (handler) { this.addEventListener('change', handler) }
  removeListener (handler) { this.removeEventListener('change', handler) }
}
```

Make both `window` and `document` inherit `FakeEventTarget`; make `scene` expose `classList`; register observer instances in `state.mutationObservers`, `state.intersectionObservers`, and `state.resizeObservers`. Expose each observer constructor unless `noMutationObserver`, `noIntersectionObserver`, or `noResizeObserver` is set. Add `mobileQuery` for the exact string `(max-width: 760px)` and `motionQuery` for the exact string `(prefers-reduced-motion: reduce)`. Add these harness helpers:

```js
const flushRaf = timestamp => {
  state.clock = timestamp
  const callbacks = [...state.rafs.values()]
  state.rafs.clear()
  callbacks.forEach(callback => callback(timestamp))
  return callbacks.length
}
const mutateScene = token => {
  if (scene.classList.contains(token)) scene.classList.remove(token)
  else scene.classList.add(token)
  state.mutationObservers.forEach(observer => observer.trigger([{ type: 'attributes', attributeName: 'class', target: scene }]))
}
const setIntersection = isIntersecting => state.intersectionObservers.forEach(observer => observer.trigger([{ target: canvas, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }]))
const triggerResize = () => state.resizeObservers.forEach(observer => observer.trigger([{ target: canvas, contentRect: { width: canvas.clientWidth, height: canvas.clientHeight } }]))
const queueDrawCost = cost => state.nowValues.push(state.clock, state.clock + cost)
const pendingRafs = () => state.rafs.size
```

Return `flushRaf`, `mutateScene`, `setIntersection`, `triggerResize`, `queueDrawCost`, and `pendingRafs` from the harness. `performance.now()` shifts `state.nowValues` when present and otherwise returns `state.clock`. This makes renderer draw costs exact without real sleeps.

- [ ] **Step 2: Add failing stacked-blocker and no-catch-up tests**

Add:

```js
test('all blockers compose and clearing only one never resumes the renderer', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  assert.equal(harness.pendingRafs(), 1)
  harness.mutateScene('motion-paused')
  harness.setIntersection(false)
  assert.equal(harness.pendingRafs(), 0)
  harness.mutateScene('motion-paused')
  assert.equal(harness.pendingRafs(), 0)
  harness.setIntersection(true)
  assert.equal(harness.pendingRafs(), 1)
  harness.mutateScene('particle-fallback')
  assert.equal(harness.pendingRafs(), 0)
  assert.equal(harness.scene.classList.contains('planet-fallback'), false)
  harness.mutateScene('particle-fallback')
  assert.equal(harness.pendingRafs(), 1)
  lifecycle.destroy()
})

test('resume establishes a timestamp before advancing the preserved unwrapped phase', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.flushRaf(1000)
  harness.flushRaf(1040)
  const beforePause = lifecycle.snapshot().basePhase
  harness.mutateScene('motion-paused')
  harness.mutateScene('motion-paused')
  harness.flushRaf(500000)
  assert.equal(lifecycle.snapshot().basePhase, beforePause)
  harness.flushRaf(500040)
  const expected = beforePause + 40 / 70000 * Math.PI * 2
  assert.ok(Math.abs(lifecycle.snapshot().basePhase - expected) < 1e-9)
  lifecycle.destroy()
})
```

Add equivalent focused tests for `document.hidden`, live reduced-motion, and offscreen state. The reduced-motion change to `true` must increase `outputPutCount` by exactly one deliberate static redraw and leave no RAF. Changing it back schedules only when all other blockers are clear.

- [ ] **Step 3: Add failing resize, breakpoint, adaptive-level, hot-loop, and cleanup tests**

Cover these exact contracts:

```js
test('760 is mobile, 768 is desktop, and rounded-equal resizes do not rebuild projection', () => {
  const harness = createHarness({ mobile: true, innerWidth: 760, clientWidth: 300, textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  assert.equal(lifecycle.snapshot().effectiveDpr <= 1.25, true)
  const imageCount = harness.state.createdImageData
  harness.canvas.clientWidth = 301
  harness.triggerResize()
  harness.flushRaf(10)
  assert.equal(harness.state.createdImageData, imageCount)
  harness.canvas.clientWidth = 340
  harness.triggerResize()
  harness.flushRaf(20)
  assert.ok(harness.state.createdImageData > imageCount)
  harness.mobileQuery.setMatches(false)
  harness.flushRaf(30)
  assert.equal(lifecycle.snapshot().effectiveDpr <= 1.5, true)
  assert.equal(lifecycle.snapshot().qualityLevel, 2)
  lifecycle.destroy()
})

test('renderer ignores warmup then maps quality ordinal without touching particle metrics', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const sentinel = Object.freeze({ snapshot: () => Object.freeze({ qualityLevel: 2 }) })
  Object.defineProperty(harness.window, '__fluidParticleMetrics', { value: sentinel, writable: false })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.runCompletedDraws(119, 5)
  assert.equal(lifecycle.snapshot().qualityLevel, 2)
  harness.runCompletedDraws(120, 5)
  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  assert.equal(harness.window.__fluidParticleMetrics, sentinel)
  const drawCountBeforeCadenceProbe = lifecycle.snapshot().drawCount
  const cadenceStart = harness.state.clock
  harness.flushRaf(cadenceStart + 40)
  assert.equal(lifecycle.snapshot().drawCount, drawCountBeforeCadenceProbe)
  harness.flushRaf(cadenceStart + 42)
  assert.equal(lifecycle.snapshot().drawCount, drawCountBeforeCadenceProbe + 1)
  harness.mobileQuery.setMatches(true)
  harness.flushRaf(harness.state.clock + 50)
  assert.equal(lifecycle.snapshot().qualityLevel, 1)
  assert.ok(lifecycle.snapshot().canvasWidth <= 288)
  lifecycle.destroy()
})

test('read-only measurement markers summarize exactly the selected successful draws', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  const metrics = harness.window.__planetSurfaceMetrics
  const marker = metrics.mark()
  harness.runCompletedDraws(20, index => index === 7 ? 9 : 2)
  const sample = metrics.measureSince(marker)
  assert.equal(sample.complete, true)
  assert.equal(sample.drawCount, 20)
  assert.equal(sample.averageDrawMs, 2.35)
  assert.equal(sample.p95DrawMs, 2)
  assert.equal(sample.maxDrawMs, 9)
  assert.equal(sample.over8msPercent, 5)
  assert.ok(Object.isFrozen(sample))
  assert.equal(lifecycle.snapshot().drawCount >= 21, true)
  lifecycle.destroy()
})

test('destroy cancels every callback, listener, and owned observer', () => {
  const harness = createHarness({ textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  lifecycle.destroy()
  assert.equal(harness.pendingRafs(), 0)
  assert.equal(harness.document.listenerCount('visibilitychange'), 0)
  assert.equal(harness.motionQuery.listenerCount('change'), 0)
  assert.equal(harness.mobileQuery.listenerCount('change'), 0)
  assert.ok(harness.state.mutationObservers.every(observer => observer.disconnected))
  assert.ok(harness.state.intersectionObservers.every(observer => observer.disconnected))
  assert.ok(harness.state.resizeObservers.every(observer => observer.disconnected))
})

test('an animation-time render failure freezes only the planet and is never uncaught', () => {
  const realCore = require('../themes/fluid-particle/source/js/planet-core.js')
  let renderCalls = 0
  const core = {
    ...realCore,
    renderProjectedFrame (...args) {
      renderCalls++
      if (renderCalls > 1) throw new Error('animation render failure')
      return realCore.renderProjectedFrame(...args)
    }
  }
  const harness = createHarness({ core, textureWidth: 64, textureHeight: 32 })
  const lifecycle = harness.renderer.mount(harness.canvas, { scene: harness.scene, textureWidth: 64, textureHeight: 32 })
  harness.flushIdle()
  harness.flushRaf(1000)
  assert.doesNotThrow(() => harness.flushRaf(1050))
  assert.equal(lifecycle.snapshot().fallback, true)
  assert.equal(harness.scene.classList.contains('planet-fallback'), true)
  assert.equal(harness.scene.classList.contains('particle-fallback'), false)
  assert.equal(harness.pendingRafs(), 0)
  lifecycle.destroy()
})

test('missing required mutation observation falls back while optional observer gaps remain safe', () => {
  const required = createHarness({ noMutationObserver: true })
  const failed = required.renderer.mount(required.canvas, { scene: required.scene, textureWidth: 64, textureHeight: 32 })
  required.flushIdle()
  assert.equal(failed.snapshot().fallback, true)
  assert.equal(required.scene.classList.contains('particle-fallback'), false)
  failed.destroy()

  const optional = createHarness({ noIntersectionObserver: true, noResizeObserver: true })
  const live = optional.renderer.mount(optional.canvas, { scene: optional.scene, textureWidth: 64, textureHeight: 32 })
  optional.flushIdle()
  assert.equal(live.snapshot().fallback, false)
  optional.window.dispatch('resize')
  optional.flushRaf(50)
  assert.equal(live.snapshot().visible, true)
  live.destroy()
})
```

`runCompletedDraws(count, drawCost)` advances fake RAF timestamps by `50ms`, queues one start/end `performance.now()` pair for each expected redraw, and loops until `snapshot().drawCount` has increased by `count`; `drawCost` accepts either a number or an index callback so the measurement test can supply exact values. Fail after `count * 4 + 10` callbacks to catch a stalled scheduler.

Add a static source check around `function renderFrame` and the draw helper that rejects `new`, `createElement`, `createImageData`, `getContext`, `getComputedStyle`, `querySelector`, `setTimeout`, array literals, and object literals. Creation in `initialize`, `rebuildProjection`, and `snapshot` remains permitted.

- [ ] **Step 4: Run the new tests and verify RED**

Run: `node --test test/planet-renderer-contract.test.cjs`

Expected: Task 4 initialization tests remain green; new tests fail because the static renderer owns no observers, RAF loop, blocker conjunction, resizing, cadence, or quality integration.

- [ ] **Step 5: Implement blocker ownership and observer fallbacks**

Create scalar state and one conjunction:

```js
let initialized = false
let destroyed = false
let manualPaused = scene.classList.contains('motion-paused')
let particleFailed = scene.classList.contains('particle-fallback')
let reducedMotion = Boolean(motionQuery && motionQuery.matches)
let pageHidden = Boolean(document.hidden)
let offscreen = false
let animationFrameId = 0
let resizeFrameId = 0
let lastTimestamp = 0
let elapsedSinceDraw = 0
let basePhase = 0
let activeFps = 0

function canAnimate () {
  return initialized && !destroyed && !manualPaused && !particleFailed &&
    !reducedMotion && !pageHidden && !offscreen
}

function cancelAnimation () {
  if (animationFrameId) root.cancelAnimationFrame(animationFrameId)
  animationFrameId = 0
  lastTimestamp = 0
  elapsedSinceDraw = 0
}

function syncAnimation () {
  if (!canAnimate()) {
    cancelAnimation()
    return
  }
  if (!animationFrameId) animationFrameId = root.requestAnimationFrame(renderFrame)
}
```

The class `MutationObserver` reads only `scene.classList.contains('motion-paused')` and `scene.classList.contains('particle-fallback')` after a class mutation, then calls `syncAnimation`. It never changes either class. `IntersectionObserver` updates `offscreen`. `visibilitychange` updates `pageHidden`. Reduced-motion listeners support both `addEventListener('change', ...)` and legacy `addListener`; entering reduced mode cancels, renders one frame at the preserved phase, and never advances it.

Extend Task 4's `validCore` check in the same RED/GREEN slice to require `advanceBasePhase`, `recordDrawCost`, and `resetQualitySamples` before continuous scheduling is enabled. A missing lifecycle dependency follows the same isolated planet fallback as a missing projection dependency.

Use `ResizeObserver` when available. Its callback calls `queueResize`; the fallback is one root `resize` listener. Use an `IntersectionObserver` when available; without it, keep `offscreen = false`. `MutationObserver` is required for shared-control correctness; if unavailable, activate the isolated planet fallback rather than adding a second button listener or polling DOM in the hot loop.

- [ ] **Step 6: Implement time-based adaptive redraw without allocations**

The RAF callback uses scalar elapsed time, never clamps foreground elapsed time, and advances only when a redraw is due:

```js
function renderFrame (timestamp) {
  animationFrameId = 0
  if (!canAnimate()) return
  if (!lastTimestamp) {
    lastTimestamp = timestamp
    syncAnimation()
    return
  }
  const elapsed = Math.max(0, timestamp - lastTimestamp)
  lastTimestamp = timestamp
  elapsedSinceDraw += elapsed
  const frameInterval = 1000 / activeFps
  if (elapsedSinceDraw >= frameInterval) {
    const phaseElapsed = elapsedSinceDraw
    elapsedSinceDraw = 0
    basePhase = core.advanceBasePhase(basePhase, phaseElapsed)
    drawCurrentFrame(true)
  }
  syncAnimation()
}
```

`drawCurrentFrame(measure)` records `start = performance.now()`, calls `renderProjectedFrame` and `putImageData`, then records only `performance.now() - start`. Pass that draw cost to the preallocated quality state and write it at `drawSerial % 1024` in the preallocated performance-history array before incrementing `drawSerial`. Refactor Task 4's direct initialization draw to call `drawCurrentFrame(true)` so the complete first frame is `drawCount === 1` and sample one of the warmup window. Maintain redraw intervals in a preallocated `Float64Array(120)` so `redrawFps` is observed, not merely the target. If `recordDrawCost` changes the ordinal, queue one projection rebuild using the same source texture and base phase.

`mark()` returns the current `drawSerial`. `measureSince(marker)` accepts only an integer marker from `0` through the current serial, returns `complete: false` when the marker is invalid or more than `1024` successful draws have elapsed, and otherwise copies only the selected circular-history values into one preallocated scratch `Float64Array(1024)` outside the draw loop, sorts the selected subarray, and returns a frozen `{ complete, drawCount, averageDrawMs, p95DrawMs, maxDrawMs, over8msPercent }`. Bind the global metrics delegates to the active lifecycle; keep its `fallback: true` snapshot observable after a failure, and restore the empty delegates only on destroy before a later remount. Lifecycle `snapshot()` remains the only mount return metric method.

`rebuildProjection` calculates the active policy from the exact mobile media query. Assign `activeFps = backing.fps` immediately after `computeBackingSize` and before the rounded-dimension equality check, so a quality or breakpoint change updates cadence even when CSS width keeps the backing dimensions unchanged. During initial setup, assign the first `backing.fps` through this same path before scheduling animation. If rounded width and height are unchanged, return only after updating `activeFps`, without assigning `canvas.width`/`height`, creating `ImageData`, or rebuilding arrays. On a real change, remove `.planet-ready`, assign dimensions, create a new projection and output image, draw one complete current-phase frame, then restore `.planet-ready`. Call `core.resetQualitySamples(qualityState)` after a real size change, preserving `qualityState.level` and `warmupComplete` while clearing partial samples and consecutive restore-window credit. `activeFps` is the current target cadence; the public `redrawFps` remains the independently observed value from completed redraw intervals.

Wrap initialization, projection rebuild, and each measured redraw in `try/catch`; any exception calls the same isolated fallback path once and cancels every owned callback/observer.

- [ ] **Step 7: Implement complete cleanup and frozen live metrics**

`destroy` must cancel idle/timer/animation/resize IDs, disconnect all owned observers, remove visibility and media-query listeners in the same API mode used to add them, remove a fallback root resize listener, clear `.planet-ready`, and release the module singleton. A destroyed lifecycle's `snapshot` remains stable and cannot mutate a later remount.

Build each snapshot from scalar metrics outside the hot drawing loop and freeze it. `running` is `canAnimate() && Boolean(animationFrameId)`, `visible` is `!offscreen`, `pageVisible` is `!pageHidden`, and `fallback` is the module's own failure flag. Never read `__fluidParticleMetrics` inside production code.

- [ ] **Step 8: Run lifecycle tests, full tests, and protected-hash checks**

Run:

```powershell
node --test test/planet-renderer-contract.test.cjs
npm run test:fresh
node --check themes/fluid-particle/source/js/planet-surface.js
git diff --exit-code 4093a71 -- themes/fluid-particle/source/js/particle-core.js themes/fluid-particle/source/js/particle-flow.js
```

Expected: all lifecycle/quality/isolation tests pass; full suite passes; protected particle diff command is silent and exits `0`.

- [ ] **Step 9: Commit the lifecycle and performance slice**

Run:

```powershell
git add -- themes/fluid-particle/source/js/planet-surface.js test/planet-renderer-contract.test.cjs
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "feat: animate planet with adaptive isolated lifecycle"
```

---

### Task 6: Prove live Canvas behavior and responsive composition in Chrome

**Files:**
- Modify: `test/theme-browser-behavior.test.cjs`
- Modify only if a browser regression demands it: `themes/fluid-particle/source/js/planet-surface.js`
- Modify only if geometry fails its approved range: `themes/fluid-particle/source/css/space-scene.css`

**Interfaces:**
- Consumes built home assets and `window.__planetSurfaceMetrics.snapshot()` from Task 5.
- Produces mutation-sensitive Chrome contracts for initialization, pause/fallback isolation, reduced motion, four viewport layouts, ring ratios, and no overflow/copy collision.
- Does not use headless virtual time as final performance evidence; Task 7 performs the real visible 20-second sample.

- [ ] **Step 1: Make Chrome probe virtual time explicit and load the real planet modules**

Change the helper signature and argument:

```js
function dumpWithChrome (fixturePath, { reducedMotion = false, viewport, virtualTimeBudget = 1000 } = {}) {
  // keep the existing executable discovery, temp profile, file access, timeout, and cleanup
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--allow-file-access-from-files',
    `--user-data-dir=${userDataDir}`,
    `--virtual-time-budget=${virtualTimeBudget}`,
    '--dump-dom'
  ]
  // keep the existing reduced-motion, viewport, URL, spawn, and status checks
}
```

Add the two real scripts to the hand-built home fixture after the markup and before its probe script:

```html
<script src="js/planet-core.js"></script>
<script src="js/planet-surface.js"></script>
```

Do not load or mock the particle renderer in this fixture. The fixture mutates `.motion-paused` and `.particle-fallback` directly so the planet's observer isolation is tested without a second owner of those states.

- [ ] **Step 2: Add asynchronous pause, fallback, resume, and reduced-motion browser assertions**

After `load`, wait until `window.__planetSurfaceMetrics.snapshot().initialized` or `1500ms`, then capture state transitions across microtasks:

```js
const waitForPlanet = function (deadline, done) {
  const snapshot = window.__planetSurfaceMetrics?.snapshot()
  if (snapshot?.initialized || performance.now() >= deadline) return done(snapshot)
  setTimeout(function () { waitForPlanet(deadline, done) }, 25)
}

waitForPlanet(performance.now() + 1500, function (initial) {
  scene.classList.add('motion-paused')
  setTimeout(function () {
    const paused = window.__planetSurfaceMetrics.snapshot()
    scene.classList.add('particle-fallback')
    scene.classList.remove('motion-paused')
    setTimeout(function () {
      const particleFallback = window.__planetSurfaceMetrics.snapshot()
      scene.classList.remove('particle-fallback')
      setTimeout(function () {
        const resumed = window.__planetSurfaceMetrics.snapshot()
        document.getElementById('probe-result').textContent = JSON.stringify({
          initial, paused, particleFallback, resumed,
          ownFallback: scene.classList.contains('planet-fallback'),
          particleFallbackControlDisplay: getComputedStyle(control).display,
          sceneAnimations: scene.getAnimations({ subtree: true })
            .filter(function (animation) { return animation.constructor.name === 'CSSAnimation' }).length,
          planetPresentation: {
            surfaceOpacity: getComputedStyle(document.getElementById('planet-surface')).opacity,
            equatorAngles: {
              ring: getComputedStyle(document.querySelector('.saturn-ring')).getPropertyValue('--saturn-equator-angle').trim(),
              surface: getComputedStyle(document.getElementById('planet-surface')).getPropertyValue('--planet-equator-angle').trim()
            }
          }
        })
      }, 250)
    }, 50)
  }, 50)
})
```

Replace the obsolete CSS-animation tests with:

```js
test('planet Canvas initializes, obeys shared pause states, and resumes without owning particle fallback', () => {
  const probe = normalChromeProbe()
  assert.equal(probe.initial.initialized, true)
  assert.equal(probe.initial.running, true)
  assert.equal(probe.paused.running, false)
  assert.equal(probe.particleFallback.running, false)
  assert.equal(probe.resumed.running, true)
  assert.equal(probe.ownFallback, false)
  assert.equal(probe.particleFallbackControlDisplay, 'none')
  assert.equal(probe.sceneAnimations, 0)
})

test('reduced-motion keeps one complete deterministic frame and no continuous scene motion', () => {
  const probe = runChromeProbe({ reducedMotion: true })
  assert.equal(probe.initial.initialized, true)
  assert.equal(probe.initial.running, false)
  assert.ok(probe.initial.drawCount >= 1)
  assert.equal(probe.sceneAnimations, 0)
  assert.equal(probe.control.display, 'none')
})
```

In the general Chrome presentation test, change only the Task 3 pre-render opacity assertion to `assert.equal(probe.planetPresentation.surfaceOpacity, '1')`; retain the empty animation and `-10deg` angle assertions plus every unrelated accessibility/card/safe-area assertion.

The reduced-motion probe must not perform the normal pause/resume sequence; return its initial snapshot directly so its `running` state cannot be changed by the test fixture.

- [ ] **Step 3: Extend the real generated-home composition payload**

Use `dumpWithChrome(..., { viewport, virtualTimeBudget: 3000 })` for `runPlanetCompositionProbe`. In the delayed result payload include:

```js
const body = document.querySelector('.saturn')
const rings = Array.from(document.querySelectorAll('.saturn-ring'))
const ring = rings[0]
const system = document.querySelector('.saturn-system')
const copy = document.querySelector('.home-hero__copy')
const innerStop = Number.parseFloat(getComputedStyle(ring).getPropertyValue('--ring-inner-stop')) / 100
const ringWidthRatio = ring.offsetWidth / body.offsetWidth
const ringHeightRatio = ring.offsetHeight / body.offsetWidth
const beltThicknessRatio = ringWidthRatio * (1 - innerStop) / 2
const metrics = window.__planetSurfaceMetrics.snapshot()

// Add to the probe result:
canvasIds: Array.from(document.querySelectorAll('#space-scene canvas')).map(canvas => canvas.id).sort(),
planetInitialized: metrics.initialized,
planetFallback: metrics.fallback,
planetCanvas: { width: metrics.canvasWidth, height: metrics.canvasHeight, effectiveDpr: metrics.effectiveDpr },
ringWidthRatio,
ringHeightRatio,
beltThicknessRatio,
mobilePolicy: matchMedia('(max-width: 760px)').matches,
layoutMode: getComputedStyle(system).getPropertyValue('--planet-layout-mode').trim(),
copyIntersectsPlanetOrRing: rectanglesIntersect(copy.getBoundingClientRect(), body.getBoundingClientRect()) ||
  rings.some(candidate => rectanglesIntersect(copy.getBoundingClientRect(), visibleBounds(candidate))),
surfaceReady: document.getElementById('space-scene').classList.contains('planet-ready')
```

Extend the Task 3 four-viewport test with:

```js
assert.equal(probe.planetInitialized, true)
assert.equal(probe.planetFallback, false)
assert.equal(probe.surfaceReady, true)
assert.ok(probe.beltThicknessRatio >= 0.07 && probe.beltThicknessRatio <= 0.10, probe.beltThicknessRatio)
assert.equal(probe.planetCanvas.width % 8, 0)
assert.equal(probe.planetCanvas.height % 8, 0)
assert.ok(probe.planetCanvas.width <= (viewport.width <= 760 ? 320 : 512))
assert.ok(probe.planetCanvas.effectiveDpr <= (viewport.width <= 760 ? 1.25 : 1.5))
```

- [ ] **Step 4: Make the browser contracts mutation-sensitive**

Replace the old prominence mutation in `FLUID_STYLE_PROBE_MUTATION` with:

```css
.saturn-ring { width: 80% !important; height: 12% !important; }
#planet-surface { animation: forbidden-planet-pulse 0.2s linear infinite !important; }
@keyframes forbidden-planet-pulse { from { opacity: 0.2; } to { opacity: 1; } }
@media (max-width: 760px) { .saturn-system { --planet-layout-mode: desktop !important; } }
```

Run the mutation gate:

```powershell
npm run clean
npm run build
$env:FLUID_STYLE_PROBE_MUTATION = '1'
node --test test/theme-browser-behavior.test.cjs
$mutationExit = $LASTEXITCODE
Remove-Item Env:FLUID_STYLE_PROBE_MUTATION
if ($mutationExit -eq 0) { throw 'Planet browser mutation was not detected' }
node --test test/theme-browser-behavior.test.cjs
```

Expected: the mutated run fails on ring ratio, forbidden animation, or mobile layout; the unmutated run passes.

- [ ] **Step 5: Run the complete fresh suite and repair only observed browser failures**

Run:

```powershell
npm run test:fresh
git diff --check
```

If an assertion fails, first add or tighten its regression assertion in the same test, then make the smallest production correction. Do not relax any approved numeric range and do not touch protected particle JS.

Expected: full clean build and all Node/Chrome tests pass; no whitespace errors.

- [ ] **Step 6: Commit the live browser contract**

Run:

```powershell
git add -- test/theme-browser-behavior.test.cjs themes/fluid-particle/source/js/planet-surface.js themes/fluid-particle/source/css/space-scene.css
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "test: verify live planet motion and responsive geometry"
```

Stage the two production files only if Step 5 actually required changes; otherwise the commit contains only the browser test.

---

### Task 7: Tune the approved art direction and capture real foreground performance evidence

**Files:**
- Modify only when visual evidence requires it: `themes/fluid-particle/source/js/planet-core.js`
- Modify only when lifecycle/performance evidence requires it: `themes/fluid-particle/source/js/planet-surface.js`
- Modify only when visual evidence requires it: `themes/fluid-particle/source/css/space-scene.css`
- Modify the matching test before any behavioral fix: `test/planet-core.test.cjs`, `test/stellar-scene-contract.test.cjs`, or `test/planet-renderer-contract.test.cjs`
- Create outside Git: `C:/Users/Lenovo/AppData/Local/Temp/realistic-ringed-planet-2026-08-31/planet-*.png`

**Interfaces:**
- Consumes the two user references only as visual guidance; never imports their pixels, watermark, ID, or URL.
- Produces four inspected acceptance screenshots and one visible 20-second DPR-1 performance result.
- Keeps the selected option C: cool blue-violet night side, warm sand/terracotta mineral bands, one restrained vortex, no prominence/flame/corona, and a dark dust ring with one cyan edge.

- [ ] **Step 1: Start the built site and prepare a reproducible screenshot directory**

Run a fresh build, then start the server in a dedicated terminal/session:

```powershell
npm run clean
npm run build
npm run server -- --port 4000
```

In another terminal:

```powershell
$shotDir = 'C:/Users/Lenovo/AppData/Local/Temp/realistic-ringed-planet-2026-08-31'
New-Item -ItemType Directory -Force -Path $shotDir | Out-Null
Get-ChildItem -LiteralPath $shotDir -File -ErrorAction SilentlyContinue | Select-Object FullName,Length
```

Do not delete existing files in that directory. Use new filenames `planet-1920x1080.png`, `planet-1440x900.png`, `planet-768x1024.png`, and `planet-320x740.png`, adding `-2`, `-3`, and so on when iterating instead of overwriting evidence.

- [ ] **Step 2: Invoke the browser and frontend-design skills for the visual pass**

Read and use `browser:control-in-app-browser` to drive `http://127.0.0.1:4000/`, and use `frontend-design` to critique composition, material character, contrast, and intentionality. Configure exact CSS viewport sizes in this order: `1920×1080`, `1440×900`, `768×1024`, `320×740`.

At each viewport, wait until this evaluates true:

```js
Boolean(window.__planetSurfaceMetrics?.snapshot().initialized &&
  window.__planetSurfaceMetrics.snapshot().canvasWidth > 0 &&
  document.getElementById('space-scene')?.classList.contains('planet-ready'))
```

After readiness, wait at least `250ms` so the one-time Canvas opacity transition has settled. Click the existing “暂停背景动态” button once before each formal screenshot, then wait until `window.__planetSurfaceMetrics.snapshot().running === false`. Capture the full viewport to the corresponding absolute PNG path, resume, and wait until `running === true` before changing viewport.

- [ ] **Step 3: Inspect every screenshot against the approved visual checklist**

Use `view_image` on all four PNG files and require every item below:

```text
PASS: body reads as an oblate volumetric planet, not a neon disc
PASS: broad warm sand/terracotta bands remain visible inside a cool blue-violet night side
PASS: fine dark seams and localized breaks prevent smooth synthetic stripes
PASS: exactly one restrained non-logo vortex remains subordinate to the planet
PASS: light direction stays upper-left while lower-right reads as a deep night side
PASS: cyan atmosphere appears only as a thin lit-side cue, never a full neon outline
PASS: ring is wide, dark, dust-density-varied, static, and correctly passes behind/in front
PASS: only one restrained cyan ring edge is visible; no white or violet luminous rim
PASS: no prominence, flame tongue, flare, corona, watercolor splash, watermark, or reference-image artifact
PASS: hero copy and controls remain unobstructed with no horizontal scrolling
PASS: 768×1024 uses the right-side desktop composition; 320×740 uses lower-right mobile composition
```

If a visual item fails, record the viewport and visible symptom before editing. Change only palette blend weights/periodic-field amplitudes in `planet-core.js` or gradient/geometry values in `space-scene.css`; do not change architecture, numeric ring ranges, particle files, copy, or controls. Rebuild, capture a new numbered screenshot, and re-run the focused automated test covering the changed file.

- [ ] **Step 4: Observe live direction and continuity before measuring**

Resume motion at `1920×1080`. Watch the planet and particle field in the foreground for at least `20 seconds` and verify:

```text
planet bands move west-to-east in one direction with no alternating motion
ring, lighting, atmosphere, body position, and hero copy remain fixed
latitude shear is subtle; no layer reads as an independent flare
redraw cadence appears smooth for a 70-second rotation and never produces a visible hitch
existing background particles retain their original flow, pointer response, density, and quality
pause/resume preserves phase and creates no catch-up jump
```

The core unit test, not visual timing alone, remains the evidence for the exact `2π` boundary and differential formula.

- [ ] **Step 5: Run the visible DPR-1 foreground performance sample**

Use the browser skill to emulate `1920×1080` with device scale factor `1`, keep the tab visible and foreground, resume motion, and allow at least five seconds of warmup. Evaluate this exact sampler:

```js
await (async () => {
  const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
  const warmupStarted = performance.now()
  while (performance.now() - warmupStarted < 5000) await waitFrame()

  const planetMetrics = window.__planetSurfaceMetrics
  const planetMarker = planetMetrics.mark()
  const frameTimes = []
  let last = 0
  const started = performance.now()
  await new Promise(resolve => {
    const tick = now => {
      if (last) frameTimes.push(now - last)
      last = now
      if (now - started < 20000) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })

  const averageFrameMs = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
  return {
    sampleMs: performance.now() - started,
    visibilityState: document.visibilityState,
    devicePixelRatio,
    pageFps: 1000 / averageFrameMs,
    combinedLongFramePercent: frameTimes.filter(value => value > 24).length / frameTimes.length * 100,
    maxPageFrameMs: Math.max(...frameTimes),
    particle: window.__fluidParticleMetrics.snapshot(),
    planet: planetMetrics.snapshot(),
    planetSample: planetMetrics.measureSince(planetMarker)
  }
})()
```

Pass only when all are true:

```text
visibilityState === "visible"
devicePixelRatio === 1
planet.initialized === true
planet.running === true
planet.fallback === false
planet.visible === true and planet.pageVisible === true
planetSample.complete === true
planetSample.drawCount > 0
planetSample.p95DrawMs <= 4
planetSample.maxDrawMs <= 8
planetSample.over8msPercent === 0
planet.canvasWidth % 8 === 0 and planet.canvasHeight % 8 === 0
combinedLongFramePercent < 2
particle.fps >= 60
particle.qualityLevel === 2
particle.particleCount === 320
particle.layerCounts === { dust: 269, glint: 42, streak: 9 }
```

Record the full returned JSON. Headless Chrome, a background tab, virtual time, or a hidden window cannot satisfy this step.

- [ ] **Step 6: Optimize only through approved adaptive levers if the sample fails**

For a planet draw-budget failure, add a failing threshold/reuse test first, then reduce only hot-loop operations inside `renderProjectedFrame` or correct scheduling/history accounting inside `planet-surface.js`; do not reduce visual layers. For an initialization hitch observed before the formal sample, optimize only procedural arithmetic inside `fillTexturePixels`. For page long frames, verify the planet's active quality level and correct the quality-window/cadence implementation before lowering an approved maximum. Never change particle counts, DPR, quality, or source files.

Re-run:

```powershell
node --test test/planet-core.test.cjs test/planet-renderer-contract.test.cjs
npm run test:fresh
```

Then repeat the same visible 20-second sample until it passes.

- [ ] **Step 7: Commit evidence-driven visual/performance corrections if any**

If Task 7 changed tracked files:

```powershell
git add -- themes/fluid-particle/source/js/planet-core.js themes/fluid-particle/source/js/planet-surface.js themes/fluid-particle/source/css/space-scene.css test/planet-core.test.cjs test/stellar-scene-contract.test.cjs test/planet-renderer-contract.test.cjs
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "fix: polish realistic planet art and draw budget"
```

If no tracked file changed, do not create an empty commit.

---

### Task 8: Apply review gates, record verification, and prepare the implementation handoff

**Files:**
- Review: `themes/fluid-particle/layout/_partial/head.ejs`
- Review: `themes/fluid-particle/layout/_partial/space-scene.ejs`
- Review: `themes/fluid-particle/source/css/space-scene.css`
- Review: `themes/fluid-particle/source/js/planet-core.js`
- Review: `themes/fluid-particle/source/js/planet-surface.js`
- Review: `test/planet-core.test.cjs`
- Review: `test/planet-renderer-contract.test.cjs`
- Review: `test/stellar-scene-contract.test.cjs`
- Review: `test/theme-browser-behavior.test.cjs`
- Create: `docs/development/verification/2026-08-31-realistic-canvas-ringed-planet.md`

**Interfaces:**
- Consumes passing Tasks 1–7, four inspected screenshots, and the visible performance JSON.
- Produces zero unresolved high-priority design/interface/code findings, a fresh full verification run, one committed evidence report, and no push/deploy.

- [ ] **Step 1: Run the requested design skill reviews in the applicable order**

Use `frontend-design` for a final distinctive-visual critique and `web-design-guidelines` for accessibility, interaction, responsive, and interface compliance. The installed `vercel-react-best-practices` skill is React/Next-specific; because this approved Hexo implementation contains no React or Next.js, use it only to confirm that no React migration or React-specific rule applies, and do not introduce a framework or dependency to manufacture applicability.

For each valid source-checkable finding, first add a focused failing test, run it to confirm RED, implement the smallest fix, and re-run to GREEN. For a visual-only finding, record the failed viewport, capture a new numbered screenshot after the fix, and re-inspect it. Reject any suggestion that reintroduces a neon outline, flare, generic HUD ornament, extra control, remote asset, or particle change.

- [ ] **Step 2: Request a two-axis code/spec review before completion**

Invoke `superpowers:requesting-code-review`. Give the reviewer the fixed comparison range from the execution branch's merge base through current HEAD, the approved spec path, and these mandatory questions:

```text
Standards: Are the UMD modules isolated, allocation rules honored, observer/listener ownership exact, fallback safe, and tests mutation-sensitive?
Spec: Are all prominence/flare artifacts gone; texture/ring/light/palette/rotation/quality/blocker/responsive/performance requirements implemented; and particle behavior byte-for-byte protected?
```

Address every confirmed blocker or high-priority issue through RED/GREEN. Re-run the focused and full suites after fixes. Do not accept a review claim without locating the exact source/test evidence.

- [ ] **Step 3: Commit any evidence-backed review corrections before final verification**

If Steps 1–2 changed tracked implementation or test files, inspect `git diff --name-status`, stage only the reviewed files listed in this plan's File Structure, and run:

```powershell
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run test:fresh
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "fix: resolve realistic planet review findings"
```

If no tracked file changed, do not create an empty commit. Do not stage the verification report in this step.

After any production-code or CSS correction is committed, repeat the affected Task 7 visual inspection and always repeat its visible 20-second foreground performance sample so the retained screenshots/JSON describe the reviewed commit rather than an earlier one. A test-only correction requires the fresh automated suite but does not require new screenshots.

- [ ] **Step 4: Invoke verification-before-completion and run the final evidence commands**

Run freshly:

```powershell
npm run test:fresh
node --check themes/fluid-particle/source/js/planet-core.js
node --check themes/fluid-particle/source/js/planet-surface.js
git diff --exit-code 4093a71 -- themes/fluid-particle/source/js/particle-core.js themes/fluid-particle/source/js/particle-flow.js
git diff --exit-code 4093a71 -- package.json package-lock.json
git diff --exit-code 4093a71 -- source
git diff --exit-code 4093a71 -- _config.yml render.yaml tools
git diff --check
git status --short --branch
```

Recalculate normalized-LF hashes using the PowerShell block from Execution Preflight. Expected: full suite `fail 0`, `skipped 0`; both `node --check` commands exit `0`; all protected diffs are silent; dependency manifests, content, configuration, and publishing tools are unchanged; hashes match; no whitespace errors; the execution worktree is clean before the verification report is created in Step 5.

- [ ] **Step 5: Write the exact verification record**

Create `docs/development/verification/2026-08-31-realistic-canvas-ringed-planet.md` with the title `Realistic Canvas Ringed Planet Verification`, date `2026-08-31`, the exact tested branch and commit from `git branch --show-current` and `git rev-parse HEAD`, and the approved spec path.

Under `Automated Evidence`, paste the exact `npm run test:fresh` totals and duration, both syntax-check exit results, both normalized particle hashes, and the protected source/dependency diff exit results. Under `Visual Evidence`, list the absolute latest PNG path and pass result for each of the four acceptance viewports, followed by the completed visual checklist result. Under `Foreground Performance`, paste visibility, DPR, page FPS, combined long-frame percentage, the complete particle JSON, the complete planet snapshot JSON, the complete `planetSample` interval JSON, and the threshold result. Under `Review Gates`, record every frontend-design, web-design-guidelines, and code/spec review finding plus its resolution. End with `Scope` bullets stating that particle implementation, content/routes/publishing tools, dependencies/frameworks/assets, push, and deployment were unchanged or not performed.

Every value in the report must come from the current execution evidence; do not leave an example value or an unfilled field.

- [ ] **Step 6: Commit the verification record and run the final status check**

Run:

```powershell
git add -- docs/development/verification/2026-08-31-realistic-canvas-ringed-planet.md
git diff --cached --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "docs: record realistic planet verification"
git status --short --branch
```

Expected: verification documentation is committed; execution worktree is clean; no push or deployment occurs.

- [ ] **Step 7: Use finishing-a-development-branch for the user-owned integration choice**

Invoke `superpowers:finishing-a-development-branch` only after every gate above passes. Present the tested branch/commit, actual test totals, screenshot paths, performance numbers, and the available merge/integration options. Do not merge, push, publish, or delete the worktree without the user's explicit choice.

---

## Final Acceptance Checklist

- [ ] No prominence, flare, corona, old keyframe, old browser fixture, or hidden obsolete layer remains.
- [ ] The deterministic `1024×512` texture has warm mineral bands, cool night structure, fine seams, and one restrained wrapped vortex.
- [ ] Surface projection is spherical/oblate, uses `-10deg`, and differentially samples the unwrapped `70,000ms` phase with no `2π` jump.
- [ ] Fixed upper-left light, deep lower-right night side, limb darkening, and a thin lit-side cyan atmosphere remain static.
- [ ] Dust ring measures within all three approved ranges, remains static/dark, and has one restrained cyan edge with correct rear/front occlusion.
- [ ] Exactly two Canvas elements and four scene scripts occur on home; none occur on inner pages.
- [ ] Every pause/reduced/hidden/offscreen/fallback/resize/destroy combination passes and never catches up hidden time.
- [ ] Adaptive quality uses exact 120-redraw windows and approved desktop/mobile levels without touching particle quality.
- [ ] Both particle script hashes and every protected particle test remain unchanged.
- [ ] All four screenshots pass art, clearance, breakpoint, and overflow inspection.
- [ ] Visible DPR-1 performance meets planet, page-long-frame, and particle thresholds with recorded JSON.
- [ ] Fresh automated tests, syntax checks, mutation gate, design audits, and code/spec review all pass.
- [ ] Verification is committed; no dependency, content, publishing, push, or deployment change occurred.
