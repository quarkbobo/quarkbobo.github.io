# 2026-09-27 performance baseline

Baseline source: `568689ad525485aa9930a32e4dc0870981d32687`. The five production JavaScript files matched their generated `public/js` files by SHA-256 before measurement. The unmodified scene is preserved in `perf-baseline-scene.mjs` for later A/B comparisons; it is served under its normal module URL by the test server.

Authoritative synchronized results: [report.json](perf-baseline-sync-2026-09-27T03-47-01-297Z/report.json). The same directory includes six fixed-state screenshots and two homepage screenshots. Initial exploratory results in `perf-baseline-2026-09-27T03-44-54-344Z` used `gl.finish()` alone: those `completeMs` numbers represent command submission, not completed rendering, and must not be used for a GPU speedup claim.

Run `node docs/three-body/perf-benchmark.cjs baseline-sync` before a change, then `node docs/three-body/perf-benchmark.cjs after` after generating matching production assets. Only one browser benchmark should run at a time. The `baseline*` label serves the preserved scene rather than a newly edited production scene.

## Measurement conditions

- Windows 11 `10.0.26200`, AMD Ryzen 9 8945HX, 32 logical CPUs.
- Headless Chrome 153, ANGLE Vulkan SwiftShader, device scale factor 1. This is software WebGL on this CPU, not a hardware GPU or a physical phone benchmark.
- Viewports: 1440×900 and 390×844. Fixed harness drawing buffers: 1376×513 and 364×456, respectively. Homepage uses its actual responsive canvas geometry, recorded separately in each sample.
- Real production `createScene`, `makeSystem`, `step`, `advanceBelt`, and `sampleTrails`; balanced initial system evolved to year 4 using the unchanged `1/240` step, 128 belt particles, 960 recorded trail points. No mocked physics, synthetic trajectories, changed timestep, or reduction of visual settings.
- Each fixed view receives 12 warm frames and two samples of 24 RAF-driven frames. Completion time includes `render`, `gl.finish`, and one-pixel `readPixels` to force synchronization; it includes readback/IPC overhead and is not a GPU timer query. CPU submission is separately recorded.
- Homepage samples are three consecutive 2.5-second normal-running windows per view. FPS uses the production renderer's frame counter, not just RAF callbacks. No synchronization/readback is added to these homepage frames. The scene evolves normally, so these are operating ranges rather than fixed-state A/B comparisons.
- Screenshots are outside timed windows. Both runs reported zero console errors; all measured physical states remained free of simulation errors.

## Baseline results

| Viewport | View | Completed frame median / p95 (ms) | Homepage actual render FPS range |
|---|---|---:|---:|
| 1440×900 | station | 13.1 / 13.7 | 10.7–11.7 |
| 1440×900 | planet | 9.7 / 10.4 | 14.9–18.3 |
| 1440×900 | star-a | 13.5 / 16.7 | 16.8–22.5 |
| 390×844 | station | 13.5 / 15.5 | 19.5–20.9 |
| 390×844 | planet | 9.2 / 10.3 | 20.7–23.4 |
| 390×844 | star-a | 11.0 / 12.9 | 23.4–39.8 |

Fixed-scene command submission medians are 0.4–0.6 ms, substantially below synchronized completion. A separate production numerical sample takes 21.4–24.1 ms per simulation year: core 3.1 ms, source-state clone 1.4–1.9 ms, and 128-particle belt 16.9–19.1 ms across 240 steps. Default numerical stepping therefore is not the leading candidate for the observed homepage frame interval. Homepage CPU script, task, layout, and heap observations are retained in the JSON; screenshot/render completion time should not be inferred from those main-thread counters.

## Highest-value candidates from read-only inspection

1. Replace repeatedly evaluated scalar `sin` hashes in the surface shader with a bounded precomputed noise texture. Preserve the four terrain octaves, three light sources, night mask, colors, and moving clouds. Surface appearance must be compared because interpolation/quantization changes can alter terrain.
2. Bake the static directional nebula into a fixed texture. Its current full-screen fragment shader recomputes trigonometric functions despite having no time-dependent shape; retain camera-direction lookup and the existing brightness control.
3. Only after measuring those changes, consider reducing unchanged DOM/status writes and full diagnostic allocations in the animation loop. The controller currently reads diagnostics, queries labels, and writes several text/attribute values each frame. These are measurable but lower-priority than the current software rendering cost.

No production file, integration step, or physical/civilization behavior was changed during this baseline task.
