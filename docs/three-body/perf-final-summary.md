# Final production compositor verification — 2026-09-27

The production `will-change: transform` declarations show a reversible frame-rate benefit in the same-browser A/B/A checks on both tested viewport sizes. Earlier shader comparisons across separate runs remain inconclusive because an immediate unchanged-baseline repeat demonstrated substantial time-dependent variation. The measured benefit below is attributed to toggling the two compositor hints, not to an independently proven shader speedup.

[Raw report](perf-compositor-final-2026-09-27T04-02-10-097Z/report.json) · [Reproduction script](perf-compositor-final.cjs)

The script verifies source/public SHA-256 equality for the controller, scene, and CSS before opening the browser. Each viewport uses one continuously running station-view homepage and three 2.5-second samples in each phase. A explicitly overrides canvas and body-label `will-change` with `auto!important`; B removes the override and uses the real production CSS; A2 restores the override. Computed styles and actual production frame counters are checked. Physics, timestep, trails, particles, events, and clock are unchanged.

| Viewport | A1 mean FPS | Production B mean FPS | A2 mean FPS | B range | B / mean of A1 and A2 |
|---|---:|---:|---:|---:|---:|
| 1440×900 | 8.64 | 16.35 | 8.37 | 15.53–17.14 | 1.92× |
| 390×844 | 13.81 | 22.06 | 12.09 | 21.16–22.70 | 1.70× |

The improvement appears with production layering and falls away after reverting to `auto` on both viewport sizes. These ratios describe this headless Chrome/SwiftShader, DPR 1, station-view experiment on the same Windows machine. They do not represent physical-phone, hardware-GPU, or all-camera performance promises. Normal physical evolution and seeded weather continue; each sample records the actual event strengths, elapsed time, simulation delta, and main-thread `Performance.getMetrics` values.

Both cases finished with zero console/shader errors and no simulation errors. The temporary CSS was removed and the production computed styles restored before closing both isolated browsers. No production file was edited by this verification task.

The B screenshots were captured outside the timed windows and visually inspected. The three star colors, planet, world trails, low-brightness nebula, observatory frame, and responsive controls remain visible; no blank rendering, regular noise stripes, or obvious nebula seam is visible in these frames.

- [Desktop production screenshot](perf-compositor-final-2026-09-27T04-02-10-097Z/production-1440.png)
- [Mobile-size production screenshot](perf-compositor-final-2026-09-27T04-02-10-097Z/production-390.png)

For the measurement history and limitations, see [baseline notes](perf-baseline-notes.md), [first candidate observations](perf-comparison.md), and [controlled diagnostic follow-up](perf-diagnostic-followup.md).
