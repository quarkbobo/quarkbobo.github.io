# High-energy ringed-star verification — 2026-08-30

This record covers the final responsive geometry, interaction, visual, performance, and particle-integrity gates for the high-energy ringed-star refinement.

## Automated verification

- `npm test`: 99 passed, 0 failed, 0 skipped after a fresh Hexo clean and build.
- `node --test test/theme-browser-behavior.test.cjs`: 10 passed, 0 failed, including the real generated-home geometry probe and its clipping regression.
- The geometry test's initial 320×740 RED result reported 0 visible prominence groups. After the mobile-only prominence sizing and static upward prominence-field shift, the same probe passed with 2 visible groups.
- At 1440×900, the final probe reported no horizontal overflow, 5 visible prominence groups, no prominence/copy intersections, and matching `-10deg` ring and surface angles.
- At the constrained 320×740 acceptance layout, the final probe reported no horizontal overflow, 2 visible prominence groups, no prominence/copy intersections, and matching `-10deg` ring and surface angles.
- The visible-group calculation intersects raw prominence bounds with the acceptance viewport and every overflow-clipping ancestor. Its synthetic sensitivity case proves that a 24×24 child with raw bounds inside the 320×740 viewport is excluded when its 1×1 `overflow: hidden` ancestor clips it completely.

## Viewport inspection

- 1920×1080: the five-event silhouette, upper-left light direction, continuous surface tracks, back/front ring occlusion, and hero-copy separation were visually intact; no horizontal scrolling was present.
- 1440×900: all 5 prominence groups remained visible and clear of the hero copy; the ring, surface, and fixed highlight direction remained coherent; no horizontal scrolling was present.
- 768×1024: the hero copy stayed legible, the star and ring retained their intended hierarchy, and no horizontal scrolling was present.
- 320×740: the first fold kept the copy unobstructed, the geometry probe found 2 visible limb-event groups, and no horizontal scrolling was present. The same 320×740 page was scrolled within the hero for the mobile comparison screenshot, where the star silhouette and ring occlusion remained readable.

The motion control was paused once during inspection: both surface tracks, the flare field, and the prominence groups froze together. Resuming restored movement without a visible layer reset. The Chrome contract independently confirmed five paused animation targets, five resumed targets, and preserved shared geometry.

## Reduced motion and fallback

- Reduced motion: the Chrome probe reported `animation-name: none` for both surface tracks, the flare field, and the prominence groups; the redundant motion control was hidden and scroll behavior was `auto`.
- Paused state: all five probed stellar animation targets reported `animation-play-state: paused` and returned to `running` after resume.
- Particle fallback: the Canvas was hidden, all stellar animation targets were paused, the static star composition remained available, and the motion control was hidden.

## Foreground particle performance

The preview was sampled in the foreground for 21 seconds at a 1920×1080 viewport. Document visibility was `visible`, effective `devicePixelRatio` was 1, and the Canvas pixel ratio was 1. `window.__fluidParticleMetrics.snapshot()` returned exactly:

```json
{
  "fps": 162.4,
  "averageFrameMs": 6.16,
  "longFramePercent": 0,
  "particleCount": 320,
  "layerCounts": {
    "dust": 269,
    "glint": 42,
    "streak": 9
  },
  "dpr": 1,
  "qualityLevel": 2
}
```

The same sample reported 5 prominence groups. This satisfies the required FPS ≥110, average frame time ≤10 ms, long-frame percentage <2%, quality level 2, and exact particle/layer counts.

## Particle-source integrity

- `themes/fluid-particle/source/js/particle-core.js`: `A16D193E8874DF1248532458B3114AC0393B746431EF2559C5A2A2035B5F11E0`
- `themes/fluid-particle/source/js/particle-flow.js`: `45982BE65E5F465C730DEA7E3E1FCC8FCBC93F6B9C238B346C11F028FD116D2A`
- `git diff d9190d2 -- themes/fluid-particle/source/js/particle-core.js themes/fluid-particle/source/js/particle-flow.js` produced no output.

## Screenshot evidence

The inspected screenshots are outside the repository:

- `C:\Users\Lenovo\AppData\Local\Temp\high-energy-ringed-star-2026-08-30\desktop-1920x1080.png`
- `C:\Users\Lenovo\AppData\Local\Temp\high-energy-ringed-star-2026-08-30\desktop-1440x900.png`
- `C:\Users\Lenovo\AppData\Local\Temp\high-energy-ringed-star-2026-08-30\tablet-768x1024.png`
- `C:\Users\Lenovo\AppData\Local\Temp\high-energy-ringed-star-2026-08-30\mobile-320x740.png`
- `C:\Users\Lenovo\AppData\Local\Temp\high-energy-ringed-star-2026-08-30\mobile-320x740-scene.png`
