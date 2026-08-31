# Realistic Canvas Ringed Planet Design

**Date:** 2026-08-31
**Status:** Approved direction, implementation pending
**Theme:** 流体粒子 (`fluid-particle`)

## Context

The home hero currently presents a blue-violet high-energy ringed star. Its five external SVG prominences, clipped flare layer, bright cyan ring, and smooth neon bands make it read as an energy device or star rather than a believable planet.

The requested refinement replaces that art direction with a realistic ringed planet inspired by two user-supplied references. The references are visual guidance only. Their pixels, watermarks, identifiers, and external URLs must not become project assets.

This specification supersedes the prominence, flare, CSS-only surface, single-Canvas, and high-energy-star requirements in `2026-08-30-high-energy-ringed-star-design.md`. Requirements that protect the existing particle renderer, hero copy, accessibility controls, and responsive layout remain in force.

## Goals

- Make the hero body read immediately as a real, volumetric planet.
- Remove all prominences, flame tongues, corona arcs, and internal flare effects.
- Give the planet a procedurally generated, moving surface with visible mineral cloud bands, fine dark seams, and one restrained vortex.
- Preserve a cool blue-violet identity while adding warm sand and terracotta surface structure.
- Replace the luminous ring with a wide, dark dust ring whose only bright accent is a restrained cyan-blue lit edge.
- Keep the existing background particle flow, hero copy, routes, and content unchanged.
- Maintain smooth foreground animation and deliberate static fallbacks.

## Non-Goals

- Do not recreate either reference image pixel-for-pixel.
- Do not add bitmap textures, remote assets, watermarks, new npm dependencies, WebGL, workers, or third-party rendering libraries.
- Do not change article, archive, category, tag, navigation, or typography layouts.
- Do not change particle counts, particle trajectories, particle quality behavior, pointer behavior, or the existing particle Canvas visual contract.
- Do not add new controls. The existing background-motion button controls all continuous motion.

## Visual Direction

The result is a cool, shadowed gas giant crossed by warmer mineral cloud systems. It is not a blue neon sphere, an orange Sun, or a watercolor cutout.

### Palette

- deep-space black: `#070914`;
- night-side violet: `#17132c`;
- deep-ocean blue: `#163a57`;
- mineral violet: `#563459`;
- terracotta rose: `#b45f68`;
- warm sand highlight: `#f0d3b1`;
- restrained atmospheric cyan: `#68d9f4`.

Warm sand and terracotta occupy the main cloud bands. Blue and violet dominate the night side, gaps, seams, and lower-contrast layers. The palette must not be distributed evenly like a rainbow.

### Surface character

- Broad horizontal bands follow the shared planetary equator at `-10deg`.
- Bands vary in width, opacity, curvature, and edge roughness.
- Fine dark seams, small filaments, and localized breaks prevent the texture from becoming a set of smooth gradients.
- One large but restrained vortex appears away from the brightest highlight. It must remain subordinate to the whole planet and must not resemble an eye-shaped logo.
- The moving texture is visibly compressed near the limbs so it reads as wrapping around a sphere.
- The light source, night-side shadow, and atmospheric edge remain fixed while the texture rotates underneath them.

### Lighting

The fixed light layer sits above every moving surface pixel. It provides:

1. a soft upper-left warm highlight;
2. a deep lower-right night side;
3. subtle limb darkening;
4. a narrow cyan-blue atmospheric edge only on the lit side.

There is no uniform neon outline around the body. The atmosphere is a thin optical cue, not a halo.

### Dust ring

- Preserve the existing back/body/front occlusion model.
- Set the ring's outer horizontal diameter to `188%–194%` of the planet body width and its outer vertical diameter to `34%–38%` of the planet body width.
- At each major-axis endpoint, the visible dust belt is `7%–10%` of the planet body width thick; the inner opening remains transparent. “Wider ring” refers to both the outer diameter and this measurable belt thickness.
- Use layered low-contrast indigo, blue-gray, and neutral dust bands.
- Keep the ring body dark and partially transparent, with varied density rather than a solid bright stroke.
- Allow one thin cyan-blue lit edge at low opacity. Remove the strong violet rim, broad glow, and white outline.
- Keep the ring fully static; do not drift, pulse, breathe, expand, or wobble.

## Scene Structure

The scene remains decorative and `aria-hidden`. The required layer order is:

1. static scene stars;
2. unchanged full-hero `#particle-flow` Canvas;
3. planet halo;
4. rear dust-ring segment;
5. planet body with a static CSS fallback surface;
6. `#planet-surface` Canvas, clipped by the oblate planet body;
7. fixed planet light and atmospheric edge;
8. front dust-ring segment;
9. unchanged hero copy above the decorative scene.

The planet body keeps its current subtly oblate silhouette. The old `saturn-prominences` SVG, all `saturn-prominence` groups, `saturn-flares`, their keyframes, mobile overrides, pause selectors, and reduced-motion selectors are removed completely rather than hidden.

The home page contains exactly two Canvas elements: the protected background particle Canvas and the new planet-surface Canvas. Inner pages continue to load neither scene Canvas.

## Canvas Architecture

The new renderer is isolated from the particle renderer:

- `planet-core.js` owns deterministic periodic noise, seamless source-texture generation, projection lookup data, phase calculation, and quality-budget calculations.
- `planet-surface.js` owns DOM lookup, Canvas sizing, initialization, animation scheduling, pause states, visibility, resize handling, fallback, cleanup, and metrics.
- Neither module imports, mutates, or aliases `FluidParticleCore`, `FluidParticleRenderer`, `__fluidParticleMetrics`, or the particle quality state.
- The renderer uses a deterministic seed so automated screenshots and tests are reproducible.

### Source texture

Initialization creates one seamless `1024 × 512` equirectangular texture in a detached 2D Canvas. The source texture combines:

- a cool blue-violet base;
- warm sand, terracotta, and rose-gray latitude bands;
- three or four deterministic periodic noise fields for edge displacement and domain warping;
- thin dark seams and localized filaments;
- one non-symmetrical vortex copied across the horizontal boundary when needed to preserve the seam.

Expensive noise and path construction happen only during source-texture initialization. Adaptive quality changes rebuild projection data but reuse the same source texture. Neither operation runs inside the per-frame hot loop.

### Spherical projection

On a real output-size change, the renderer precomputes typed-array lookup data for every visible planet pixel. The mapping converts normalized disc coordinates to latitude and longitude and records the source row, base longitude, target offset, and limb coverage.

During animation, each rendered pixel advances longitude by the current global phase multiplied by a precomputed per-latitude speed factor, samples the cached seamless texture, and writes into reused `ImageData`. The speed factor varies continuously from `1.0` at the equator to `0.94` at both poles using `0.94 + 0.06 × cos²(latitude)`. The global base phase is an accumulated, unwrapped value whose `68–72 second` period is the equatorial reference period. Implementations must calculate `samplePhase = modulo(basePhase × latitudeSpeedFactor, 2π)`; they must not reduce `basePhase` modulo `2π` before multiplying by the latitude factor. This keeps every latitude continuous when the equator crosses its `2π` boundary. This required differential rotation makes seams and cloud bands shear gently without creating independent flare-like motion. The light direction is not baked into the moving texture; CSS lighting remains fixed above the Canvas.

The hot loop must not create arrays, objects, gradients, paths, timers, or DOM queries. `ImageData`, typed arrays, source texture buffers, and projection maps are reused.

The supported baseline is a detached HTML Canvas. An implementation may select `OffscreenCanvas` only behind feature detection while preserving identical output and fallback behavior. WebGL is intentionally excluded.

## Motion Language

- The equator completes one west-to-east rotation in `68–72 seconds`; this is the reference period used to advance the unwrapped global base phase.
- Every latitude uses the required `0.94–1.0` speed-factor lookup defined above, so high-latitude seams and bands rotate up to `6%` more slowly than the equator.
- Motion is continuous, time-based, and one-directional. It never alternates and never catches up after a pause.
- A frame-rate change must not change rotational speed.
- The vortex travels with its latitude rather than animating independently like a flare.
- Fixed lighting, atmosphere, ring geometry, and planet position do not rotate with the surface.

The page targets a smooth foreground presentation. The background particle renderer continues on its existing refresh loop. The planet renderer uses `requestAnimationFrame` for scheduling and an adaptive redraw cadence because its 70-second motion changes by less than a pixel between many display frames.

## Performance Budget

### Default quality

- The mobile policy applies when `matchMedia('(max-width: 760px)')` matches; all other widths use the desktop policy. A `768px` acceptance viewport therefore uses the desktop policy.
- desktop maximum planet backing dimension: `512px`;
- mobile maximum planet backing dimension: `320px`;
- desktop planet DPR cap: `1.5`;
- mobile planet DPR cap: `1.25`;
- desktop redraw target: up to `30 FPS`;
- mobile redraw target: up to `20 FPS`.

For a rendered planet width `cssWidth`, compute `effectiveDpr = min(devicePixelRatio, policyDprCap)`. The backing width is the smaller of the active quality level's maximum dimension and `cssWidth × effectiveDpr`, rounded to the nearest multiple of eight with a minimum of eight. The backing height uses the rendered planet aspect ratio and is rounded by the same rule. A resize rebuild occurs only when these rounded dimensions change.

The full page should remain responsive at the display refresh rate even when the slow planet texture redraws less often. The renderer measures only its own draw cost and degrades after a complete observation window, not after one slow frame.

### Adaptive levels

- desktop: `512/30 → 448/24 → 384/20`;
- mobile: `320/20 → 288/18 → 256/15`.

Quality restoration uses hysteresis so the renderer cannot oscillate between levels. The lowest level still retains all cloud, seam, vortex, lighting, and ring layers; only backing resolution and redraw cadence change.

One quality observation window contains `120` completed planet redraws. After the initial warmup window:

- degrade by one level when draw-time p95 exceeds `4ms` or more than `2%` of draws exceed `8ms`;
- restore by one level only after two consecutive windows whose draw-time average is at most `2.2ms`, p95 is at most `3.2ms`, and no draw exceeds `6ms`;
- make at most one quality change per completed window;
- preserve the quality-level ordinal across the `760px` breakpoint, mapping it to the corresponding desktop or mobile level;
- reset only the observation samples, not the selected level, when backing dimensions change.

On the same foreground test machine used for the existing theme, a 20-second 1920×1080 sample at effective DPR 1 must meet all of these conditions:

- particle source hashes remain unchanged;
- no planet draw exceeds `8ms` after warmup;
- planet draw-time p95 is at most `4ms`;
- combined page long frames over `24ms` remain below `2%`;
- the existing particle loop reports at least `60 FPS` with no quality collapse caused by the planet renderer.

## Lifecycle and State

### Initialization

- A CSS fallback planet is visible immediately, so the first paint never shows an empty disc.
- Planet initialization begins during idle time, with a timer fallback when `requestIdleCallback` is unavailable.
- The generated Canvas fades in once a complete first frame exists; partial texture rows are never exposed.
- Mounting is idempotent. Repeated initialization cannot create a second renderer, duplicate observers, or duplicate callbacks.

### Pause and visibility

`planet-surface.js` observes the existing scene state instead of adding a second click handler to the motion button.

- `.motion-paused`: freeze at the current phase and cancel the planet animation callback.
- `.particle-fallback`: freeze the planet because the existing motion button is hidden in this state.
- `prefers-reduced-motion: reduce`: render one deterministic static frame and never start continuous animation.
- `document.hidden`: stop scheduling work; resume from the preserved phase with a reset timestamp.
- offscreen planet: use `IntersectionObserver` to stop redrawing while the hero is outside the viewport.
- resize: coalesce size work and rebuild projection data only when the rendered planet size actually changes.

Continuous animation runs only when every blocker is clear:

```text
initialized
and not destroyed
and not .motion-paused
and not .particle-fallback
and not prefers-reduced-motion
and document is visible
and planet intersects the viewport
```

When any blocker becomes active, capture the current phase once, cancel the scheduled animation callback, and retain the rendered frame. Clearing one blocker does not resume while another remains. When the final blocker clears, schedule a new callback with an unset previous timestamp; the first callback establishes time without advancing phase, so no hidden-time catch-up occurs. A live reduced-motion change to `reduce` follows the same freeze rule and draws one deliberate static frame; changing back to `no-preference` resumes from the preserved phase only when all other blockers are clear.

### Failure handling

If Canvas, a 2D context, animation frames, texture generation, or projection setup fails:

- hide `#planet-surface`;
- add `.planet-fallback` to the scene;
- keep the CSS fallback planet, fixed lighting, atmosphere, and ring visible;
- leave `#particle-flow`, its control, and its metrics untouched;
- do not add `.particle-fallback` from the planet module;
- do not throw an uncaught error into the page.

## Responsive Behavior

- Layout uses the same `760px` breakpoint as the performance policy. Above `760px`, the planet retains the current right-side hero composition and keeps all decorative geometry clear of the copy; the `768×1024` acceptance viewport therefore uses this right-side composition rather than the lower mobile composition.
- At `760px` and below, the planet moves to the lower-right of the hero and reduces its CSS size without changing its internal art direction.
- Mobile uses a smaller backing budget but retains the same bands, vortex, dark seams, fixed light, atmosphere, and ring hierarchy.
- The wider ring must not create horizontal scrolling at `320px`, `768px`, `1440px`, or `1920px` viewport widths.
- The planet remains recognizably oblate and the ring retains clear rear/front occlusion at every acceptance viewport.
- No planet or ring pixel intersects the hero copy's visible bounding box.

## Accessibility

- Both scene Canvas elements remain decorative and inaccessible to assistive technology.
- The existing native motion button, label changes, focus treatment, and touch target stay unchanged.
- Reduced-motion mode contains no continuous Canvas or CSS scene animation.
- No flashing, high-frequency opacity changes, pulsing scale, or sudden luminance transitions are introduced.
- Failure and static modes preserve sufficient contrast for the hero copy because the decorative scene stays behind it.

## Testing Strategy

### Core unit tests

- deterministic texture generation from a fixed seed;
- exact horizontal periodicity and seam continuity;
- frame-rate-independent phase progression;
- exact per-latitude differential-speed values at the equator, intermediate latitudes, and poles;
- continuous per-latitude sampling while the unwrapped equatorial base phase crosses `2π`, including a regression assertion that high latitudes do not jump backward at that boundary;
- sphere-map bounds and limb exclusion;
- backing-size calculation at desktop, mobile, capped-DPR, and `760/768px` boundaries;
- quality changes only after complete 120-redraw windows and obeys the stated degrade/restore hysteresis;
- repeated buffers and output objects are reused by the hot path.

### DOM and visual contracts

- exactly one `#particle-flow` and one `#planet-surface` on the generated home;
- neither Canvas loads on inner pages;
- no prominence SVG, prominence group, flare layer, or obsolete keyframe remains;
- rear ring precedes the planet, fixed light follows the surface Canvas, and front ring follows the light;
- ring and surface share the one `-10deg` equatorial direction;
- particle JS hashes and `#particle-flow` CSS contract remain unchanged.

### Browser behavior

- initialization, idempotent remount, cleanup, resize coalescing, and observer ownership;
- manual pause/resume with preserved phase;
- initial and live reduced-motion changes;
- hidden/offscreen freeze and clean resume;
- Canvas/context/animation/initialization failure paths;
- adaptive resolution and cadence without touching particle quality;
- desktop and mobile geometry, hero-copy clearance, ring occlusion, and horizontal overflow.

### Visual and performance acceptance

Capture and inspect `1920×1080`, `1440×900`, `768×1024`, and `320×740` views. The result must show visible mineral bands, one restrained vortex, a stable light direction, a cool night side, a thin lit atmosphere, and a wide dark dust ring with one restrained cyan edge. It must not show any prominence, flame, flare, corona, uniform neon outline, watercolor splash, source watermark, or external-image artifact.

Run a foreground performance sample after warmup and record planet draw p95, maximum draw cost, particle FPS, combined long-frame percentage, quality level, Canvas dimensions, effective DPR, and page visibility.

## Completion Criteria

Implementation is complete only when:

1. the approved visual structure is present: no prominences or flares, a detailed cool/warm Canvas surface, fixed volumetric lighting, and a wide dark dust ring with one restrained cyan edge;
2. the approved motion and performance behavior is present: seamless `68–72s` rotation, required latitude differential, adaptive budgets, full pause semantics, and static fallbacks;
3. the approved responsive and acceptance behavior is present: two home scene Canvas elements, no inner-page scene Canvas, four acceptance viewports, no copy collision or overflow, and recorded foreground performance;
4. all old prominence and flare markup, styling, animation, mobile overrides, and tests are removed or replaced;
5. the deterministic Canvas surface is seamless, spherical, time-based, and visibly detailed;
6. fixed lighting, a thin lit-side atmosphere, and the ring's single restrained cyan edge make the body read as a planet;
7. the ring is wider, darker, dust-like, and correctly occluded;
8. pause, reduced-motion, hidden, offscreen, resize, failure, and destroy states behave as specified;
9. particle implementation and behavior are unchanged;
10. all fresh automated tests pass;
11. all four acceptance screenshots pass visual inspection;
12. the foreground performance budget passes with recorded evidence.
