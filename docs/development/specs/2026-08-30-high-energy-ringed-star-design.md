# High-Energy Ringed Star Design

**Date:** 2026-08-30
**Status:** Approved direction, implementation pending
**Theme:** 流体粒子 (`fluid-particle`)

## Context

The home hero already contains a blue-violet Saturn-like body, a two-part ring, a fixed light layer, and a Canvas particle flow. The current surface detail only drifts a few percent back and forth and is tilted differently from the ring, so it reads as a floating overlay rather than a rotating celestial body.

The requested refinement is a more dramatic, high-energy star: the sphere should rotate parallel to the ring, carry animated plasma patterns, and show prominent limb flares. The existing particle composition, particle motion, density, and renderer must remain unchanged.

## Visual Direction

The result is a fictional blue-violet high-energy star with a Saturn-like ring, not a literal orange Sun and not a scientifically exact Saturn. It should retain the site's restrained deep-space palette while making the celestial body feel active and alive.

- Preserve the existing dark navy background, cyan ring, violet atmosphere, and white-blue highlight.
- Keep the ring as the clearest silhouette cue. It continues to pass behind and in front of the body.
- Make the limb prominences deliberately asymmetrical. The strongest loops sit on the upper-right and right edge, with a smaller lower-edge event. The left edge stays quieter so the hero copy remains legible.
- Use four to six irregular prominence loops with a broad translucent body and a brighter narrow core. They may extend clearly beyond the sphere but must stay inside the hero's visual safe area.
- Add moving gas bands, magnetic filaments, bright flare knots, and one restrained storm-like feature inside the sphere.
- Keep the fixed highlight and fixed night-side shading above the moving textures. This makes the moving patterns read as planetary rotation under a stable light source.

## Motion Language

The ring angle is the single source of truth for the body's equatorial direction. The ring and all rotating surface layers use the same `-10deg` axis.

### Surface rotation

- A broad gas-band layer completes a seamless, one-way visual loop in about 26 seconds.
- A finer magnetic-filament layer travels in the same direction on a slower 38–44 second loop.
- The two layers use different feature spacing and phase so the surface does not look like one flat texture sliding across a disc.
- The motion is continuous and linear, never alternating. Loop endpoints must be visually identical so there is no snap or pause.
- Only compositor-friendly transforms and occasional opacity changes may animate. Background position, box shadow, blur radius, and layout properties must not animate.

### Prominence activity

- Prominence arcs are authored as inline SVG paths so their shapes can be irregular and controlled without a second renderer.
- Every animated SVG group declares `transform-box: fill-box` and an explicit `transform-origin` at its visual attachment point on the stellar limb. This prevents browsers from scaling a flare around the full SVG viewport.
- Individual groups breathe on offset 6–12 second cycles using small transforms and opacity changes. They do not rotate around the whole sphere as a rigid crown.
- Larger events expand away from the limb and settle back; smaller arcs flicker more gently. At least one large loop remains visible at all times so the requested high-energy silhouette is persistent.
- Glow may be static, but filter values must not animate.

The total effect should be energetic in shape but calm in tempo. It must not compete with reading or produce strobing.

## Layering and Structure

The existing hero and particle Canvas remain intact. The Saturn markup gains only the visual layers required for the star:

1. halo;
2. rear ring;
3. SVG prominence field behind the body, with the sphere masking the inner portions of its paths;
4. sphere base;
5. two rotating CSS surface-texture layers and a restrained flare-knot layer, clipped to the sphere;
6. fixed highlight/night-side shading;
7. front ring;
8. unchanged particle Canvas in its existing scene layer.

The scene remains decorative and `aria-hidden`. No new interactive control is introduced. Existing pause behavior controls both the Canvas and every new CSS/SVG animation through the scene's `motion-paused` state. If the particle renderer enters its existing `particle-fallback` state before it can bind the motion button, CSS freezes every star animation automatically and hides the now-inoperative button through the existing hero/scene relationship; this preserves a static decorative scene without changing the particle renderer or adding another event listener.

## Responsive Behavior

- Desktop keeps the current right-side composition and protects the text area from flare overlap.
- Tablet and mobile keep the current lower-right planet placement. Prominence scale is reduced slightly, but the strongest outer loop stays visible.
- No prominence, transformed surface layer, or SVG viewport may create horizontal scrolling.
- The star must remain recognizable at 320 px width, including a readable ring silhouette and at least two visible limb events.
- At the desktop and 320 px acceptance viewports, no visible SVG prominence group may intersect the hero-copy bounding box. At least two distinct prominence groups—not the broad body and bright core of the same event—must have non-zero visible bounds inside the viewport.

## Accessibility and User Control

- When the visitor pauses background motion, both surface layers and every prominence group stop at their current frames and resume without resetting.
- Under `prefers-reduced-motion: reduce`, all continuous star animations are removed. The static frame still shows the ring, layered surface, and prominent flares.
- In the existing particle-renderer fallback state, the new star animations are frozen by CSS and the unbound motion button is hidden even though the Canvas lifecycle and its control binding were not created.
- The existing motion-toggle label, focus behavior, and hit target remain unchanged.
- No rapid flashes, high-frequency opacity pulses, or abrupt scale changes are allowed.

## Performance Boundary

- Do not modify `particle-core.js`, `particle-flow.js`, particle counts, quality adaptation, or Canvas drawing behavior. Their pre-refinement SHA-256 values are `A16D193E8874DF1248532458B3114AC0393B746431EF2559C5A2A2035B5F11E0` and `45982BE65E5F465C730DEA7E3E1FCC8FCBC93F6B9C238B346C11F028FD116D2A`, respectively.
- Do not change the markup or computed visual contract of `#particle-flow`, `.particle-fallback #particle-flow`, or the existing desktop/mobile Canvas opacity rules. Do not transform the `space-scene` parent that defines the Canvas coordinate system.
- Do not add another Canvas, WebGL context, animation loop, event listener, timer, or per-frame JavaScript calculation.
- Keep SVG path count small and animate groups rather than individual points.
- Prefer `transform` and `opacity`; keep blur/drop-shadow static and modest.
- Preserve the existing foreground performance target. On the same machine at 1920×1080, device pixel ratio 1, and a foreground sample of at least 20 seconds, the result must sustain at least 110 FPS, no more than 10 ms average frame time, and less than 2% of frames over 24 ms. The pre-refinement reference was 136.2 FPS, 7.34 ms average, and 0% long frames.

## Verification and Acceptance

Implementation is complete only when all of the following are true:

1. The ring and rotating surface layers use one shared equatorial-angle value.
2. Surface features travel continuously in one direction, parallel to the ring, with no alternating drift or visible loop seam.
3. The star has clearly visible, asymmetric blue-violet prominences beyond its upper-right, right, and lower edges.
4. The sphere retains a fixed light direction while its surface patterns move, producing an obvious rotation cue.
5. Pause and resume control every new animation, and reduced-motion mode leaves a deliberate static composition.
6. Renderer fallback freezes every new animation and hides the unbound motion button without a new JavaScript listener.
7. Every animated SVG group has a fill-box transform reference and a limb-local transform origin.
8. Animation keyframes are limited to transform and opacity.
9. Particle source hashes and the Canvas visual contract are unchanged from the pre-refinement baseline.
10. Fresh build and automated tests pass.
11. Desktop, tablet, and 320 px mobile views have no horizontal overflow. Browser geometry checks confirm that visible prominence groups do not intersect the hero copy and that at least two distinct limb events remain visible at the desktop and 320 px acceptance viewports.
12. A foreground browser run meets the stated FPS, average-frame, and long-frame thresholds.
