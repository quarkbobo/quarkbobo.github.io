# 2026-09-27 first optimization comparison

The first texture-based shader candidate did **not demonstrate a performance improvement** in this initial cross-run comparison. A later immediate rerun of the unchanged baseline also became much slower, confirming substantial time-dependent measurement drift. Therefore the numerical differences below are descriptive observations, **not evidence that this candidate caused either improvement or regression**. See [the controlled follow-up](perf-diagnostic-followup.md) for the baseline rerun and same-page CSS A/B/A result. These measurements concern software SwiftShader on this machine, not a hardware GPU or physical phone.

- [Baseline report](perf-baseline-sync-2026-09-27T03-47-01-297Z/report.json), scene SHA-256 `adc541d2178f6d977ae7aa4b7658229fba9d426f2028af455d981c70dcc29e41`.
- [Candidate report](perf-after-2026-09-27T03-52-15-216Z/report.json), scene SHA-256 `286ac9044d538355746206a879c357ef6d92bab19530fd7a8a935c1d4948f859`.
- [Machine-readable comparison](perf-comparison.json).

Both runs use the same script, viewport, fixed state, 48 measured frames per view, unchanged integration step, and `gl.finish` plus one-pixel readback. All six fixed camera position/quaternion pairs match exactly. The generated assets matched source before the candidate run. Both runs have zero recorded console/shader errors. Texture counts change from 1 to 3, consistent with the added shared noise and nebula maps.

| Viewport | View | Before median ms | After median ms | Change (higher is slower) | Homepage FPS before → after |
|---|---|---:|---:|---:|---|
| 1440×900 | station | 13.1 | 13.2 | +0.8% | 10.7–11.7 → 10.6–11.2 |
| 1440×900 | planet | 9.7 | 12.7 | +30.9% | 14.9–18.3 → 14.4–18.1 |
| 1440×900 | star-a | 13.5 | 13.1 | −3.0% | 16.8–22.5 → 12.5–20.8 |
| 390×844 | station | 13.5 | 17.2 | +27.4% | 19.5–20.9 → 14.0–15.5 |
| 390×844 | planet | 9.2 | 12.5 | +35.9% | 20.7–23.4 → 16.0–17.3 |
| 390×844 | star-a | 11.0 | 13.7 | +24.5% | 23.4–39.8 → 18.5–28.0 |

The homepage evolves during sampling, so its ranges provide normal-use context rather than exact-state shader attribution. The fixed-state samples are the direct comparison. Synchronization adds overhead, which is retained consistently in both runs.

All six candidate fixed screenshots were visually inspected. None is blank, and no regular noise stripes or obvious sky seam appears in these three camera directions. The planet, trails, starfield, and nebula remain visible. The stars now have conspicuous high-contrast white granulation over most of their disks; their previously smooth central brightness is replaced with a dense speckled texture. These views do not establish seamlessness at every possible camera angle.

Example same-state images:

| View | Before | Candidate |
|---|---|---|
| Desktop planet | [before](perf-baseline-sync-2026-09-27T03-47-01-297Z/fixed-1440-planet.png) | [candidate](perf-after-2026-09-27T03-52-15-216Z/fixed-1440-planet.png) |
| Desktop star A | [before](perf-baseline-sync-2026-09-27T03-47-01-297Z/fixed-1440-star-a.png) | [candidate](perf-after-2026-09-27T03-52-15-216Z/fixed-1440-star-a.png) |
| Mobile station | [before](perf-baseline-sync-2026-09-27T03-47-01-297Z/fixed-390-station.png) | [candidate](perf-after-2026-09-27T03-52-15-216Z/fixed-390-station.png) |

The benchmark browser was closed after the run. No production files were edited during measurement.
